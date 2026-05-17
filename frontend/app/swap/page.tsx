"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import Navigation from "../components/Navigation";
import ClientOnly from "../ClientOnly";

export default function SwapPage() {
  const { isConnected, address } = useAccount();
  const [tokenIn, setTokenIn] = useState<"USDC" | "EURC">("USDC");
  const [amountIn, setAmountIn] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    txHash: string;
    explorerUrl: string;
    amountOut: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSwap = async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenIn: tokenIn,
          tokenOut: tokenIn === "USDC" ? "EURC" : "USDC",
          amountIn: amountIn,
          walletAddress: address,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Swap failed");
      }

      setResult({
        txHash: data.txHash,
        explorerUrl: data.explorerUrl,
        amountOut: data.amountOut,
      });
      setAmountIn("");
    } catch (err: any) {
      console.error("Swap error:", err);
      setError(err.message || "An error occurred during swap");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Navigation />
      <main className="flex min-h-screen flex-col items-center p-6 md:p-24">
        <div className="max-w-md w-full">
          <h1 className="text-3xl font-bold mb-2 text-center">Swap</h1>
          <p className="text-center mb-8 text-gray-600 dark:text-gray-400">
            Swap between USDC and EURC on Arc Testnet
          </p>

          <ClientOnly>
            {!isConnected ? (
              <div className="text-center p-8 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <p className="text-yellow-800 dark:text-yellow-200">
                  Please connect your wallet to swap
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md">
                {/* Token direction toggle */}
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setTokenIn("USDC")}
                    className={`flex-1 py-2 rounded font-medium transition-colors ${
                      tokenIn === "USDC"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    USDC → EURC
                  </button>
                  <button
                    onClick={() => setTokenIn("EURC")}
                    className={`flex-1 py-2 rounded font-medium transition-colors ${
                      tokenIn === "EURC"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                  >
                    EURC → USDC
                  </button>
                </div>

                {/* Amount input */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Amount (in {tokenIn})
                  </label>
                  <input
                    type="number"
                    placeholder={`Enter amount in ${tokenIn}`}
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isLoading}
                    step="0.01"
                    min="0"
                  />
                </div>

                {/* Swap button */}
                <button
                  onClick={handleSwap}
                  disabled={isLoading || !amountIn || parseFloat(amountIn) <= 0}
                  className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Swapping...
                    </span>
                  ) : (
                    `Swap ${tokenIn} → ${tokenIn === "USDC" ? "EURC" : "USDC"}`
                  )}
                </button>

                {/* Error message */}
                {error && (
                  <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-lg">
                    <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
                  </div>
                )}

                {/* Success result */}
                {result && (
                  <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 rounded-lg">
                    <p className="text-green-700 dark:text-green-400 font-semibold mb-2">
                      ✓ Swap successful!
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400 mb-2">
                      Received: <span className="font-mono">{result.amountOut}</span> {tokenIn === "USDC" ? "EURC" : "USDC"}
                    </p>
                    <a
                      href={result.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 underline hover:no-underline break-all"
                    >
                      View on Arc Scan →
                    </a>
                  </div>
                )}

                {/* Info note */}
                <div className="mt-4 p-2 text-center text-xs text-gray-500 dark:text-gray-400">
                  <p>Powered by Circle App Kit • 0.02% provider fee</p>
                </div>
              </div>
            )}
          </ClientOnly>
        </div>
      </main>
    </>
  );
}