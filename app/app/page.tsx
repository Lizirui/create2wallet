"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useSignTypedData,
} from "wagmi";
import type { Address } from "viem";
import { formatEther, keccak256, padHex } from "viem";
import {
  FACTORY_ADDRESS,
  SEPOLIA_CHAIN_ID,
  walletFactoryAbi,
  create2WalletAbi,
} from "../lib/contracts";
import { buildDomain, executeRequestTypes } from "../lib/eip712";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Card, CardHeader, CardTitle } from "../components/ui/card";

function ConnectSection() {
  const { address, chainId, isConnected } = useAccount();
  const connectors = useConnectors();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const injectedConnector = connectors.find((c) => c.type === "injected");

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. 连接钱包</CardTitle>
      </CardHeader>
      {!isConnected ? (
        <Button
          onClick={() =>
            injectedConnector && connect({ connector: injectedConnector })
          }
          disabled={isPending || !injectedConnector}
          variant="primary"
        >
          {isPending ? "连接中..." : "连接浏览器钱包（MetaMask 等）"}
        </Button>
      ) : (
        <div className="space-y-3 text-sm text-slate-200">
          <div className="flex items-center gap-1.5">
            已连接账户：
            <span
              className="font-mono text-sm text-emerald-300"
              title={address}
            >
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
            </span>
            {address && (
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(address)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                title="复制地址"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>
            )}
          </div>
          <div>
            当前网络 chainId：{" "}
            <span className="font-mono">{chainId ?? "未知"}</span>{" "}
            {chainId !== SEPOLIA_CHAIN_ID && (
              <span className="text-amber-400">
                （建议切到 Sepolia：11155111）
              </span>
            )}
          </div>
          <Button onClick={() => disconnect()} variant="ghost" size="small">
            断开连接
          </Button>
        </div>
      )}
    </Card>
  );
}

