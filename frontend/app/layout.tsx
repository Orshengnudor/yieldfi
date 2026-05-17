import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from './components/Navigation';
import GradientBackground from './components/GradientBackground';
import TxToastContainer from './components/TxToast';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'YieldFi — USDC Yield on Arc',
  description: 'Earn yield, swap stablecoins, bridge assets, and build on-chain identity — powered by Circle Arc.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ background: '#0a0f1e', minHeight: '100vh', position: 'relative' }}>
        <Providers>
          <GradientBackground />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Navigation />
            <main style={{ paddingTop: '72px', minHeight: 'calc(100vh - 72px)' }}>
              {children}
            </main>
          </div>
          <TxToastContainer />
        </Providers>
      </body>
    </html>
  );
}
