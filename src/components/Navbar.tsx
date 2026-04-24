"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";

type NavbarProps = {
  homeHref?: string;
  displayName?: string;
  role?: string;
};

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function Navbar({ homeHref = "/", displayName, role }: NavbarProps) {
  const router = useRouter();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { connect, connected, connecting, connectors, disconnect, isReady, status, wallet } =
    useWalletConnection();
  const isAppNav = Boolean(displayName && role);
  const roleLabel = role === "tutor" ? "Tutor" : "Student";
  const defaultConnector = connectors[0];
  const walletAddress = wallet?.account?.address?.toString();

  const sessionQuery = useMemo(() => {
    if (!isAppNav) return "";

    const params = new URLSearchParams({
      role: role || "student",
      name: displayName || "Learner",
    });
    return params.toString();
  }, [displayName, isAppNav, role]);

  const brandHref = isAppNav ? `/courses?${sessionQuery}` : homeHref;

  return (
    <header
    style={{ paddingRight : "50px", paddingLeft: "50px" }}
      className={isAppNav
        ? "sticky top-0 z-10 mx-4  border border-[#9ab09f] bg-[var(--secondary)] px-2 py-[0.45rem] sm:mx-6 sm:px-3"
        : "mx-4 mb-9  border border-[#9ab09f] bg-[var(--secondary)] px-2 py-[0.4rem] shadow-[0_12px_24px_rgba(0,0,0,0.12)] sm:mx-6 sm:px-3"}
    >
      <nav
        className={isAppNav
          ? "flex min-h-16 w-full items-center justify-between gap-4 rounded-[0.9rem] bg-[var(--secondary)] px-6 py-3 max-[680px]:flex-col max-[680px]:items-start max-[680px]:px-4 sm:px-7"
          : "flex min-h-[76px] w-full items-center justify-between gap-6 rounded-[0.9rem] bg-[var(--secondary)] px-6 py-3 max-[640px]:px-4 sm:px-7"}
      >
        <div className={isAppNav ? "flex items-center gap-[0.65rem]" : undefined}>
          <Link
            href={brandHref}
            className={isAppNav ? "text-base tracking-[0.03em] text-[#253533]" : "inline-flex items-center text-base tracking-[0.03em] text-[#253533]"}
            style={{ color: "#253533", fontWeight: 700 }}
          >
            Proof
          </Link>

          {isAppNav ? (
            <>
              <span className="text-[0.92rem] text-[#253533]">Hi, {displayName}</span>
              <span className="rounded-full border border-[#253533] bg-[#253533] px-[0.6rem] py-[0.3rem] text-[0.78rem] font-bold text-[var(--secondary)]">
                {roleLabel}
              </span>
            </>
          ) : null}
        </div>

        <div
          className={isAppNav
            ? "flex items-center gap-[0.65rem] max-[680px]:w-full max-[680px]:justify-end"
            : "flex shrink-0 items-center gap-[0.65rem] justify-end"}
        >
          {connected && walletAddress ? (
            <>
              <span className="text-[0.9rem] font-semibold tracking-[0.02em] text-[#253533]">
                {shortenAddress(walletAddress)}
              </span>
              <button
                type="button"
                className="inline-flex min-h-[3rem] min-w-[11rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[#253533] px-5 py-3 text-center text-[0.85rem] font-semibold text-[var(--secondary)] transition hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                onClick={async () => {
                  setIsDisconnecting(true);
                  try {
                    await disconnect();
                  } finally {
                    setIsDisconnecting(false);
                  }

                  if (isAppNav) {
                    router.push("/");
                  }
                }}
                disabled={status === "connecting" || isDisconnecting}
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={
                isAppNav
                  ? "min-w-[11rem] cursor-pointer rounded-lg border border-[#253533] bg-[var(--secondary)] px-5 py-3 text-center text-[0.85rem] font-semibold text-[#253533] disabled:cursor-not-allowed disabled:opacity-55"
                  : "min-w-[11.5rem] cursor-pointer rounded-lg border border-[#253533] bg-[var(--secondary)] px-6 py-3 text-[0.95rem] font-semibold text-[#253533] transition hover:-translate-y-px hover:bg-[#f3e7d8] disabled:cursor-not-allowed disabled:opacity-55"
              }
              onClick={async () => {
                if (!isReady || connecting || !defaultConnector) {
                  return;
                }

                await connect(defaultConnector.id);
              }}
              disabled={!isReady || connecting || !defaultConnector}
            >
              {connecting ? "Connecting..." : "Connect Wallet"}
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
