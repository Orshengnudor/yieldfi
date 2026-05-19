// Arc testnet chain ID
export const ARC_TESTNET_CHAIN_ID = 5042002;

// Official USDC address on Arc (native token with ERC-20 interface)
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

// USDC decimals (6 on Arc)
export const USDC_DECIMALS = 6;

// Vault share token decimals (standard 18 for ERC4626)
export const VAULT_DECIMALS = 6;

// ─── Deployed Contract Addresses ──────────────────────────────────────────
export const VAULT_ADDRESS    = "0x0c5155Fa15f973f1BEF5F8223EC80dbBf21671Ab";
export const SWAP_ADDRESS     = "0xeDD340a940f8203327c42FC976D0d055c31E7A5f";
export const REFERRAL_ADDRESS = "0x8EBaFf9998b179D366Fc2Dd2f08D9B76899cEa45" as `0x${string}`;
export const STAKING_ADDRESS  = "0x880c369FC64339841DCc7700A11feB2D28270FCA";
export const POINTS_TRACKER_ADDRESS = "0x82fFAA304D6b81406b63718AdCC7509CdD01ef8e";
export const FEE_DISTRIBUTOR_ADDRESS = "0x0245C00bF38B4Ec12d83148Fc2E08dCeBaB93a18";

// Tokens
export const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

// ─── Arc Explorer ──────────────────────────────────────────────────────────
export const ARCSCAN_URL = "https://testnet.arcscan.app";
export const ARCSCAN_TX = (hash: string) => `${ARCSCAN_URL}/tx/${hash}`;
export const ARCSCAN_ADDR = (addr: string) => `${ARCSCAN_URL}/address/${addr}`;

// ─── Arc RPC ───────────────────────────────────────────────────────────────
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";

// ─── ERC-8004 Identity & Reputation Registries (Arc Testnet) ──────────────
export const ERC8004_IDENTITY_REGISTRY   = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as `0x${string}`;
export const ERC8004_REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as `0x${string}`;
export const ERC8004_VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as `0x${string}`;

// ─── Circle USDC token ID for AppKit bridge/send ──────────────────────────
export const CIRCLE_USDC_TOKEN_ID = "USDC";

// ─── Supported chains for bridge ──────────────────────────────────────────
export const BRIDGE_CHAINS = [
  { id: "ARC-TESTNET", label: "Arc Testnet", chainId: 5042002 },
  { id: "ETH-SEPOLIA", label: "Ethereum Sepolia", chainId: 11155111 },
  { id: "BASE-SEPOLIA", label: "Base Sepolia", chainId: 84532 },
  { id: "AVAX-FUJI",   label: "Avalanche Fuji",  chainId: 43113 },
];

// ─── Tier Thresholds ───────────────────────────────────────────────────────
export const TIER_THRESHOLDS = {
  BRONZE:   0,
  SILVER:   500,
  GOLD:     2000,
  PLATINUM: 5000,
  CHAMPION: 10000,
} as const;

export type Tier = keyof typeof TIER_THRESHOLDS;

export function getTier(points: number): Tier {
  if (points >= TIER_THRESHOLDS.CHAMPION) return "CHAMPION";
  if (points >= TIER_THRESHOLDS.PLATINUM) return "PLATINUM";
  if (points >= TIER_THRESHOLDS.GOLD)     return "GOLD";
  if (points >= TIER_THRESHOLDS.SILVER)   return "SILVER";
  return "BRONZE";
}
