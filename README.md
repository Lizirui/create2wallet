# create2wallet

单 owner 智能合约钱包，支持：

- **CREATE2 预计算地址**：通过 WalletFactory 在部署前算出钱包地址
- **EIP-712 结构化签名 + 合约验签执行**：链下签名后调用 `executeBySignature` / `executeBatchBySignature`（用户自己发 tx、自付 gas）
- **自定义 nonce 管理**：验签执行时校验并自增 nonce，防重放
- **批量交易执行**：`execute` / `executeBatch`，以及验签版的批量执行
- **Session Key**：owner 可授权 session key，限定额度与过期时间，在额度内可代 owner 验签执行

合约部署于 Sepolia 测试网；前端（Next.js）可部署于 Vercel。
