// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Create2Wallet
 * @notice
 *  单 owner 智能合约钱包，阶段一能力包括：
 *   - 由 owner 发起的单笔执行：execute
 *   - 由 owner 发起的批量执行：executeBatch
 *   - 维护一个自定义 nonce 字段，为后续「EIP-712 结构化签名 + 合约验签执行」做准备
 *
 *  当前阶段的设计要点：
 *   - 只允许 owner 直接调用 execute / executeBatch，不涉及签名验签
 *   - nonce 仅作为状态字段暴露出去，还不会在执行时自增（留给阶段二的签名流使用）
 */
contract Create2Wallet {
    /// @dev 非 owner 调用受 onlyOwner 修饰的函数时抛出
    error OnlyOwner();

    /// @dev 批量执行中某一笔外部调用失败时抛出，index 为失败的下标
    error ExecuteFailed(uint256 index);

    /**
     * @notice 钱包的 owner 地址
     * @dev
     *  - 部署时由构造函数固定
     *  - 所有敏感操作都通过 onlyOwner 限制为 owner 才能调用
     */
    address public owner;

    /**
     * @notice 自定义 nonce
     * @dev
     *  - 阶段一只是占位，前端/测试可以读取
     *  - 在「签名 + 合约验签执行」阶段，会在验证成功后自增，用于防重放
     */
    uint256 public nonce;

    /// @notice 成功执行一笔外部调用时发出
    event Executed(address indexed to, uint256 value, bytes data);

    /// @notice 成功执行一批外部调用时发出，count 表示本次批量一共执行了多少笔
    event BatchExecuted(uint256 count);

    /**
     * @dev 访问控制修饰器：限制只有 owner 可以调用目标函数
     */
    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /**
     * @param _owner 钱包的初始 owner 地址
     * @dev 构造函数在部署合约时执行一次，用于把 EOA 绑定为该合约钱包的 owner
     */
    constructor(address _owner) {
        require(_owner != address(0), "owner zero");
        owner = _owner;
    }

    /**
     * @notice 执行一笔任意外部调用（可以是转账，也可以是合约函数调用）
     * @param to 目标地址（EOA 或 合约地址）
     * @param value 附带发送的 ETH 数量（单位 wei）
     * @param data 要发送的调用数据（对方合约函数选择器 + 参数 ABI 编码）
     * @return result 目标调用返回的原始字节数据
     *
     * 使用说明：
     *  - 只有 owner 可以调用（受 onlyOwner 修饰）
     *  - 内部通过 `call{value: value}(data)` 发起外部调用：
     *      - 如果只是转账，可让 data 为空字节串 \"\"
     *      - 如果是调用函数，则由前端/脚本事先 encode 好 data
     *  - 如果调用失败（success == false），会直接 revert 并回滚本次执行
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
     * @notice 批量执行多笔外部调用
     * @param targets 每一笔调用的目标地址数组
     * @param values 每一笔调用附带发送的 ETH 数组（与 targets 一一对应）
     * @param payloads 每一笔调用的 data 数组（与 targets 一一对应）
     *
     * 使用说明：
     *  - 三个数组长度必须完全一致，否则直接 revert(\"length mismatch\")
     *  - 会按顺序依次执行每一笔 call：
     *      - 某一笔失败时，抛出 ExecuteFailed(i)，整个批次全部回滚
     *      - 全部成功后，才会发出 BatchExecuted 事件
     *  - 适合一次性执行多笔转账、多笔合约调用等场景
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

    /**
     * @notice 返回当前 nonce（供前端展示或后续签名逻辑使用）
     */
    function getNonce() external view returns (uint256) {
        return nonce;
    }

    /**
     * @notice 接收 ETH 的回退函数
     * @dev 允许任何人向该钱包直接转账：
     *      - EOA 可直接 transfer/send/call value 到合约地址
     *      - 后续 owner 可以通过 execute/executeBatch 再把资金转出去
     */
    receive() external payable {}
}
