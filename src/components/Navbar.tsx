"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";

type NavbarProps = {
  homeHref?: string;
  displayName?: string;
  role?: string;
};

type RegisteredProfile = {
  fullName: string;
  role: "student" | "tutor";
};

const REGISTERED_PROFILE_STORAGE_KEY = "proof-registered-profile";

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function Navbar({ homeHref = "/", displayName, role }: NavbarProps) {
  const router = useRouter();
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [registeredProfile, setRegisteredProfile] = useState<RegisteredProfile | null>(null);
  const { connect, connected, connecting, connectors, disconnect, isReady, status, wallet } =
    useWalletConnection();
  const isAppNav = Boolean(displayName && role);
  const roleLabel = role === "tutor" ? "Tutor" : "Student";
  const defaultConnector = connectors[0];
  const walletAddress = wallet?.account?.address?.toString();
  const profileRole = registeredProfile?.role ?? null;
  const profileRoleLabel = profileRole === "tutor" ? "Tutor" : "Student";
  const roleDotColor = profileRole === "student" ? "#7c3aed" : "#16a34a";

  const sessionQuery = useMemo(() => {
    if (!isAppNav) return "";

    const params = new URLSearchParams({
      role: role || "student",
      name: displayName || "Learner",
    });
    return params.toString();
  }, [displayName, isAppNav, role]);

  const brandHref = isAppNav ? `/courses?${sessionQuery}` : homeHref;

  useEffect(() => {
    if (!walletAddress || typeof window === "undefined") {
      setRegisteredProfile(null);
      return;
    }

    const syncRegisteredProfile = () => {
      const savedProfile = window.localStorage.getItem(
        `${REGISTERED_PROFILE_STORAGE_KEY}:${walletAddress}`,
      );

      if (!savedProfile) {
        setRegisteredProfile(null);
        return;
      }

      try {
        setRegisteredProfile(JSON.parse(savedProfile) as RegisteredProfile);
      } catch {
        window.localStorage.removeItem(
          `${REGISTERED_PROFILE_STORAGE_KEY}:${walletAddress}`,
        );
        setRegisteredProfile(null);
      }
    };

    syncRegisteredProfile();
    window.addEventListener("proof-profile-updated", syncRegisteredProfile);
    window.addEventListener("storage", syncRegisteredProfile);

    return () => {
      window.removeEventListener("proof-profile-updated", syncRegisteredProfile);
      window.removeEventListener("storage", syncRegisteredProfile);
    };
  }, [walletAddress]);

  return (
    <header
      style={{ paddingRight: "50px", paddingLeft: "50px" }}
      className={isAppNav
        ? "sticky top-0 z-10 mx-4 border border-[#9ab09f] bg-[var(--secondary)] px-2 py-[0.3rem] sm:mx-6 sm:px-3"
        : "mx-4 mb-9 border border-[#9ab09f] bg-[var(--secondary)] px-2 py-[0.28rem] shadow-[0_12px_24px_rgba(0,0,0,0.12)] sm:mx-6 sm:px-3"}
    >
      <nav
        className={isAppNav
          ? "flex min-h-[3.5rem] w-full items-center justify-between gap-4 rounded-[0.9rem] bg-[var(--secondary)] px-6 py-[0.7rem] max-[680px]:flex-col max-[680px]:items-start max-[680px]:px-4 sm:px-7"
          : "flex min-h-[4.2rem] w-full items-center justify-between gap-6 rounded-[0.9rem] bg-[var(--secondary)] px-6 py-[0.72rem] max-[640px]:px-4 sm:px-7"}
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
            : "flex shrink-0 items-center gap-[0.8rem] justify-end"}
        >
          {connected && walletAddress ? (
            <>
              {!isAppNav && registeredProfile ? (
                <div className="flex items-center gap-[0.65rem] rounded-[0.8rem] border border-[#c8d2bf] bg-[rgba(255,248,240,0.72)] px-3 py-[0.55rem] text-[#253533]">
                  <div className="min-w-0">
                    <p className="max-w-[10rem] truncate text-[0.9rem] font-semibold leading-none text-[#253533]">
                      {registeredProfile.fullName}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[0.8rem] font-medium text-[#51614f]">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: roleDotColor }}
                      />
                      <span>{profileRoleLabel}</span>
                    </div>
                  </div>
                </div>
              ) : null}
              <span className="text-[0.9rem] font-semibold tracking-[0.02em] text-[#253533]">
                {shortenAddress(walletAddress)}
              </span>
              <button
                type="button"
                className="inline-flex min-h-[2.75rem] min-w-[10.5rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[#253533] px-5 py-[0.7rem] text-center text-[0.85rem] font-semibold text-[var(--secondary)] transition hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
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
                  ? "inline-flex min-h-[2.8rem] min-w-[11rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[var(--secondary)] px-[1.3rem] py-[0.72rem] text-center text-[0.96rem] font-semibold text-[#253533] disabled:cursor-not-allowed disabled:opacity-55"
                  : "inline-flex min-h-[2.9rem] min-w-[11.5rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[var(--secondary)] px-[1.45rem] py-[0.75rem] text-center text-[1rem] font-semibold text-[#253533] transition hover:-translate-y-px hover:bg-[#f3e7d8] disabled:cursor-not-allowed disabled:opacity-55"
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
