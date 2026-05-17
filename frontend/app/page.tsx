'use client';

import Link from 'next/link';

const FEATURES = [
  { href: '/deposit', icon: '💵', label: 'Deposit', desc: 'Deposit USDC into the ERC-4626 vault and earn yield' },
  { href: '/vault', icon: '📦', label: 'Vault', desc: 'Track your yUSDC shares, APY, and claimable rewards' },
  { href: '/swap', icon: '🔄', label: 'Swap', desc: 'Swap between USDC and EURC with 0.3% fee distribution' },
  { href: '/bridge', icon: '🌉', label: 'Bridge', desc: 'Cross-chain USDC transfers via Circle CCTP AppKit' },
  { href: '/send', icon: '📤', label: 'Send', desc: 'Send USDC to any address via Circle AppKit' },
  { href: '/agent', icon: '🤖', label: 'Agent', desc: 'Register your wallet as an ERC-8004 on-chain agent' },
  { href: '/referral', icon: '🎁', label: 'Earn', desc: 'Create a referral code and earn 20% of swap fees' },
];

export default function HomePage() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      {/* Hero */}
      <div className="text-center animate-fade-in-up" style={{ marginBottom: '4rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.4rem 1rem',
            background: 'rgba(99,102,241,0.12)',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: '9999px',
            fontSize: '0.8125rem',
            color: 'var(--accent-purple)',
            marginBottom: '1.5rem',
          }}
        >
          <span>●</span> Live on Arc Testnet
        </div>

        <h1
          className="gradient-text"
          style={{
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            marginBottom: '1.25rem',
          }}
        >
          DeFi powered by Circle Arc
        </h1>

        <p style={{ color: 'var(--text-secondary)', fontSize: '1.125rem', maxWidth: '520px', margin: '0 auto 2rem' }}>
          Earn yield on USDC, swap stablecoins, bridge cross-chain, and build on-chain AI agent identity — all on Arc.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/deposit">
            <button className="btn-gradient" style={{ padding: '0.875rem 2rem', fontSize: '1rem' }}>
              Start Earning
            </button>
          </Link>
          <Link href="/agent">
            <button className="btn-secondary" style={{ padding: '0.875rem 2rem', fontSize: '1rem' }}>
              Register Agent
            </button>
          </Link>
        </div>
      </div>

      {/* Feature grid */}
      <div
        className="animate-fade-in-up delay-200"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1rem',
        }}
      >
        {FEATURES.map(({ href, icon, label, desc }, i) => (
          <Link key={href} href={href} style={{ textDecoration: 'none' }}>
            <div
              className="glass-card-hover p-5"
              style={{ animationDelay: `${i * 60}ms`, height: '100%' }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>{icon}</div>
              <div style={{ fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-primary)' }}>{label}</div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Built on row */}
      <div
        className="animate-fade-in-up delay-400"
        style={{
          marginTop: '4rem',
          padding: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem',
          flexWrap: 'wrap',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {['Circle Arc', 'ERC-4626', 'ERC-8004', 'CCTP Bridge', 'AppKit'].map(tech => (
          <span key={tech} style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {tech}
          </span>
        ))}
      </div>
    </div>
  );
}
