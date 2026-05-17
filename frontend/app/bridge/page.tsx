'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import ClientOnly from '../components/ClientOnly';
import { BRIDGE_CHAINS, ARCSCAN_TX } from '@/lib/constants';
import { showToast, updateToast } from '../components/TxToast';

// Lazy-load AppKit only on client to avoid SSR issues
async function getAdapterAndKit() {
  // Guard: must be in browser context with an injected wallet
  if (typeof window === 'undefined') {
    throw new Error('Not in browser context');
  }
  const raw = (window as any).ethereum;
  if (!raw) {
    throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
  }

  const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
    import('@circle-fin/app-kit'),
    import('@circle-fin/adapter-viem-v2'),
  ]);

  // Circle SDK validates provider shape strictly — bind methods explicitly
  // so they remain enumerable (MetaMask Proxy hides them otherwise)
  const provider = {
    request: raw.request.bind(raw),
    on: raw.on.bind(raw),
    removeListener: raw.removeListener.bind(raw),
  };

  let adapter;
  try {
    adapter = await createViemAdapterFromProvider(provider as any);
  } catch (e: any) {
    const msg: string = e?.message ?? '';
    if (msg.includes('provider') || msg.includes('CreateViemAdapter')) {
      throw new Error('Wallet adapter initialization failed. Try refreshing and reconnecting your wallet.');
    }
    throw e;
  }

  const kit = new AppKit();
  return { kit, adapter };
}

function BridgeContent() {
  const { isConnected, address } = useAccount();
  const [amount, setAmount] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [srcChain, setSrcChain] = useState(BRIDGE_CHAINS[0].id);
  const [dstChain, setDstChain] = useState(BRIDGE_CHAINS[1].id);
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill dest address with connected wallet
  useEffect(() => {
    if (address && !destAddress) setDestAddress(address);
  }, [address]);

  const handleBridge = async () => {
    if (!amount || !destAddress) return;
    if (srcChain === dstChain) { setError('Source and destination chains must differ'); return; }

    setLoading(true);
    setError('');
    const id = showToast({ type: 'pending', message: 'Initializing Circle AppKit…' });

    try {
      const { kit, adapter } = await getAdapterAndKit();
      updateToast(id, { type: 'pending', message: `Bridging ${amount} USDC…` });

      const result = await kit.bridge({
        // @ts-ignore — adapter context — SDK infers chain from adapter
        from: adapter,
        to: destAddress,
        amount,
        token: 'USDC',
      } as any);

      const hash = (result as any)?.hash ?? (result as any)?.transactionHash ?? '';
      setTxHash(hash);
      updateToast(id, { type: 'success', message: `Bridge initiated — ${amount} USDC`, txHash: hash });
      setAmount('');
    } catch (e: any) {
      const msg = e?.message ?? 'Bridge failed';
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
        <p style={{ color: 'var(--text-secondary)' }}>Connect your wallet to bridge USDC</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div className="animate-fade-in-up mb-8">
        <h1 className="gradient-text" style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Bridge USDC
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Cross-chain USDC transfers via Circle CCTP · powered by AppKit
        </p>
      </div>

      <div className="glass-card p-6 animate-fade-in-up delay-100">
        {/* Source chain */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            From
          </label>
          <select
            value={srcChain}
            onChange={e => setSrcChain(e.target.value)}
            className="glass-input"
            style={{ padding: '0.875rem 1rem', cursor: 'pointer' }}
          >
            {BRIDGE_CHAINS.map(c => (
              <option key={c.id} value={c.id} style={{ background: '#0a0f1e' }}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Swap chains button */}
        <div style={{ textAlign: 'center', margin: '0.5rem 0' }}>
          <button
            onClick={() => { const tmp = srcChain; setSrcChain(dstChain); setDstChain(tmp); }}
            style={{
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '50%',
              width: '36px', height: '36px',
              cursor: 'pointer',
              color: 'var(--accent-purple)',
              fontSize: '1.1rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ⇅
          </button>
        </div>

        {/* Dest chain */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            To
          </label>
          <select
            value={dstChain}
            onChange={e => setDstChain(e.target.value)}
            className="glass-input"
            style={{ padding: '0.875rem 1rem', cursor: 'pointer' }}
          >
            {BRIDGE_CHAINS.map(c => (
              <option key={c.id} value={c.id} style={{ background: '#0a0f1e' }}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Amount (USDC)
          </label>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="glass-input"
            style={{ padding: '0.875rem 1rem', fontSize: '1.25rem' }}
          />
        </div>

        {/* Destination address */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Recipient Address
          </label>
          <input
            type="text"
            placeholder="0x…"
            value={destAddress}
            onChange={e => setDestAddress(e.target.value)}
            className="glass-input"
            style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', fontFamily: 'monospace' }}
          />
        </div>

        {/* Info box */}
        <div
          style={{
            padding: '0.875rem', marginBottom: '1.25rem',
            background: 'rgba(99,102,241,0.06)', borderRadius: '0.75rem',
            border: '1px solid rgba(99,102,241,0.15)',
            fontSize: '0.8125rem', color: 'var(--text-muted)',
          }}
        >
          Uses Circle Cross-Chain Transfer Protocol (CCTP) for trustless USDC bridging.
          Bridging typically completes in ~2 minutes.
        </div>

        <button
          className="btn-gradient"
          onClick={handleBridge}
          disabled={loading || !amount || !destAddress}
          style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
        >
          {loading ? 'Bridging…' : 'Bridge USDC'}
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
            <p style={{ color: '#10b981', fontWeight: 600, marginBottom: '0.5rem' }}>✓ Bridge initiated</p>
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
