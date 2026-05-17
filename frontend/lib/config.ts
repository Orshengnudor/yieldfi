import { http, createConfig } from 'wagmi';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

// Define Arc testnet chain (Chain ID 5042002)
export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://scan.testnet.arc.network' },
  },
  testnet: true,
} as const;

// Create the wagmi config using RainbowKit's helper
export const config = getDefaultConfig({
  appName: 'YieldFi',
  projectId: '04d8026768c2021f104b176da04e6f11', // You will replace this temporarily
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
});