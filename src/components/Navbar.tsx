"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useWalletConnection } from "@solana/react-hooks";
import { coerceAccountDataBytes, decodeUserAccount, findUserPda } from "@/lib/proofArcium";

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
  const [userPdaAddress, setUserPdaAddress] = useState<string | null>(null);
  const { connect, connected, connecting, connectors, disconnect, isReady, status, wallet } =
    useWalletConnection();
  const isAppNav = Boolean(displayName && role);
  const defaultConnector = connectors[0];
  const walletAddress = wallet?.account?.address?.toString();
  const userAccount = useAccount(userPdaAddress ?? undefined, {
    fetch: true,
    skip: !userPdaAddress,
    watch: true,
  });
  const onChainProfile = useMemo(() => {
    const accountBytes =
      userAccount && typeof userAccount === "object" && "data" in userAccount
        ? coerceAccountDataBytes(userAccount.data)
        : null;

    if (
      !walletAddress ||
      !userAccount ||
      typeof userAccount !== "object" ||
      userAccount.fetching ||
      userAccount.owner === null ||
      userAccount.lamports === null ||
      userAccount.data === undefined ||
      !accountBytes
    ) {
      return null;
    }

    try {
      const decodedProfile = decodeUserAccount(accountBytes);
      // console.log("Fetched on-chain user profile (navbar)", decodedProfile);
      // console.log("Readable on-chain user name (navbar)", decodedProfile.name);
      // console.log("Readable on-chain user role (navbar)", decodedProfile.role);
      return decodedProfile;
    } catch (error) {
      console.error("Failed to decode navbar user account", {
        error,
        rawData: "data" in userAccount ? userAccount.data : null,
        normalizedBytes: Array.from(accountBytes),
      });
      return null;
    }
  }, [userAccount, walletAddress]);
  const resolvedDisplayName = displayName ?? onChainProfile?.name ?? null;
  const resolvedRole = role ?? onChainProfile?.role ?? null;
  const roleLabel = resolvedRole === "tutor" ? "Tutor" : "Student";
  const profileRole = resolvedRole;
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

  const brandHref = isAppNav ? `/?${sessionQuery}` : homeHref;

  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(async () => {
        if (!walletAddress) {
          queueMicrotask(() => setUserPdaAddress(null));
          return;
        }

        const pda = await findUserPda(walletAddress);
        console.log("Derived user PDA (navbar)", {
          walletAddress,
          userPda: pda,
        });
        if (!cancelled) {
          setUserPdaAddress(pda);
        }
      })
      .catch((error) => {
        console.error("Failed to derive navbar user PDA", error);
        if (!cancelled) {
          setUserPdaAddress(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  useEffect(() => {
    if (!userPdaAddress) {
      return;
    }

    const accountBytes =
      userAccount && typeof userAccount === "object" && "data" in userAccount
        ? coerceAccountDataBytes(userAccount.data)
        : null;

    console.log("Fetched raw user account (navbar)", {
      userPdaAddress,
      exists:
        userAccount && typeof userAccount === "object" && "exists" in userAccount
          ? userAccount.exists
          : null,
      fetching:
        userAccount && typeof userAccount === "object" && "fetching" in userAccount
          ? userAccount.fetching
          : null,
      owner:
        userAccount && typeof userAccount === "object" && "owner" in userAccount
          ? userAccount.owner
          : null,
      lamports:
        userAccount && typeof userAccount === "object" && "lamports" in userAccount
          ? userAccount.lamports
          : null,
      rawData:
        userAccount && typeof userAccount === "object" && "data" in userAccount
          ? userAccount.data
          : null,
      rawDataKeys:
        userAccount &&
        typeof userAccount === "object" &&
        "data" in userAccount &&
        userAccount.data &&
        typeof userAccount.data === "object"
          ? Object.keys(userAccount.data)
          : null,
      normalizedByteLength: accountBytes?.length ?? null,
      normalizedBytePreview: accountBytes ? Array.from(accountBytes.slice(0, 24)) : null,
      userAccount,
    });
  }, [userAccount, userPdaAddress]);

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
        <div className="flex items-center gap-[0.65rem]">
          <Link
            href={brandHref}
            className={isAppNav ? "text-base tracking-[0.03em] text-[#253533]" : "inline-flex items-center text-base tracking-[0.03em] text-[#253533]"}
            style={{ color: "#253533", fontWeight: 700 }}
          >
            Proof
          </Link>

          {resolvedDisplayName && resolvedRole ? (
            <>
              <span className="text-[0.92rem] text-[#253533]">Hi, {resolvedDisplayName}</span>
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
              <span className="text-[0.9rem] font-semibold tracking-[0.02em] text-[#253533]">
                {shortenAddress(walletAddress)}
              </span>
              <button
                type="button"
                className="inline-flex min-h-[2.75rem] min-w-[10.5rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[#253533] px-5 py-[0.7rem] text-center text-[0.85rem] font-semibold text-[var(--secondary)] transition hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed"
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
              style={{
                color: "var(--background)",
                opacity: 1,
                WebkitTextFillColor: "var(--background)",
              }}
              className={
                isAppNav
                  ? "inline-flex min-h-[2.8rem] min-w-[11rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[var(--secondary)] px-[1.3rem] py-[0.72rem] text-center text-[0.96rem] font-semibold disabled:cursor-not-allowed"
                  : "inline-flex min-h-[2.9rem] min-w-[11.5rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[var(--secondary)] px-[1.45rem] py-[0.75rem] text-center text-[1rem] font-semibold transition hover:-translate-y-px hover:bg-[#f3e7d8] disabled:cursor-not-allowed"
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
