"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { SWAP_ADDRESS, USDC_ADDRESS, EURC_ADDRESS, USDC_DECIMALS } from '@/lib/constants';

const SWAP_ABI = [
  {
    type: 'function',
    name: 'swap',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' }
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'getReserves',
    inputs: [],
    outputs: [
      { name: '', type: 'uint256' },
      { name: '', type: 'uint256' }
    ],
    stateMutability: 'view'
  }
];

const ERC20_ABI = [
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
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
];

export function useSwap() {
  const { address } = useAccount();

  // Read reserves
  const { data: reserves } = useReadContract({
    address: SWAP_ADDRESS as `0x${string}`,
    abi: SWAP_ABI,
    functionName: 'getReserves',
  }) as { data?: [bigint, bigint] };

  // Read token balances
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  const { data: eurcBalance } = useReadContract({
    address: EURC_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  // Allowances for swap contract
  const { data: usdcAllowance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, SWAP_ADDRESS] : undefined,
  });

  const { data: eurcAllowance } = useReadContract({
    address: EURC_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, SWAP_ADDRESS] : undefined,
  });

  // Write hooks
  const { writeContract: approveUsdc, isPending: isApprovingUsdc, data: approveUsdcHash } = useWriteContract();
  const { writeContract: approveEurc, isPending: isApprovingEurc, data: approveEurcHash } = useWriteContract();
  const { writeContract: swapTokens, isPending: isSwapping, data: swapHash } = useWriteContract();

  const { isLoading: isApprovingUsdcTx } = useWaitForTransactionReceipt({ hash: approveUsdcHash });
  const { isLoading: isApprovingEurcTx } = useWaitForTransactionReceipt({ hash: approveEurcHash });
  const { isLoading: isSwappingTx } = useWaitForTransactionReceipt({ hash: swapHash });

  const approve = (token: 'usdc' | 'eurc', amount: string) => {
    const rawAmount = parseUnits(amount, USDC_DECIMALS);
    if (token === 'usdc') {
      approveUsdc({
        address: USDC_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SWAP_ADDRESS as `0x${string}`, rawAmount],
      });
    } else {
      approveEurc({
        address: EURC_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SWAP_ADDRESS as `0x${string}`, rawAmount],
      });
    }
  };

  const swap = (tokenIn: 'usdc' | 'eurc', amountIn: string) => {
    const rawAmount = parseUnits(amountIn, USDC_DECIMALS);
    const tokenInAddr = tokenIn === 'usdc' ? USDC_ADDRESS : EURC_ADDRESS;
    const tokenOutAddr = tokenIn === 'usdc' ? EURC_ADDRESS : USDC_ADDRESS;
    swapTokens({
      address: SWAP_ADDRESS as `0x${string}`,
      abi: SWAP_ABI,
      functionName: 'swap',
      args: [tokenInAddr as `0x${string}`, tokenOutAddr as `0x${string}`, rawAmount],
    });
  };

  const formatBalance = (balance: bigint | undefined) => {
    if (!balance) return '0';
    return formatUnits(balance, USDC_DECIMALS);
  };

  const reserve0 = reserves?.[0] ?? BigInt(0);
  const reserve1 = reserves?.[1] ?? BigInt(0);

  // Estimate output amount for a given input (simple constant product with 0.3% fee)
  const estimateOutput = (amountIn: string, tokenInIsUsdc: boolean): string => {
    const amount = parseUnits(amountIn || '0', USDC_DECIMALS);
    if (amount === BigInt(0)) return '0';
    const reserveIn = tokenInIsUsdc ? reserve0 : reserve1;
    const reserveOut = tokenInIsUsdc ? reserve1 : reserve0;
    if (reserveIn === BigInt(0) || reserveOut === BigInt(0)) return '0';
    // 0.3% fee: amountInWithFee = amountIn * 997 / 1000
    const amountInWithFee = (amount * BigInt(997)) / BigInt(1000);
    const amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
    return formatUnits(amountOut, USDC_DECIMALS);
  };

  return {
    usdcBalance,
    eurcBalance,
    usdcAllowance,
    eurcAllowance,
    reserves: { reserve0, reserve1 },
    approve,
    swap,
    estimateOutput,
    formatBalance,
    isApprovingUsdc: isApprovingUsdc || isApprovingUsdcTx,
    isApprovingEurc: isApprovingEurc || isApprovingEurcTx,
    isSwapping: isSwapping || isSwappingTx,
  };
}