function FactorySection({
  selectedWallet,
  onSelectWallet,
}: {
  selectedWallet: string | null;
  onSelectWallet: (addr: string) => void;
}) {
  const { address } = useAccount();
  const [ownerInput, setOwnerInput] = useState("");
  const [saltInput, setSaltInput] = useState("1");
  const [predicted, setPredicted] = useState<string | null>(null);
  const { writeContractAsync, isPending } = useWriteContract();

  const owner = ownerInput || address || "";

  // 使用 useReadContract + refetch 在点击按钮时按需预计算地址
  const saltNumRaw = BigInt(saltInput || "0");
  const saltNum = saltNumRaw >= 0n ? saltNumRaw : 0n;
  const salt = padHex(`0x${saltNum.toString(16)}`, { size: 32 });
  const { refetch: refetchComputed } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: walletFactoryAbi,
    functionName: "computeAddress",
    args: [
      (owner || "0x0000000000000000000000000000000000000000") as Address,
      salt,
    ],
    query: { enabled: false },
  });

  async function handleCompute() {
    if (!owner) return;
    const { data } = await refetchComputed();
    if (data && typeof data === "string") {
      setPredicted(data);
      onSelectWallet(data);
    }
  }

  async function handleDeploy() {
    if (!owner) return;
    const saltNumRaw = BigInt(saltInput || "0");
    const saltNum = saltNumRaw >= 0n ? saltNumRaw : 0n;
    const salt = padHex(`0x${saltNum.toString(16)}`, { size: 32 });
    const hash = await writeContractAsync({
      address: FACTORY_ADDRESS,
      abi: walletFactoryAbi,
      functionName: "deployWallet",
      args: [owner as Address, salt],
    });
    console.log("deploy tx hash", hash);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. CREATE2 工厂：预计算地址 & 部署钱包</CardTitle>
      </CardHeader>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Owner 地址（默认当前连接账户）</Label>
            <Input
              className="font-mono"
              placeholder="0x..."
              value={ownerInput}
              onChange={(e) => setOwnerInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Salt（整数，将映射为 bytes32）</Label>
            <Input
              placeholder="1"
              value={saltInput}
              onChange={(e) => setSaltInput(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCompute} variant="neutral" size="small">
              预计算钱包地址
            </Button>
            <Button
              onClick={handleDeploy}
              disabled={isPending}
              variant="primary"
              size="small"
            >
              {isPending ? "部署中..." : "部署钱包（deployWallet）"}
            </Button>
          </div>
        </div>
        <div className="space-y-3 text-sm text-slate-300">
          <div>
            <span className="text-slate-400">Factory 地址：</span>
            <div className="mt-1 font-mono break-all text-slate-200">
              {FACTORY_ADDRESS}
            </div>
          </div>
          {FACTORY_ADDRESS === "0x0000000000000000000000000000000000000000" && (
            <p className="text-amber-400">
              请配置 NEXT_PUBLIC_FACTORY_ADDRESS
              环境变量（部署后的工厂合约地址）
            </p>
          )}
          <div>
            <span className="text-slate-400">预计算/当前选择的钱包地址：</span>
            <div className="mt-1 font-mono break-all text-emerald-300">
              {selectedWallet ?? predicted ?? "（尚未选择）"}
            </div>
          </div>
          <p className="text-xs text-slate-400">
            提示：部署成功后，事件 WalletDeployed 中的 wallet
            字段应当与预计算地址一致。
          </p>
        </div>
      </div>
    </Card>
  );
}

type BasicTxFormProps = {
  wallet: string | null;
};

function BasicWalletSection({ wallet }: BasicTxFormProps) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [to, setTo] = useState("");
  const [valueEth, setValueEth] = useState("0.01");
  const [data, setData] = useState("0x");

  const [batchTo, setBatchTo] = useState("");
  const [batchValueEth, setBatchValueEth] = useState("0.01");

  async function handleExecute() {
    if (!wallet || !to || !to.startsWith("0x")) return;
    const value = ethersParseEtherSafe(valueEth);
    await writeContractAsync({
      address: wallet as Address,
      abi: create2WalletAbi,
      functionName: "execute",
      args: [to as Address, value, (data || "0x") as `0x${string}`],
    });
  }

  async function handleExecuteBatch() {
    if (!wallet || !batchTo || !batchTo.startsWith("0x")) return;
    const v = ethersParseEtherSafe(batchValueEth);
    await writeContractAsync({
      address: wallet as Address,
      abi: create2WalletAbi,
      functionName: "executeBatch",
      args: [[batchTo as Address], [v], ["0x"]],
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. 钱包直接执行（owner 发 tx）</CardTitle>
      </CardHeader>
      {!wallet ? (
        <p className="text-sm text-amber-400">
          请先在上方选择或部署一个钱包地址。
        </p>
      ) : (
        <>
          <div className="mb-4 text-sm text-slate-300">
            当前选择的钱包：{" "}
            <span className="font-mono text-emerald-300">{wallet}</span>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="font-medium text-slate-200">单笔 execute</div>
              <div className="space-y-2">
                <Label>目标地址 (to)</Label>
                <Input
                  className="font-mono text-xs"
                  placeholder="0x..."
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>金额 (ETH)</Label>
                <Input
                  placeholder="0.01"
                  value={valueEth}
                  onChange={(e) => setValueEth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>data（默认 0x 仅转账）</Label>
                <Textarea
                  className="font-mono text-xs"
                  placeholder="0x"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <Button
                onClick={handleExecute}
                disabled={isPending}
                variant="neutral"
                size="small"
              >
                执行 execute
              </Button>
            </div>
            <div className="space-y-4">
              <div className="font-medium text-slate-200">
                简化版 executeBatch（单笔示例）
              </div>
              <div className="space-y-2">
                <Label>目标地址 (to)</Label>
                <Input
                  className="font-mono text-xs"
                  placeholder="0x..."
                  value={batchTo}
                  onChange={(e) => setBatchTo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>金额 (ETH)</Label>
                <Input
                  placeholder="0.01"
                  value={batchValueEth}
                  onChange={(e) => setBatchValueEth(e.target.value)}
                />
              </div>
              <Button
                onClick={handleExecuteBatch}
                disabled={isPending}
                variant="neutral"
                size="small"
              >
                执行 executeBatch
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function Eip712Section({ wallet }: { wallet: string | null }) {
  const { address, chainId } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending } = useWriteContract();
  const [to, setTo] = useState("");
  const [valueEth, setValueEth] = useState("0.01");
  const [data, setData] = useState("0x");
  const [deadlineMinutes, setDeadlineMinutes] = useState("10");
  const [lastSignedBy, setLastSignedBy] = useState<string | null>(null);

  const { data: nonceData } = useReadContract({
    address: (wallet ??
      "0x0000000000000000000000000000000000000000") as Address,
    abi: create2WalletAbi,
    functionName: "getNonce",
    query: { enabled: !!wallet },
  });

  async function handleSignAndExecute() {
    if (!wallet || !address || !chainId || !to || !to.startsWith("0x")) return;
    const nonce = (nonceData as bigint | undefined) ?? 0n;
    const value = ethersParseEtherSafe(valueEth);
    const dataHex = data as `0x${string}`;
    const dataHash = keccak256(dataHex);
    const deadlineSec = BigInt(
      Math.floor(Date.now() / 1000) + Number(deadlineMinutes) * 60,
    );

    const domain = buildDomain(chainId, wallet as Address);
    const message = {
      to: to as Address,
      value,
      dataHash,
      nonce,
      deadline: deadlineSec,
    };

    const signature = await signTypedDataAsync({
      domain,
      types: executeRequestTypes,
      primaryType: "ExecuteRequest",
      message,
    });

    await writeContractAsync({
      address: wallet as Address,
      abi: create2WalletAbi,
      functionName: "executeBySignature",
      args: [
        to as Address,
        value,
        dataHex,
        deadlineSec,
        signature as `0x${string}`,
      ],
    });
    setLastSignedBy(address);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>4. EIP-712 结构化签名 + executeBySignature</CardTitle>
      </CardHeader>
      {!wallet ? (
        <p className="text-sm text-amber-400">
          请先选择一个钱包地址，然后再使用 EIP-712 验签执行。
        </p>
      ) : (
        <>
          <div className="mb-4 space-y-1 text-sm text-slate-300">
            <div>
              当前钱包地址：{" "}
              <span className="font-mono text-emerald-300">{wallet}</span>
            </div>
            <div>
              当前 nonce：{" "}
              <span className="font-mono">
                {nonceData !== undefined ? String(nonceData) : "加载中..."}
              </span>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>to（目标地址）</Label>
                <Input
                  className="font-mono text-xs"
                  placeholder="0x..."
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>value（ETH）</Label>
                <Input
                  value={valueEth}
                  onChange={(e) => setValueEth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>data（默认 0x 表示仅转账）</Label>
                <Textarea
                  className="font-mono text-xs"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>deadline（从现在起多少分钟内有效）</Label>
                <Input
                  value={deadlineMinutes}
                  onChange={(e) => setDeadlineMinutes(e.target.value)}
                />
              </div>
              <Button
                onClick={handleSignAndExecute}
                disabled={isPending}
                variant="primary"
                size="small"
              >
                使用 EIP-712 签名并执行（executeBySignature）
              </Button>
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              <p>
                流程：前端构造{" "}
                <span className="font-mono text-slate-200">ExecuteRequest</span>
                ，使用当前 nonce + deadline，调用浏览器钱包的 EIP-712
                签名，然后把签名和参数提交到合约的{" "}
                <span className="font-mono text-slate-200">
                  executeBySignature
                </span>
                。
              </p>
              <p className="text-xs text-slate-400">
                注意：合约内部会用当前 storage 中的 nonce
                参与哈希，因此前端必须读取{" "}
                <span className="font-mono">getNonce()</span> 后再签名。
              </p>
              {lastSignedBy && (
                <p className="text-xs text-emerald-300">
                  最近一次调用由签名者{" "}
                  <span className="font-mono">{lastSignedBy}</span> 发起。
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function SessionKeySection({ wallet }: { wallet: string | null }) {
  const { address, chainId } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const [sessionKeyAddr, setSessionKeyAddr] = useState("");
  const [limitEth, setLimitEth] = useState("0.5");
  const [validHours, setValidHours] = useState("1");

  const [queryKeyAddr, setQueryKeyAddr] = useState("");
  const { data: queried } = useReadContract({
    address: (wallet ??
      "0x0000000000000000000000000000000000000000") as Address,
    abi: create2WalletAbi,
    functionName: "sessionKeys",
    args: [queryKeyAddr as Address],
    query: {
      enabled: !!wallet && !!queryKeyAddr && queryKeyAddr.startsWith("0x"),
    },
  });

  async function handleAddSessionKey() {
    if (!wallet || !sessionKeyAddr || !sessionKeyAddr.startsWith("0x")) return;
    const limit = ethersParseEtherSafe(limitEth);
    const validUntil = BigInt(
      Math.floor(Date.now() / 1000) + Number(validHours) * 3600,
    );
    await writeContractAsync({
      address: wallet as Address,
      abi: create2WalletAbi,
      functionName: "addSessionKey",
      args: [sessionKeyAddr as Address, limit, validUntil],
    });
  }

  async function handleRemoveSessionKey() {
    if (!wallet || !sessionKeyAddr || !sessionKeyAddr.startsWith("0x")) return;
    await writeContractAsync({
      address: wallet as Address,
      abi: create2WalletAbi,
      functionName: "removeSessionKey",
      args: [sessionKeyAddr as Address],
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>5. Session Key 管理与体验</CardTitle>
      </CardHeader>
      {!wallet ? (
        <p className="text-sm text-amber-400">
          请先选择一个钱包地址，再进行 Session Key 授权与查询。
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="font-medium text-slate-200">授权 / 撤销</div>
            <div className="space-y-2">
              <Label>Session Key 地址</Label>
              <Input
                className="font-mono text-xs"
                placeholder="0x..."
                value={sessionKeyAddr}
                onChange={(e) => setSessionKeyAddr(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>总额度（ETH）</Label>
              <Input
                value={limitEth}
                onChange={(e) => setLimitEth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>有效期（小时）</Label>
              <Input
                value={validHours}
                onChange={(e) => setValidHours(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleAddSessionKey}
                variant="primary"
                size="small"
              >
                授权 Session Key
              </Button>
              <Button
                onClick={handleRemoveSessionKey}
                variant="ghost"
                size="small"
              >
                撤销 Session Key
              </Button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="font-medium text-slate-200">查询 Session Key</div>
            <div className="space-y-2">
              <Label>要查询的地址</Label>
              <Input
                className="font-mono text-xs"
                placeholder="0x..."
                value={queryKeyAddr}
                onChange={(e) => setQueryKeyAddr(e.target.value)}
              />
            </div>
            {queried && (
              <div className="space-y-1 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-xs">
                <div>
                  spendingLimit：{formatEther(queried[0])} ETH（原始：
                  {String(queried[0])} wei）
                </div>
                <div>
                  used：{formatEther(queried[1])} ETH（原始：
                  {String(queried[1])} wei）
                </div>
                <div>validUntil：{String(queried[2])}</div>
              </div>
            )}
            <p className="text-xs text-slate-400">
              提示：你可以在浏览器中导入 Session Key 的私钥，使用该地址连接本
              DApp，然后走一遍「EIP-712 签名 +
              executeBySignature」体验限权执行。
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function ethersParseEtherSafe(v: string): bigint {
  try {
    return BigInt(Math.floor(parseFloat(v || "0") * 1e18));
  } catch {
    return 0n;
  }
}

export default function Page() {
  const [wallet, setWallet] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <ConnectSection />
      <FactorySection selectedWallet={wallet} onSelectWallet={setWallet} />
      <BasicWalletSection wallet={wallet} />
      <Eip712Section wallet={wallet} />
      <SessionKeySection wallet={wallet} />
    </div>
  );
}
