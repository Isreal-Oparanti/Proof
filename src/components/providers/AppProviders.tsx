"use client";

import type { SolanaClientConfig } from "@solana/client";
import { SolanaProvider } from "@solana/react-hooks";
import { Toaster } from "react-hot-toast";

const defaultConfig: SolanaClientConfig = {
  cluster: "devnet",
  rpc: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
  websocket:
    process.env.NEXT_PUBLIC_SOLANA_WS_URL || "wss://api.devnet.solana.com",
};

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SolanaProvider config={defaultConfig}>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: "#fff8f0",
            color: "#233525",
            border: "1px solid #bdc79f",
          },
          error: {
            style: {
              border: "1px solid #d2a7a7",
            },
          },
        }}
      />
    </SolanaProvider>
  );
}
