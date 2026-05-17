'use client';

import { useEffect, useState } from 'react';

type AppKitAdapter = {
  transfer: (params: {
    amount: string;
    destinationAddress: string;
    tokenId: string;
    sourceChain: string;
    destinationChain: string;
  }) => Promise<{ hash: string }>;
};

type AppKit = {
  bridge: AppKitAdapter;
  send: {
    transfer: (params: {
      amount: string;
      destinationAddress: string;
      tokenId: string;
    }) => Promise<{ hash: string }>;
  };
};

export function useAppKitAdapter() {
  const [kit, setKit] = useState<AppKit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!(window as any).ethereum) return;

    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
          import('@circle-fin/app-kit'),
          import('@circle-fin/adapter-viem-v2'),
        ]);

        const provider = (window as any).ethereum;
        const adapter = await createViemAdapterFromProvider(provider);

        const appKit = new AppKit();

        if (!cancelled) {
          setKit(appKit as unknown as AppKit);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.warn('AppKit init failed:', e);
          setError(e?.message ?? 'AppKit init failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  return { kit, loading, error };
}
