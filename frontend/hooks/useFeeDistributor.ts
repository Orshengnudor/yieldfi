"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits } from 'viem';
import { FEE_DISTRIBUTOR_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '@/lib/constants';

const FEE_DISTRIBUTOR_ABI = [
  {
    type: 'function',
    name: 'claim',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'earned',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
];

const USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
];

export function useFeeDistributor() {
  const { address } = useAccount();

  // Read pending rewards for connected wallet
  const { data: pendingRewards } = useReadContract({
    address: FEE_DISTRIBUTOR_ADDRESS as `0x${string}`,
    abi: FEE_DISTRIBUTOR_ABI,
    functionName: 'earned',
    args: address ? [address] : undefined,
  });

  // Read USDC balance of the distributor contract (total unclaimed fees)
  const { data: distributorBalance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [FEE_DISTRIBUTOR_ADDRESS as `0x${string}`],
  });

  // Write contract for claiming
  const { writeContract: claimRewards, isPending: isClaiming, data: claimHash } = useWriteContract();
  const { isLoading: isClaimingTx } = useWaitForTransactionReceipt({ hash: claimHash });

  const claim = () => {
    claimRewards({
      address: FEE_DISTRIBUTOR_ADDRESS as `0x${string}`,
      abi: FEE_DISTRIBUTOR_ABI,
      functionName: 'claim',
      args: [],
    });
  };

  const formatUSDC = (value: bigint | undefined) => {
    if (!value) return '0';
    return formatUnits(value, USDC_DECIMALS);
  };

  return {
    pendingRewards,
    distributorBalance,
    claim,
    isClaiming: isClaiming || isClaimingTx,
    formatUSDC,
  };
}