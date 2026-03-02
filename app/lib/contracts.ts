import type { Address } from "viem";

// Sepolia chain id，用于前端固定链
export const SEPOLIA_CHAIN_ID = 11155111;

// 工厂合约地址，从环境变量读取，方便你之后替换为真实部署地址
export const FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_FACTORY_ADDRESS as Address | undefined) ??
  "0x0000000000000000000000000000000000000000";

export const walletFactoryAbi = [
  {
    type: "function",
    name: "deployWallet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "wallet", type: "address" }],
  },
  {
    type: "function",
    name: "computeAddress",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const create2WalletAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "executeBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "payloads", type: "bytes[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addSessionKey",
    stateMutability: "nonpayable",
    inputs: [
      { name: "key", type: "address" },
      { name: "spendingLimit", type: "uint256" },
      { name: "validUntil", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "removeSessionKey",
    stateMutability: "nonpayable",
    inputs: [{ name: "key", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "sessionKeys",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "spendingLimit", type: "uint256" },
      { name: "used", type: "uint256" },
      { name: "validUntil", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "executeBySignature",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "executeBatchBySignature",
    stateMutability: "nonpayable",
    inputs: [
      { name: "targets", type: "address[]" },
      { name: "values", type: "uint256[]" },
      { name: "payloads", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

