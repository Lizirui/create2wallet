import type { Address } from "viem";

export const EIP712_NAME = "Create2Wallet";
export const EIP712_VERSION = "1";

export const executeRequestTypes = {
  ExecuteRequest: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "dataHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const executeBatchRequestTypes = {
  ExecuteBatchRequest: [
    { name: "payloadHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function buildDomain(chainId: number, verifyingContract: Address) {
  return {
    name: EIP712_NAME,
    version: EIP712_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

