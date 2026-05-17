'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const NAV_LINKS = [
  { href: '/',          label: 'Home'   },
  { href: '/deposit',   label: 'Deposit' },
  { href: '/vault',     label: 'Vault'  },
  { href: '/swap',      label: 'Swap'   },
  { href: '/bridge',    label: 'Bridge' },
  { href: '/send',      label: 'Send'   },
  { href: '/agent',     label: 'Agent'  },
  { href: '/referral',  label: 'Earn'   },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav
      className="glass-nav fixed top-0 left-0 right-0"
      style={{ height: '72px', zIndex: 100 }}
    >
      <div
        className="flex items-center justify-between h-full"
        style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 1.5rem' }}
      >
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              fontWeight: 'bold',
              color: 'white',
            }}
          >
            Y
          </div>
          <span
            className="gradient-text"
            style={{ fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.02em' }}
          >
            YieldFi
          </span>
        </Link>

        {/* Links */}
        <div
          className="hidden md:flex items-center gap-1"
          style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '9999px', padding: '0.25rem', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 400,
                  textDecoration: 'none',
                  color: active ? 'white' : 'var(--text-secondary)',
                  background: active ? 'linear-gradient(135deg, #6366f1, #3b82f6)' : 'transparent',
                  transition: 'all 0.2s',
                  boxShadow: active ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Connect Button */}
        <ConnectButton
          showBalance={false}
          chainStatus="icon"
          accountStatus="avatar"
        />
      </div>
    </nav>
  );
}
