// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Create2Wallet.sol";

/**
 * @title WalletFactory
 * @notice
 *  使用 CREATE2 部署 Create2Wallet 并支持「预计算地址」的工厂合约。
 *
 *  重点能力：
 *   - deployWallet：真正通过 CREATE2 在链上部署 Create2Wallet
 *   - computeAddress：基于 CREATE2 的公式，离线推导出未来将要部署的钱包地址
 *
 *  为什么要用 CREATE2：
 *   - 地址只依赖：factory 地址 + salt + initCodeHash
 *   - 只要三者保持不变，多次部署得到的钱包地址是确定且可预测的
 *   - 可以在「还没部署钱包」之前，就先把这个地址展示给用户或绑定到业务逻辑中
 */
contract WalletFactory {
    /// @notice 成功部署一个新钱包时发出
    /// @param wallet 新钱包地址（Create2Wallet 实例）
    /// @param owner 该钱包的 owner 地址
    /// @param salt 用于 CREATE2 的 salt（部署人与 computeAddress 时需保持一致）
    event WalletDeployed(address indexed wallet, address indexed owner, bytes32 salt);

    /**
     * @notice 使用 CREATE2 部署钱包
     * @param owner 钱包 owner
     * @param salt 用于 CREATE2 的 salt（调用方自选，保证在本 factory 内不冲突即可）
     * @return wallet 新部署的钱包地址
     *
     * 实现说明：
     *  - Solidity 原生语法：new Create2Wallet{salt: salt}(owner)
     *    底层会走 CREATE2，salt 为 bytes32
     *  - 部署成功后，发出 WalletDeployed 事件，方便前端/索引服务追踪
     */
    function deployWallet(address owner, bytes32 salt) external returns (address wallet) {
        wallet = address(
            new Create2Wallet{salt: salt}(owner)
        );

        emit WalletDeployed(wallet, owner, salt);
        return wallet;
    }

    /**
     * @notice 预计算在本 factory 中、给定 owner + salt 时，将会部署出的钱包地址（本函数本身不会部署）
     * @param owner 钱包 owner（必须与 deployWallet 时使用的 owner 一致，否则地址会不同）
     * @param salt 与 deployWallet 使用相同的 salt（bytes32）
     * @return 预测出的钱包地址
     *
     * 实现说明：
     *  - CREATE2 地址计算公式：
     *      address = keccak256(0xff ++ factoryAddress ++ salt ++ keccak256(initCode))[12:]
     *  - 其中 initCode = Create2Wallet 的 creationCode + 构造函数参数编码
     *  - 只要 factoryAddress/salt/initCode 三者不变，返回地址就是确定的
     */
    function computeAddress(address owner, bytes32 salt) external view returns (address) {
        // Create2Wallet 的字节码（不含构造参数）
        bytes memory creationCode = type(Create2Wallet).creationCode;

        // 构造函数参数（这里仅有 owner），需要与 deployWallet 中 new 时保持一致
        bytes memory constructorArgs = abi.encode(owner);

        // 完整 initCode = creationCode + constructorArgs
        bytes memory initCode = abi.encodePacked(creationCode, constructorArgs);
        bytes32 initCodeHash = keccak256(initCode);

        // 对照 CREATE2 规范拼接输入，计算出将要部署的地址
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)
        );

        return address(uint160(uint256(hash)));
    }
}
