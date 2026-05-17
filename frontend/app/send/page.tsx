'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import ClientOnly from '../components/ClientOnly';
import { ARCSCAN_TX } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

async function getAdapterAndKit() {
  const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
    import('@circle-fin/app-kit'),
    import('@circle-fin/adapter-viem-v2'),
  ]);
  const raw = (window as any).ethereum;
  if (!raw) throw new Error('No wallet provider found');

  // Bind methods explicitly — Circle SDK validates provider shape strictly
  const provider = {
    request: raw.request.bind(raw),
    on: raw.on.bind(raw),
    removeListener: raw.removeListener.bind(raw),
  };

  const adapter = await createViemAdapterFromProvider(provider as any);
  const kit = new AppKit();
  return { kit, adapter };
}

function SendContent() {
  const { isConnected, address } = useAccount();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!amount || !recipient) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
      setError('Invalid recipient address');
      return;
    }

    setLoading(true);
    setError('');
    const id = showToast({ type: 'pending', message: 'Initializing AppKit…' });

    try {
      const { kit, adapter } = await getAdapterAndKit();
      updateToast(id, { type: 'pending', message: `Sending ${amount} USDC…` });

      const result = await kit.send({
        // @ts-ignore — adapter used as from context
        from: adapter,
        to: recipient,
        amount,
        token: 'USDC',
      } as any);

      const hash = (result as any)?.hash ?? (result as any)?.transactionHash ?? (result as any)?.txHash ?? '';
      setTxHash(hash);
      updateToast(id, { type: 'success', message: `Sent ${amount} USDC`, txHash: hash });
      setAmount('');
      setRecipient('');
    } catch (e: any) {
      const msg = e?.message ?? 'Send failed';
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

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Send USDC
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Wallet-to-wallet USDC transfer · powered by Circle AppKit
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
          />
        </div>

        {/* Amount */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Amount (USDC)
          </label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="glass-input"
            style={{ padding: '0.875rem 1rem', fontSize: '1.5rem' }}
          />
        </div>

        {/* From display */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '0.75rem 1rem', marginBottom: '1.25rem',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>From</span>
          <span style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
            {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : '—'}
          </span>
        </div>

        <button
          className="btn-gradient"
          onClick={handleSend}
          disabled={loading || !amount || !recipient}
          style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
        >
          {loading ? 'Sending…' : 'Send USDC'}
        </button>

        {/* Error */}
        {error && (
          <div style={{ marginTop: '1rem', padding: '0.875rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.75rem' }}>
            <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>
          </div>
        )}

        {/* Success */}
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
