"use client";

import type { SolanaClientConfig } from "@solana/client";
import { SolanaProvider } from "@solana/react-hooks";

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
  return <SolanaProvider config={defaultConfig}>{children}</SolanaProvider>;
}
