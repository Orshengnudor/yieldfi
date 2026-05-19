import { http } from 'wagmi';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

// Define Arc testnet chain (Chain ID 5042002)
export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public:  { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://scan.testnet.arc.network' },
  },
  testnet: true,
} as const;

// Create the wagmi config using RainbowKit's helper.
// pollingInterval: 15_000ms — Arc RPC is QuickNode rate-limited (3000 req/min).
// Default 4s polling blows through the quota fast; 15s keeps us well within limits.
export const config = getDefaultConfig({
  appName: 'YieldFi',
  projectId: '04d8026768c2021f104b176da04e6f11',
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
  },
  pollingInterval: 15_000,
});
