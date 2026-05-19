'use client';

import { useState } from 'react';
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi';
import { parseUnits, formatUnits, isAddress } from 'viem';
import ClientOnly from '../components/ClientOnly';
import { USDC_ADDRESS, EURC_ADDRESS, USDC_DECIMALS, ARCSCAN_TX } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

// Arc testnet is not yet listed in Circle CCTP's supported chains.
// Bridge page provides native Arc↔Arc token transfers for testing,
// with a clear note about mainnet CCTP availability.

const TOKENS = [
  { symbol: 'USDC', address: USDC_ADDRESS, decimals: USDC_DECIMALS },
  { symbol: 'EURC', address: EURC_ADDRESS, decimals: 6 },
] as const;

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

function BridgeContent() {
  const { isConnected, address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const onCorrectChain = chainId === 5042002;

  const [selectedToken, setSelectedToken] = useState<'USDC' | 'EURC'>('USDC');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const token = TOKENS.find(t => t.symbol === selectedToken)!;

  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: token.address as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && onCorrectChain },
  });

  const formattedBalance = tokenBalance
    ? parseFloat(formatUnits(tokenBalance as bigint, token.decimals)).toFixed(2)
    : '0.00';

  const parsedAmount = amount && parseFloat(amount) > 0
    ? parseUnits(amount, token.decimals)
    : undefined;

  const insufficientBal = parsedAmount && tokenBalance !== undefined
    && parsedAmount > (tokenBalance as bigint);

  const handleTransfer = async () => {
    if (!parsedAmount || !recipient || !publicClient) return;
    if (!isAddress(recipient)) {
      setError('Invalid recipient address');
      return;
    }
    if (insufficientBal) {
      setError(`Insufficient ${selectedToken} balance`);
      return;
    }

    setLoading(true);
    setError('');
    const id = showToast({ type: 'pending', message: `Transferring ${amount} ${selectedToken}…` });

    try {
      const hash = await writeContractAsync({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipient as `0x${string}`, parsedAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 15_000 });
      setTxHash(hash);
      setAmount('');
      refetchBalance();
      updateToast(id, { type: 'success', message: `Transferred ${amount} ${selectedToken}`, txHash: hash });
    } catch (e: any) {
      const msg = e?.shortMessage ?? e?.message ?? 'Transfer failed';
      setError(msg);
      updateToast(id, { type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="glass-card p-10 text-center animate-fade-in-up" style={{ maxWidth: '480px', margin: '4rem auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🌉</div>
        <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to bridge tokens</p>
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
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Bridge / Transfer
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          On-chain token transfers on Arc Testnet
        </p>
      </div>

      {/* CCTP info banner */}
      <div
        className="animate-fade-in-up mb-6"
        style={{
          padding: '0.875rem 1rem',
          background: 'rgba(99,102,241,0.07)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '0.875rem',
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>ℹ️ Cross-chain CCTP</strong><br />
        Circle's Cross-Chain Transfer Protocol will be enabled once Arc Testnet is listed as an
        official CCTP domain. Native Arc transfers are fully functional now for testing.
      </div>

      <div className="glass-card p-6 animate-fade-in-up delay-100">
        {/* Token selector */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Token
          </label>
          <div className="flex" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '0.25rem', border: '1px solid rgba(255,255,255,0.06)' }}>
            {TOKENS.map(t => (
              <button key={t.symbol}
                onClick={() => { setSelectedToken(t.symbol); setAmount(''); setError(''); }}
                style={{
                  flex: 1, padding: '0.5rem', borderRadius: '0.625rem', border: 'none',
                  cursor: 'pointer', fontWeight: selectedToken === t.symbol ? 600 : 400, fontSize: '0.875rem',
                  color: selectedToken === t.symbol ? 'white' : 'var(--text-secondary)',
                  background: selectedToken === t.symbol ? 'linear-gradient(135deg, #6366f1, #3b82f6)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                {t.symbol}
              </button>
            ))}
          </div>
        </div>

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
            <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Amount ({selectedToken})</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Balance: <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{formattedBalance} {selectedToken}</span>
              </span>
              {tokenBalance && (tokenBalance as bigint) > 0n && (
                <button
                  onClick={() => setAmount(formatUnits(tokenBalance as bigint, token.decimals))}
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
              padding: '0.875rem 1rem', fontSize: '1.25rem',
              borderColor: insufficientBal ? 'rgba(239,68,68,0.5)' : undefined,
            }}
            disabled={loading}
          />
          {insufficientBal && (
            <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.3rem' }}>Insufficient {selectedToken} balance</p>
          )}
        </div>

        <button
          className="btn-gradient"
          onClick={handleTransfer}
          disabled={loading || !parsedAmount || !!insufficientBal || !recipient}
          style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
        >
          {loading ? 'Transferring…' : `Transfer ${selectedToken}`}
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

export default function BridgePage() {
  return (
    <ClientOnly>
      <BridgeContent />
    </ClientOnly>
  );
}
