"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";
import { WalletConnectionButton } from "./WalletConnectionButton";
import styles from "./AppNav.module.css";

type AppNavProps = {
  displayName: string;
  role: string;
};

export function AppNav({ displayName, role }: AppNavProps) {
  const router = useRouter();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { connected, disconnect, status } = useWalletConnection();
  const roleLabel = role === "tutor" ? "Tutor" : "Student";

  const sessionQuery = useMemo(() => {
    const params = new URLSearchParams({
      role: role || "student",
      name: displayName || "Learner",
    });
    return params.toString();
  }, [role, displayName]);

  return (
    <header className={styles.navWrap}>
      <nav className={styles.nav}>
        <div className={styles.leftGroup}>
          <Link href={`/courses?${sessionQuery}`} className={styles.brand}>
            Proof
          </Link>
          <span className={styles.userName}>Hi, {displayName}</span>
          <span className={styles.roleBadge}>{roleLabel}</span>
        </div>

        <div className={styles.rightGroup}>
          <WalletConnectionButton
            className={styles.walletButton}
            connectedLabel="Wallet Ready"
          />
          <button
            type="button"
            className={styles.disconnectButton}
            onClick={async () => {
              if (connected) {
                setIsDisconnecting(true);
                try {
                  await disconnect();
                } finally {
                  setIsDisconnecting(false);
                }
              }

              router.push("/");
            }}
            disabled={connectingOrDisconnecting(status, isDisconnecting)}
          >
            {isDisconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      </nav>
    </header>
  );
}

function connectingOrDisconnecting(status: string, isDisconnecting: boolean) {
  return status === "connecting" || isDisconnecting;
}
