import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const sepoliaRpc =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://rpc.sepolia.org";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(sepoliaRpc),
  },
  // 只启用 injected connector，避免自动引入 MetaMask SDK / WalletConnect 等重依赖
  connectors: [injected()],
  ssr: true,
});

