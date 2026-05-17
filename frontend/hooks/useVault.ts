import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { VAULT_ADDRESS, USDC_ADDRESS, USDC_DECIMALS, VAULT_DECIMALS } from '@/lib/constants';

const VAULT_ABI = [
  {
    type: 'function', name: 'deposit',
    inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'withdraw',
    inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'totalAssets',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'convertToShares',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'convertToAssets',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: 'assets', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const USDC_ABI = [
  {
    type: 'function', name: 'approve',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'allowance',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export function useVault() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Only read when on the correct chain
  const onCorrectChain = chainId === 5042002;

  const { data: totalAssets, refetch: refetchTotalAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'totalAssets',
    query: { enabled: onCorrectChain, refetchInterval: 8000 },
  });

  const { data: userShares, refetch: refetchShares } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain, refetchInterval: 8000 },
  });

  const { data: userAssets, refetch: refetchAssets } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'convertToAssets',
    args: userShares ? [userShares as bigint] : undefined,
    query: { enabled: !!userShares && onCorrectChain, refetchInterval: 8000 },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: !!address && onCorrectChain, refetchInterval: 8000 },
  });

  const { data: walletUSDC, refetch: refetchWalletUSDC } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain, refetchInterval: 8000 },
  });

  const refetchAll = () => {
    refetchTotalAssets();
    refetchShares();
    refetchAssets();
    refetchAllowance();
    refetchWalletUSDC();
  };

  /**
   * Approve + Deposit in one call.
   * - If current allowance is insufficient, fires approve tx and waits for it.
   * - Then fires deposit tx and waits for it.
   * - Returns the deposit tx hash.
   */
  const approveAndDeposit = async (amount: string, receiver: string): Promise<`0x${string}`> => {
    if (!address || !publicClient) throw new Error('Wallet not connected');
    const amountRaw = parseUnits(amount, USDC_DECIMALS);
    const currentAllowance = (allowance as bigint) ?? 0n;

    // Step 1: Approve if needed
    if (currentAllowance < amountRaw) {
      const approveTxHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [VAULT_ADDRESS, amountRaw],
      });
      // Wait for approval to be mined
      await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
    }

    // Step 2: Deposit
    const depositTxHash = await writeContractAsync({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'deposit',
      args: [amountRaw, receiver as `0x${string}`],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositTxHash });
    refetchAll();
    return depositTxHash;
  };

  /**
   * Withdraw USDC from vault (assets, not shares).
   */
  const withdrawUSDC = async (amount: string, receiver: string, owner: string): Promise<`0x${string}`> => {
    if (!address || !publicClient) throw new Error('Wallet not connected');
    const amountRaw = parseUnits(amount, USDC_DECIMALS);
    const hash = await writeContractAsync({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'withdraw',
      args: [amountRaw, receiver as `0x${string}`, owner as `0x${string}`],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    refetchAll();
    return hash;
  };

  // Legacy helpers kept for compat (agent page uses writeContractAsync directly)
  const approveUSDC = async (amount: string) => {
    if (!publicClient) throw new Error('No public client');
    const amountRaw = parseUnits(amount, USDC_DECIMALS);
    const hash = await writeContractAsync({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'approve',
      args: [VAULT_ADDRESS, amountRaw],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    refetchAllowance();
    return hash;
  };

  const depositUSDC = async (amount: string, receiver: string) => {
    return approveAndDeposit(amount, receiver);
  };

  const formatUSDC = (value: bigint | undefined) => {
    if (!value) return '0.00';
    return parseFloat(formatUnits(value, USDC_DECIMALS)).toFixed(2);
  };

  const formatShares = (value: bigint | undefined) => {
    if (!value) return '0.00';
    return parseFloat(formatUnits(value, VAULT_DECIMALS)).toFixed(4);
  };

  return {
    totalAssets,
    userShares,
    userAssets,
    allowance,
    walletUSDC,
    approveAndDeposit,
    approveUSDC,
    depositUSDC,
    withdrawUSDC,
    isApproving: false,
    isDepositing: false,
    isWithdrawing: false,
    formatUSDC,
    formatShares,
    refetchAll,
  };
}
