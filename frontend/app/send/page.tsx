'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi';
import { parseUnits, formatUnits, isAddress } from 'viem';
import ClientOnly from '../components/ClientOnly';
import { USDC_ADDRESS, USDC_DECIMALS, ARCSCAN_TX } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

const ERC20_ABI = [
  {
    name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

function SendContent() {
  const { isConnected, address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const onCorrectChain = chainId === 5042002;

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain },
  });

  const formattedBalance = usdcBalance
    ? parseFloat(formatUnits(usdcBalance as bigint, USDC_DECIMALS)).toFixed(2)
    : '0.00';

  const parsedAmount = amount && parseFloat(amount) > 0
    ? parseUnits(amount, USDC_DECIMALS)
    : undefined;

  const insufficientBal = parsedAmount && usdcBalance !== undefined
    && parsedAmount > (usdcBalance as bigint);

  const handleSend = async () => {
    if (!parsedAmount || !recipient || !publicClient) return;
    if (!isAddress(recipient)) {
      setError('Invalid recipient address');
      return;
    }
    if (insufficientBal) {
      setError('Insufficient USDC balance');
      return;
    }

    setLoading(true);
    setError('');
    const id = showToast({ type: 'pending', message: `Sending ${amount} USDC…` });

    try {
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parsedAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
      setTxHash(hash);
      setAmount('');
      setRecipient('');
      refetchBalance();
      updateToast(id, { type: 'success', message: `Sent ${amount} USDC`, txHash: hash });
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? 'Send failed';
      setError(msg);
      updateToast(id, { type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📤</div>
        <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to send USDC</p>
      </div>
    );
  }

  if (!onCorrectChain) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <p style={{ color: '#f87171', fontWeight: 600, marginBottom: '0.5rem' }}>Wrong Network</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Switch to <strong>Arc Testnet</strong> (chain ID 5042002)</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Send USDC
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Wallet-to-wallet USDC transfer on Arc Testnet
        </p>
      </div>

      <div className="glass-card p-6 animate-fade-in-up delay-100">
        {/* Recipient */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Recipient Address
          </label>
          <input
            type="text"
            placeholder="0x…"
            value={recipient}
            onChange={e => { setRecipient(e.target.value); setError(''); }}
            className="glass-input"
            style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontSize: '0.875rem' }}
            disabled={loading}
          />
        </div>

        {/* Amount */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Amount (USDC)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Balance: <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{formattedBalance} USDC</span>
              </span>
              {usdcBalance && (usdcBalance as bigint) > 0n && (
                <button
                  onClick={() => setAmount(formatUnits(usdcBalance as bigint, USDC_DECIMALS))}
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
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => { setAmount(e.target.value); setError(''); }}
            className="glass-input"
            style={{
              padding: '0.875rem 1rem', fontSize: '1.5rem',
              borderColor: insufficientBal ? 'rgba(239,68,68,0.5)' : undefined,
            }}
            disabled={loading}
          />
          {insufficientBal && (
            <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.3rem' }}>Insufficient balance</p>
          )}
        </div>

        {/* From display */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '0.75rem 1rem', marginBottom: '1.25rem',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>From</span>
          <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
            {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : '—'}
          </span>
        </div>

        <button
          className="btn-gradient"
          onClick={handleSend}
          disabled={loading || !parsedAmount || !!insufficientBal || !recipient}
          style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
        >
          {loading ? 'Sending…' : 'Send USDC'}
        </button>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.75rem' }}>
            <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>
          </div>
        )}

        {txHash && !error && (
          <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.75rem' }}>
            <p style={{ color: '#10b981', fontWeight: 600, marginBottom: '0.5rem' }}>✓ Transfer complete</p>
            <a href={ARCSCAN_TX(txHash)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: 'var(--accent-purple)', textDecoration: 'none' }}>
              View on ArcScan →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SendPage() {
  return (
    <ClientOnly>
      <SendContent />
    </ClientOnly>
  );
}
