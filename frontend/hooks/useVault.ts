import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { VAULT_ADDRESS, USDC_ADDRESS, USDC_DECIMALS, VAULT_DECIMALS } from '@/lib/constants';

// Vault ABI (only the functions we need)
const VAULT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'assets', type: 'uint256', internalType: 'uint256' },
      { name: 'receiver', type: 'address', internalType: 'address' }
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      { name: 'assets', type: 'uint256', internalType: 'uint256' },
      { name: 'receiver', type: 'address', internalType: 'address' },
      { name: 'owner', type: 'address', internalType: 'address' }
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'totalAssets',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'convertToShares',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'convertToAssets',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'view'
  }
];

// USDC approval ABI (ERC20)
const USDC_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
];

export function useVault() {
  const { address } = useAccount();

  // Read total assets in vault (in USDC with 6 decimals)
  const { data: totalAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'totalAssets',
  });

  // Read user's yUSDC balance (shares, 18 decimals)
  const { data: userShares } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  // Convert shares to underlying assets (USDC)
  const { data: userAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: userShares ? [userShares] : undefined,
  });

  // USDC allowance for vault
  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
  });

  // Write contracts
  const { writeContract: approve, isPending: isApproving, data: approveHash } = useWriteContract();
  const { writeContract: deposit, isPending: isDepositing, data: depositHash } = useWriteContract();
  const { writeContract: withdraw, isPending: isWithdrawing, data: withdrawHash } = useWriteContract();

  // Wait for transactions
  const { isLoading: isApprovingTx } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isDepositingTx } = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: isWithdrawingTx } = useWaitForTransactionReceipt({ hash: withdrawHash });

  // Helper: approve USDC spend
  const approveUSDC = (amount: string) => {
    const amountRaw = parseUnits(amount, USDC_DECIMALS);
    approve({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, amountRaw],
    });
  };

  // Helper: deposit USDC
  const depositUSDC = (amount: string, receiver: string) => {
    const amountRaw = parseUnits(amount, USDC_DECIMALS);
    deposit({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [amountRaw, receiver],
    });
  };

  // Helper: withdraw USDC (amount in USDC, not shares)
  const withdrawUSDC = (amount: string, receiver: string, owner: string) => {
    const amountRaw = parseUnits(amount, USDC_DECIMALS);
    withdraw({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'withdraw',
      args: [amountRaw, receiver, owner],
    });
  };

  // Format helpers
  const formatUSDC = (value: bigint | undefined) => {
    if (!value) return '0';
    return formatUnits(value, USDC_DECIMALS);
  };

  const formatShares = (value: bigint | undefined) => {
    if (!value) return '0';
    return formatUnits(value, VAULT_DECIMALS);
  };

  return {
    // Data
    totalAssets,
    userShares,
    userAssets,
    allowance,
    // Actions
    approveUSDC,
    depositUSDC,
    withdrawUSDC,
    // Loading states
    isApproving: isApproving || isApprovingTx,
    isDepositing: isDepositing || isDepositingTx,
    isWithdrawing: isWithdrawing || isWithdrawingTx,
    // Helpers
    formatUSDC,
    formatShares,
  };
}