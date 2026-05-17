"use client";

import { useAccount, useReadContract, usePublicClient, useWriteContract } from 'wagmi';
import { formatUnits } from 'viem';
import { FEE_DISTRIBUTOR_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '@/lib/constants';

const FEE_DISTRIBUTOR_ABI = [
  {
    type: 'function', name: 'claim',
    inputs: [], outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'earned',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'rewardPerShare',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'rewardPerShareStored',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'totalClaimed',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'yusdc',
    inputs: [], outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

const USDC_ABI = [
  {
    type: 'function', name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export function useFeeDistributor() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Pending rewards for user — may revert on old deployed contract
  const { data: pendingRewards, refetch: refetchEarned } = useReadContract({
    address: FEE_DISTRIBUTOR_ADDRESS,
    abi: FEE_DISTRIBUTOR_ABI,
    functionName: 'earned',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      // Don't throw on revert — just return undefined
      retry: false,
    },
  });

  // USDC sitting in the distributor (total pool available for rewards)
  const { data: distributorBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [FEE_DISTRIBUTOR_ADDRESS],
  });

  const claim = async (): Promise<`0x${string}`> => {
    if (!address || !publicClient) throw new Error('Wallet not connected');
    const hash = await writeContractAsync({
      address: FEE_DISTRIBUTOR_ADDRESS,
      abi: FEE_DISTRIBUTOR_ABI,
      functionName: 'claim',
      args: [],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    refetchEarned();
    return hash;
  };

  const formatUSDC = (value: bigint | undefined) => {
    if (!value) return '0.000000';
    return parseFloat(formatUnits(value, USDC_DECIMALS)).toFixed(6);
  };

  return {
    pendingRewards: pendingRewards as bigint | undefined,
    distributorBalance: distributorBalance as bigint | undefined,
    claim,
    formatUSDC,
  };
}
