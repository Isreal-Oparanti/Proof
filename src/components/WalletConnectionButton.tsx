"use client";

import {
  useWalletConnection,
} from "@solana/react-hooks";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

type WalletConnectionButtonProps = {
  className?: string;
  connectedLabel?: string;
};

const loadingPanelStyle: CSSProperties = {
  borderRadius: "0.95rem",
  background: "linear-gradient(160deg,#2a3b39,#253533)",
  padding: "1.25rem",
  fontSize: "0.95rem",
  color: "rgba(245,232,213,0.8)",
};

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletConnectionButton({
  className,
  connectedLabel,
}: WalletConnectionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { connect, connected, connecting, connectors, disconnect, isReady, status, wallet } =
    useWalletConnection();
  const defaultConnector = connectors[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  let label = "Connect Wallet";

  if (isDisconnecting) {
    label = "Disconnecting...";
  } else if (connecting) {
    label = "Connecting...";
  } else if (status === "connected" && wallet?.account?.address) {
    label = connectedLabel || shortenAddress(wallet.account.address.toString());
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className={[
          "inline-flex min-h-[3rem] items-center justify-center rounded-lg border border-[#253533] bg-[var(--secondary)] px-6 py-2.5 text-center text-[0.95rem] font-bold tracking-[0.03em] text-[var(--background)] disabled:cursor-not-allowed",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={async () => {
          if (connected) {
            setIsOpen((open) => !open);
            return;
          }

          if (!isReady || connecting || isDisconnecting || !defaultConnector) {
            return;
          }

          await connect(defaultConnector.id);
        }}
        disabled={!isReady || connecting || isDisconnecting || (!connected && !defaultConnector)}
      >
        {label}
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 grid min-w-[17rem] gap-2 rounded-2xl border border-[#9ab09f] bg-[var(--secondary)] p-3 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          {!isReady ? (
            <p style={{ ...loadingPanelStyle, margin: 0, wordBreak: "break-word" }}>
              Loading wallet connectors...
            </p>
          ) : connected && wallet ? (
            <>
              <p className="m-0 break-all text-[0.85rem] leading-5 text-[#253533]">
                {wallet.account.address.toString()}
              </p>
              <button
                type="button"
                className="w-full cursor-pointer  text-red-400 rounded-xl border border-[#253533] bg-[var(--secondary)] px-4 py-3 text-left text-sm font-medium text-[#253533] transition hover:bg-[#f3e7d8] disabled:cursor-progress disabled:opacity-70"
                onClick={async () => {
                  setIsDisconnecting(true);
                  try {
                    await disconnect();
                    setIsOpen(false);
                  } finally {
                    setIsDisconnecting(false);
                  }
                }}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect Wallet"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
