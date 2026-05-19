import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { STAKING_ADDRESS, VAULT_ADDRESS, USDC_DECIMALS, VAULT_DECIMALS } from '@/lib/constants';

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const STAKING_ABI = [
  { type: 'function', name: 'stake', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'lockDuration', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unstake', inputs: [{ name: 'stakeIndex', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'claimRewards', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'earned', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'stakedBalance', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'stakeCount', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getStake', inputs: [{ name: 'user', type: 'address' }, { name: 'index', type: 'uint256' }], outputs: [{ components: [{ name: 'amount', type: 'uint256' }, { name: 'startTime', type: 'uint256' }, { name: 'lockDuration', type: 'uint256' }, { name: 'multiplier', type: 'uint256' }], type: 'tuple' }], stateMutability: 'view' },
  { type: 'function', name: 'totalStaked', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'rewardRate', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'isUnlocked', inputs: [{ name: 'user', type: 'address' }, { name: 'index', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'timeUntilUnlock', inputs: [{ name: 'user', type: 'address' }, { name: 'index', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

// MIN_LOCK = 7 days per contract, MAX_LOCK = 365 days
export const LOCK_OPTIONS = [
  { label: '7 days (1x)',    duration: 7 * 86400,   multiplier: 100 },
  { label: '30 days (1.25x)', duration: 30 * 86400,  multiplier: 125 },
  { label: '90 days (1.5x)',  duration: 90 * 86400,  multiplier: 150 },
  { label: '365 days (2x)',   duration: 365 * 86400, multiplier: 200 },
];

export function useStaking() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Read balances
  const { data: yUsdcBalance, refetch: refetchBalance } = useReadContract({
    address: VAULT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: yUsdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: VAULT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, STAKING_ADDRESS as `0x${string}`] : undefined,
    query: { enabled: !!address },
  });

  const { data: stakedBalance, refetch: refetchStaked } = useReadContract({
    address: STAKING_ADDRESS as `0x${string}`,
    abi: STAKING_ABI,
    functionName: 'stakedBalance',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: earned, refetch: refetchEarned } = useReadContract({
    address: STAKING_ADDRESS as `0x${string}`,
    abi: STAKING_ABI,
    functionName: 'earned',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const { data: stakeCount, refetch: refetchCount } = useReadContract({
    address: STAKING_ADDRESS as `0x${string}`,
    abi: STAKING_ABI,
    functionName: 'stakeCount',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: totalStaked } = useReadContract({
    address: STAKING_ADDRESS as `0x${string}`,
    abi: STAKING_ABI,
    functionName: 'totalStaked',
  });

  const refetchAll = () => {
    refetchBalance();
    refetchAllowance();
    refetchStaked();
    refetchEarned();
    refetchCount();
  };

  const approveAndStake = async (amount: string, lockDuration: number) => {
    if (!address || !publicClient) throw new Error('Not connected');
    const amountBn = parseUnits(amount, VAULT_DECIMALS);
    const allowance = (yUsdcAllowance as bigint) ?? 0n;

    if (allowance < amountBn) {
      const approveTx = await writeContractAsync({
        address: VAULT_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [STAKING_ADDRESS as `0x${string}`, amountBn],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx, pollingInterval: 3_000 });
    }

    const hash = await writeContractAsync({
      address: STAKING_ADDRESS as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'stake',
      args: [amountBn, BigInt(lockDuration)],
    });
    await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 3_000 });
    refetchAll();
    return hash;
  };

  const unstake = async (stakeIndex: number) => {
    if (!address || !publicClient) throw new Error('Not connected');
    const hash = await writeContractAsync({
      address: STAKING_ADDRESS as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'unstake',
      args: [BigInt(stakeIndex)],
    });
    await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 3_000 });
    refetchAll();
    return hash;
  };

  const claimRewards = async () => {
    if (!address || !publicClient) throw new Error('Not connected');
    const hash = await writeContractAsync({
      address: STAKING_ADDRESS as `0x${string}`,
      abi: STAKING_ABI,
      functionName: 'claimRewards',
    });
    await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 3_000 });
    refetchAll();
    return hash;
  };

  return {
    yUsdcBalance: (yUsdcBalance as bigint) ?? 0n,
    stakedBalance: (stakedBalance as bigint) ?? 0n,
    earned: (earned as bigint) ?? 0n,
    stakeCount: Number((stakeCount as bigint) ?? 0n),
    totalStaked: (totalStaked as bigint) ?? 0n,
    approveAndStake,
    unstake,
    claimRewards,
    formatYUsdc: (v: bigint) => formatUnits(v, VAULT_DECIMALS),
    formatUsdc: (v: bigint) => formatUnits(v, USDC_DECIMALS),
  };
}
