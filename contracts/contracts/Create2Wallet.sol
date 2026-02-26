// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Create2Wallet
 * @notice
 *  单 owner 智能合约钱包，具备以下能力：
 *
 *  1. 直接执行（仅 owner 发交易）
 *     - execute：单笔调用
 *     - executeBatch：批量调用
 *
 *  2. EIP-712 结构化签名 + 合约验签执行
 *     - 用户/ Session Key 在链下对「执行内容 + nonce + deadline」按 EIP-712 签名
 *     - 任何人可提交签名，调用 executeBySignature / executeBatchBySignature
 *     - 合约恢复 signer，校验后执行并自增 nonce，防重放
 *
 *  3. 自定义 nonce 管理
 *     - 所有「验签执行」共用一个 nonce，每次成功执行后自增
 *
 *  4. Session Key
 *     - owner 可授权若干 session key，并限定「总可用额度」与「过期时间」
 *     - Session key 仅在额度内、未过期时可代表 owner 通过验签执行
 */
contract Create2Wallet {
    // ============ 自定义错误 ============

    /// @dev 非 owner 调用仅允许 owner 调用的函数时抛出
    error OnlyOwner();

    /// @dev 批量执行中第 index 笔调用失败时抛出
    error ExecuteFailed(uint256 index);

    /// @dev 验签执行：签名者既不是 owner 也不是已授权的 session key
    error InvalidSigner();

    /// @dev 验签执行：请求已过期（block.timestamp > deadline）
    error Expired();

    /// @dev 验签执行：传入的 nonce 与当前 nonce 不一致（重放或乱序）
    error InvalidNonce();

    /// @dev Session key：已过期或额度不足
    error SessionKeyInvalid();

    // ============ 状态变量 ============

    /// @notice 钱包的 owner 地址，部署时由构造函数设定，拥有最高权限
    address public owner;

    /**
     * @notice 自定义 nonce，用于 EIP-712 验签执行的防重放
     * @dev
     *  - 每次 executeBySignature / executeBatchBySignature 成功执行后自增
     *  - 前端签名时必须使用当前 nonce，合约校验一致后才执行并 nonce++
     */
    uint256 public nonce;

    /**
     * @notice Session Key 的配置与用量
     * @dev
     *  spendingLimit：该 key 允许使用的总 ETH 额度（wei）
     *  used：已使用额度，每次验签执行成功后会增加
     *  validUntil：过期时间戳，block.timestamp > validUntil 后该 key 不可用
     */
    struct SessionKeyInfo {
        uint256 spendingLimit;
        uint256 used;
        uint256 validUntil;
    }

    /// @notice session key 地址 => 配置与用量
    mapping(address => SessionKeyInfo) public sessionKeys;

    // ============ EIP-712 常量（与前端签名保持一致） ============

    /// @dev EIP-712 Domain 的 typeHash
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );

    /// @dev 单笔执行的结构化数据类型
    bytes32 public constant EXECUTE_REQUEST_TYPEHASH =
        keccak256(
            "ExecuteRequest(address to,uint256 value,bytes32 dataHash,uint256 nonce,uint256 deadline)"
        );

    /// @dev 批量执行的结构化数据类型
    bytes32 public constant EXECUTE_BATCH_REQUEST_TYPEHASH =
        keccak256(
            "ExecuteBatchRequest(bytes32 payloadHash,uint256 nonce,uint256 deadline)"
        );

    /// @dev Domain 的 name，与前端/签名端一致
    string public constant EIP712_NAME = "Create2Wallet";

    /// @dev Domain 的 version
    string public constant EIP712_VERSION = "1";

    // ============ 事件 ============

    event Executed(address indexed to, uint256 value, bytes data);
    event BatchExecuted(uint256 count);
    event SessionKeyAdded(
        address indexed key,
        uint256 spendingLimit,
        uint256 validUntil
    );
    event SessionKeyRemoved(address indexed key);
    event ExecutedBySignature(
        address indexed signer,
        address to,
        uint256 value
    );
    event BatchExecutedBySignature(address indexed signer, uint256 count);

    // ============ 修饰器 ============

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ============ 构造函数 ============

    /**
     * @param _owner 钱包的初始 owner 地址（建议为 EOA）
     */
    constructor(address _owner) {
        require(_owner != address(0), "owner zero");
        owner = _owner;
    }

    // ============ 仅 owner 直接调用 ============

    /**
     * @notice 执行一笔任意外部调用（仅 owner 可调）
     * @param to 目标地址
     * @param value 附带的 ETH（wei）
     * @param data 调用数据（可为 0x 表示纯转账）
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyOwner returns (bytes memory) {
        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "execute failed");
        emit Executed(to, value, data);
        return result;
    }

    /**
     * @notice 批量执行多笔调用（仅 owner 可调）
     * @param targets 目标地址数组
     * @param values 每笔附带的 ETH 数组
     * @param payloads 每笔的 data 数组
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads
    ) external onlyOwner {
        require(
            targets.length == values.length &&
                targets.length == payloads.length,
            "length mismatch"
        );
        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, ) = targets[i].call{value: values[i]}(payloads[i]);
            if (!success) revert ExecuteFailed(i);
        }
        emit BatchExecuted(targets.length);
    }

    // ============ Session Key 管理（仅 owner） ============

    /**
     * @notice 授权一个 session key，限定额度和过期时间
     * @param key session key 的地址（通常为另一 EOA）
     * @param spendingLimit 该 key 可使用的总 ETH 额度（wei）
     * @param validUntil 过期时间戳（秒），block.timestamp <= validUntil 时有效
     */
    function addSessionKey(
        address key,
        uint256 spendingLimit,
        uint256 validUntil
    ) external onlyOwner {
        require(key != address(0), "key zero");
        sessionKeys[key] = SessionKeyInfo({
            spendingLimit: spendingLimit,
            used: 0,
            validUntil: validUntil
        });
        emit SessionKeyAdded(key, spendingLimit, validUntil);
    }

    /**
     * @notice 撤销某个 session key，撤销后该地址不能再通过验签执行
     */
    function removeSessionKey(address key) external onlyOwner {
        delete sessionKeys[key];
        emit SessionKeyRemoved(key);
    }

    // ============ EIP-712 验签执行 ============

    /**
     * @notice 根据 EIP-712 签名执行单笔调用；签名者必须是 owner 或有效的 session key
     * @param to 目标地址
     * @param value 附带的 ETH（wei）
     * @param data 调用数据
     * @param deadline 请求过期时间戳（秒）
     * @param signature 对 EIP-712 结构化数据的签名（65 字节 r+s+v）
     *
     * 前端/签名端需构造的 EIP-712 类型数据：
     *   - type: "ExecuteRequest"
     *   - 字段: to, value, dataHash = keccak256(data), nonce（当前 getNonce()）, deadline
     * 签名的 digest = keccak256("\x19\x01" || domainSeparator || hashStruct(ExecuteRequest))
     */
    function executeBySignature(
        address to,
        uint256 value,
        bytes calldata data,
        uint256 deadline,
        bytes calldata signature
    ) external returns (bytes memory) {
        if (block.timestamp > deadline) revert Expired();
        // 使用当前 storage 的 nonce 参与 structHash，调用方必须用 getNonce() 得到的值签名，否则恢复出的 signer 会不匹配
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTE_REQUEST_TYPEHASH,
                to,
                value,
                dataHash,
                nonce,
                deadline
            )
        );
        address signer = _recoverSigner(structHash, signature);
        _requireOwnerOrValidSessionKey(signer, value);

        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "execute failed");

        nonce++;
        if (sessionKeys[signer].validUntil != 0) {
            SessionKeyInfo storage sk = sessionKeys[signer];
            sk.used += value;
        }
        emit ExecutedBySignature(signer, to, value);
        emit Executed(to, value, data);
        return result;
    }

    /**
     * @notice 根据 EIP-712 签名执行批量调用；签名者必须是 owner 或有效的 session key
     * @param targets 目标地址数组
     * @param values 每笔附带的 ETH 数组
     * @param payloads 每笔的 data 数组
     * @param deadline 请求过期时间戳（秒）
     * @param signature 对 ExecuteBatchRequest 的 EIP-712 签名
     *
     * 结构化数据：payloadHash = keccak256(abi.encode(targets, values, payloads))，nonce，deadline
     */
    function executeBatchBySignature(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert Expired();
        require(
            targets.length == values.length &&
                targets.length == payloads.length,
            "length mismatch"
        );

        uint256 totalValue = 0;
        for (uint256 i = 0; i < values.length; i++) {
            totalValue += values[i];
        }

        bytes32 payloadHash = keccak256(abi.encode(targets, values, payloads));
        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTE_BATCH_REQUEST_TYPEHASH,
                payloadHash,
                nonce,
                deadline
            )
        );
        address signer = _recoverSigner(structHash, signature);
        _requireOwnerOrValidSessionKey(signer, totalValue);

        for (uint256 i = 0; i < targets.length; i++) {
            (bool success, ) = targets[i].call{value: values[i]}(payloads[i]);
            if (!success) revert ExecuteFailed(i);
        }

        nonce++;
        if (sessionKeys[signer].validUntil != 0) {
            SessionKeyInfo storage sk = sessionKeys[signer];
            sk.used += totalValue;
        }
        emit BatchExecutedBySignature(signer, targets.length);
        emit BatchExecuted(targets.length);
    }

    // ============ 内部：EIP-712 验签 ============

    /**
     * @dev 计算当前合约的 EIP-712 domainSeparator
     */
    function _domainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    keccak256(bytes(EIP712_NAME)),
                    keccak256(bytes(EIP712_VERSION)),
                    block.chainid,
                    address(this)
                )
            );
    }

    /**
     * @dev 根据 structHash 和 65 字节签名（r||s||v）恢复 signer 地址
     */
    function _recoverSigner(
        bytes32 structHash,
        bytes calldata signature
    ) internal view returns (address) {
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator(), structHash)
        );
        require(signature.length == 65, "bad sig len");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }

    /**
     * @dev 要求 signer 为 owner，或为已授权且未过期、额度足够的 session key
     */
    function _requireOwnerOrValidSessionKey(
        address signer,
        uint256 value
    ) internal view {
        if (signer == owner) return;
        SessionKeyInfo storage sk = sessionKeys[signer];
        if (sk.validUntil == 0) revert InvalidSigner();
        if (block.timestamp > sk.validUntil) revert SessionKeyInvalid();
        if (sk.used + value > sk.spendingLimit) revert SessionKeyInvalid();
    }

    // ============ 视图 ============

    /// @notice 返回当前 nonce，供前端构造签名使用
    function getNonce() external view returns (uint256) {
        return nonce;
    }

    /// @notice 返回当前链上的 EIP-712 domainSeparator
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    // ============ 接收 ETH ============

    receive() external payable {}
}
