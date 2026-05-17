"use client";

import { useAccount } from "wagmi";
import { useVault } from "@/hooks/useVault";
import { useFeeDistributor } from "@/hooks/useFeeDistributor";
import Navigation from "../components/Navigation";
import ClientOnly from "../components/ClientOnly";

export default function VaultPage() {
  const { isConnected } = useAccount();
  const vault = useVault();
  const feeDistributor = useFeeDistributor();

  return (
    <>
      <Navigation />
      <main className="flex min-h-screen flex-col items-center p-6 md:p-24">
        <div className="z-10 max-w-3xl w-full">
          <h1 className="text-4xl font-bold mb-2 text-center">Vault Details</h1>
          <p className="text-center mb-8 text-gray-600 dark:text-gray-400">
            Information about the yUSDC vault and your rewards
          </p>

          <ClientOnly>
            {!isConnected ? (
              <div className="text-center p-8 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <p>Please connect your wallet to view vault details</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Vault Stats Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
                  <h2 className="text-xl font-semibold mb-4">Vault Statistics</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between border-b pb-2">
                      <span className="font-semibold">Total Assets (USDC):</span>
                      <span className="font-mono">{vault.formatUSDC(vault.totalAssets as bigint)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="font-semibold">Your yUSDC balance:</span>
                      <span className="font-mono">{vault.formatShares(vault.userShares as bigint)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="font-semibold">Your USDC value:</span>
                      <span className="font-mono">{vault.formatUSDC(vault.userAssets as bigint)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="font-semibold">USDC Allowance:</span>
                      <span className="font-mono">{vault.formatUSDC(vault.allowance as bigint)}</span>
                    </div>
                  </div>
                </div>

                {/* Fee Rewards Card */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
                  <h2 className="text-xl font-semibold mb-4">Fee Rewards</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    You earn 0.3% of every swap fee. Claim rewards anytime.
                  </p>
                  <div className="space-y-3">
                    <div className="flex justify-between border-b pb-2">
                      <span className="font-semibold">Your pending rewards:</span>
                      <span className="font-mono text-green-600 dark:text-green-400">
                        {feeDistributor.formatUSDC(feeDistributor.pendingRewards as bigint)} USDC
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Total fees held in contract:</span>
                      <span>{feeDistributor.formatUSDC(feeDistributor.distributorBalance as bigint)} USDC</span>
                    </div>
                    <button
                      onClick={() => feeDistributor.claim()}
                      disabled={
                        feeDistributor.isClaiming ||
                        !feeDistributor.pendingRewards ||
                        feeDistributor.pendingRewards === BigInt(0)
                      }
                      className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-4"
                    >
                      {feeDistributor.isClaiming ? "Claiming..." : "Claim Rewards"}
                    </button>
                  </div>
                </div>

                {/* Info Note */}
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                  <p className="text-center text-blue-700 dark:text-blue-300">
                    💡 yUSDC is a yield-bearing token that automatically increases in value relative to USDC.<br />
                    Holders earn from lending yield + 0.3% swap fees collected by the platform.
                  </p>
                </div>
              </div>
            )}
          </ClientOnly>
        </div>
      </main>
    </>
  );
}