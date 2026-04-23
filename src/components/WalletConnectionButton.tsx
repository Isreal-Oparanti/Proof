"use client";

import {
  useWalletConnection,
} from "@solana/react-hooks";
import { useEffect, useRef, useState } from "react";
import styles from "./WalletConnectionButton.module.css";

type WalletConnectionButtonProps = {
  className: string;
  connectedLabel?: string;
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
    <div className={styles.wrapper} ref={menuRef}>
      <button
        type="button"
        className={className}
        onClick={() => setIsOpen((open) => !open)}
        disabled={!isReady || connecting || isDisconnecting}
      >
        {label}
      </button>
      {isOpen ? (
        <div className={styles.menu}>
          {!isReady ? (
            <p className={styles.address}>Loading wallet connectors...</p>
          ) : connected && wallet ? (
            <>
              <p className={styles.address}>{wallet.account.address.toString()}</p>
              <button
                type="button"
                className={styles.menuButton}
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
          ) : (
            connectors.map((connector) => (
              <button
                key={connector.id}
                type="button"
                className={styles.menuButton}
                onClick={async () => {
                  await connect(connector.id);
                  setIsOpen(false);
                }}
                disabled={connecting}
              >
                Connect {connector.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
