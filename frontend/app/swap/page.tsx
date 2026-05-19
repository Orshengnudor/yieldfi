'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import ClientOnly from '../components/ClientOnly';
import { SWAP_ADDRESS, USDC_ADDRESS, EURC_ADDRESS, USDC_DECIMALS, ARCSCAN_TX } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

const ERC20_ABI = [
  {
    name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const SWAP_ABI = [
  {
    name: 'swap', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' }, // ← required by contract
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    name: 'getAmountOut', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenIn', type: 'address' }, { name: 'amountIn', type: 'uint256' }],
    outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'fee', type: 'uint256' }],
  },
] as const;

type Step = 'idle' | 'approving' | 'swapping' | 'done' | 'error';

function fmt(val: bigint | undefined) {
  if (!val) return '0.00';
  return parseFloat(formatUnits(val, USDC_DECIMALS)).toFixed(2);
}

function SwapContent() {
  const { isConnected, address, chainId } = useAccount();
  const onCorrectChain = chainId === 5042002;
  const publicClient = usePublicClient();
  const [tokenIn, setTokenIn] = useState<'USDC' | 'EURC'>('USDC');
  const [amountIn, setAmountIn] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tokenInAddress  = tokenIn === 'USDC' ? USDC_ADDRESS : EURC_ADDRESS;
  const tokenOutAddress = tokenIn === 'USDC' ? EURC_ADDRESS : USDC_ADDRESS;
  const tokenOutSymbol  = tokenIn === 'USDC' ? 'EURC' : 'USDC';

  const parsedAmountIn = amountIn && parseFloat(amountIn) > 0
    ? parseUnits(amountIn, USDC_DECIMALS)
    : undefined;

  // ── Balances ──────────────────────────────────────────────────────────────
  const { data: usdcBal, refetch: refetchUsdc } = useReadContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain, refetchInterval: 8000 },
  });
  const { data: eurcBal, refetch: refetchEurc } = useReadContract({
    address: EURC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain, refetchInterval: 8000 },
  });

  const tokenInBal  = tokenIn === 'USDC' ? usdcBal as bigint | undefined : eurcBal as bigint | undefined;
  const tokenOutBal = tokenIn === 'USDC' ? eurcBal as bigint | undefined : usdcBal as bigint | undefined;

  // ── Quote ─────────────────────────────────────────────────────────────────
  const { data: quoteData } = useReadContract({
    address: SWAP_ADDRESS as `0x${string}`,
    abi: SWAP_ABI, functionName: 'getAmountOut',
    args: parsedAmountIn ? [tokenInAddress as `0x${string}`, parsedAmountIn] : undefined,
    query: { enabled: !!parsedAmountIn },
  });

  const quotedOut = quoteData ? parseFloat(formatUnits(quoteData[0], USDC_DECIMALS)).toFixed(6) : null;
  const quotedFee = quoteData ? parseFloat(formatUnits(quoteData[1], USDC_DECIMALS)).toFixed(6) : null;

  // minAmountOut = 95% of quoted (5% slippage tolerance)
  const minAmountOut = quoteData ? (quoteData[0] * 95n) / 100n : 0n;

  const { writeContractAsync: approveAsync } = useWriteContract();
  const { writeContractAsync: swapAsync }    = useWriteContract();
  const { isLoading: isTxPending } = useWaitForTransactionReceipt({ hash: txHash });

  const handleSwap = async () => {
    if (!parsedAmountIn || !address || !publicClient) return;
    setErrorMsg(null);
    const id = showToast({ type: 'pending', message: `Approving ${tokenIn}…` });
    try {
      setStep('approving');
      const approveTx = await approveAsync({
        address: tokenInAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SWAP_ADDRESS as `0x${string}`, parsedAmountIn],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx, pollingInterval: 3_000 });

      updateToast(id, { type: 'pending', message: `Swapping ${tokenIn} → ${tokenOutSymbol}…` });
      setStep('swapping');
      const hash = await swapAsync({
        address: SWAP_ADDRESS as `0x${string}`,
        abi: SWAP_ABI,
        functionName: 'swap',
        args: [
          tokenInAddress as `0x${string}`,
          tokenOutAddress as `0x${string}`,
          parsedAmountIn,
          minAmountOut,
        ],
      });

      setTxHash(hash);
      setStep('done');
      setAmountIn('');
      refetchUsdc(); refetchEurc();
      updateToast(id, { type: 'success', message: `Swapped ${amountIn} ${tokenIn} → ~${quotedOut} ${tokenOutSymbol}`, txHash: hash });
    } catch (err: any) {
      const msg = err?.shortMessage ?? err?.message ?? 'Swap failed';
      setErrorMsg(msg);
      setStep('error');
      updateToast(id, { type: 'error', message: msg });
    }
  };

  const isLoading = step === 'approving' || step === 'swapping' || isTxPending;
  const insufficientBal = parsedAmountIn && tokenInBal !== undefined && parsedAmountIn > tokenInBal;

  if (!isConnected) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
        <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to swap</p>
      </div>
    );
  }

  if (!onCorrectChain) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <p style={{ color: '#f87171', fontWeight: 600, marginBottom: '0.5rem' }}>Wrong Network</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Switch to <strong>Arc Testnet</strong> (chain ID 5042002) in your wallet.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Swap
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Swap between USDC and EURC · 0.3% fee</p>
      </div>

      <div className="glass-card p-6 animate-fade-in-up delay-100">
        {/* Direction toggle */}
        <div className="flex mb-6" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '0.25rem', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['USDC', 'EURC'] as const).map(t => (
            <button key={t}
              onClick={() => { setTokenIn(t); setAmountIn(''); setStep('idle'); setErrorMsg(null); }}
              style={{
                flex: 1, padding: '0.5rem', borderRadius: '0.625rem', border: 'none',
                cursor: 'pointer', fontWeight: tokenIn === t ? 600 : 400, fontSize: '0.875rem',
                color: tokenIn === t ? 'white' : 'var(--text-secondary)',
                background: tokenIn === t ? 'linear-gradient(135deg, #6366f1, #3b82f6)' : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              {t} → {t === 'USDC' ? 'EURC' : 'USDC'}
            </button>
          ))}
        </div>

        {/* From */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>From ({tokenIn})</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Balance: <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{fmt(tokenInBal)} {tokenIn}</span>
              </span>
              {tokenInBal && tokenInBal > 0n && (
                <button
                  onClick={() => setAmountIn(formatUnits(tokenInBal!, USDC_DECIMALS))}
                  style={{
                    fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '0.35rem',
                    border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)',
                    color: 'var(--accent-purple)', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  MAX
                </button>
              )}
            </div>
          </div>
          <input
            type="number" placeholder="0.00" value={amountIn}
            onChange={e => { setAmountIn(e.target.value); setStep('idle'); setErrorMsg(null); }}
            className="glass-input"
            style={{ padding: '0.875rem 1rem', fontSize: '1.25rem', borderColor: insufficientBal ? 'rgba(239,68,68,0.5)' : undefined }}
            disabled={isLoading}
          />
          {insufficientBal && (
            <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.3rem' }}>Insufficient {tokenIn} balance</p>
          )}
        </div>

        {/* Arrow */}
        <div style={{ textAlign: 'center', margin: '0.75rem 0', color: 'var(--text-muted)', fontSize: '1.25rem' }}>↓</div>

        {/* To */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>To ({tokenOutSymbol})</label>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Balance: <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{fmt(tokenOutBal)} {tokenOutSymbol}</span>
            </span>
          </div>
          <div style={{
            padding: '0.875rem 1rem',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '0.75rem',
            fontSize: '1.25rem',
            color: quotedOut ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: quotedOut ? 600 : 400,
          }}>
            {quotedOut ?? '—'}
          </div>
          {quotedFee && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', textAlign: 'right' }}>
              Fee: {quotedFee} {tokenIn} · Min received: {parseFloat(formatUnits(minAmountOut, USDC_DECIMALS)).toFixed(6)} {tokenOutSymbol}
            </div>
          )}
        </div>

        {/* Button */}
        <button
          className="btn-gradient"
          onClick={handleSwap}
          disabled={isLoading || !parsedAmountIn || !!insufficientBal}
          style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
        >
          {step === 'approving' ? 'Step 1/2 — Approving…'
            : step === 'swapping' || isTxPending ? 'Step 2/2 — Swapping…'
            : insufficientBal ? `Insufficient ${tokenIn}`
            : `Swap ${tokenIn} → ${tokenOutSymbol}`}
        </button>

        {step === 'approving' && (
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Confirm approval in wallet
          </p>
        )}
        {step === 'swapping' && (
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Confirm swap in wallet
          </p>
        )}

        {step === 'done' && txHash && (
          <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.75rem' }}>
            <p style={{ color: '#10b981', fontWeight: 600, marginBottom: '0.5rem' }}>✓ Swap successful</p>
            <a href={ARCSCAN_TX(txHash)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: 'var(--accent-purple)', textDecoration: 'none' }}>
              View on ArcScan →
            </a>
          </div>
        )}

        {step === 'error' && errorMsg && (
          <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.75rem' }}>
            <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SwapPage() {
  return (
    <ClientOnly>
      <SwapContent />
    </ClientOnly>
  );
}
