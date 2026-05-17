// Arc testnet chain ID
export const ARC_TESTNET_CHAIN_ID = 5042002;

// Official USDC address on Arc (native token with ERC-20 interface)
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

// Our deployed Vault contract address
export const VAULT_ADDRESS = "0xB58dDc052bE76AeA49603dA35f2836fd4C49e84e";

// USDC decimals (6 on Arc)
export const USDC_DECIMALS = 6;

// Vault share token decimals (standard 18 for ERC4626)
export const VAULT_DECIMALS = 6;

export const SWAP_ADDRESS = "0x93aE5DA71A301D181009D6a1322FB62AE017817C";
export const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

export const FEE_DISTRIBUTOR_ADDRESS = "0x0245C00bF38B4Ec12d83148Fc2E08dCeBaB93a18";

// TODO: deploy Referral.sol and update this address
export const REFERRAL_ADDRESS = "0x3bA7dbB334b9dbb284EF4C80aB9dC8e74fe98Dc7" as `0x${string}`;

// ─── Arc Explorer ──────────────────────────────────────────────────────────
export const ARCSCAN_URL = "https://testnet.arcscan.app";
export const ARCSCAN_TX = (hash: string) => `${ARCSCAN_URL}/tx/${hash}`;
export const ARCSCAN_ADDR = (addr: string) => `${ARCSCAN_URL}/address/${addr}`;

// ─── Arc RPC ───────────────────────────────────────────────────────────────
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";

// ─── ERC-8004 Identity & Reputation Registries (Arc Testnet) ──────────────
// Ref: https://developers.circle.com/arc/docs/erc-8004-identity
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
