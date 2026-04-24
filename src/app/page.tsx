"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";

type UserRole = "student" | "tutor";

type RegistrationFormData = {
  fullName: string;
  role: UserRole;
};

type ArciumStatus = {
  arciumAvailable: true;
  backupClusterOffset: number | null;
  clusterOffset: number | null;
  hasMxePublicKey: boolean;
  mode: "configured" | "demo";
};

type ArciumEncryptionResult = ArciumStatus & {
  ciphertext: number[][];
  clientPublicKeyHex: string;
  mxePublicKeyHex: string;
  nonceHex: string;
  plaintext: string[];
};

const DEVNET_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export default function Home() {
  const router = useRouter();
  const { status, wallet } = useWalletConnection();
  const [arciumStatus, setArciumStatus] = useState<ArciumStatus | null>(null);
  const [arciumError, setArciumError] = useState<string | null>(null);
  const [arciumResult, setArciumResult] = useState<ArciumEncryptionResult | null>(null);
  const [arciumValues, setArciumValues] = useState<[number, number]>([7, 21]);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: "",
    role: "student",
  });
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadArciumStatus() {
      try {
        const response = await fetch("/api/arcium/encrypt");
        const data = (await response.json()) as ArciumStatus;

        if (!response.ok) {
          throw new Error("Failed to load Arcium status.");
        }

        if (!cancelled) {
          setArciumStatus(data);
        }
      } catch (error) {
        if (!cancelled) {
          setArciumError(
            error instanceof Error ? error.message : "Failed to load Arcium status.",
          );
        }
      }
    }

    loadArciumStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const openRegister = () => {
    if (status !== "connected") return;
    setIsRegisterOpen(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formData.fullName.trim()) return;
    setIsRegistered(true);
    setIsRegisterOpen(false);
  };

  const goToCourses = () => {
    if (status !== "connected" || !isRegistered) return;
    const fullName = encodeURIComponent(formData.fullName.trim());
    router.push(`/courses?role=${formData.role}&name=${fullName}`);
  };

  const walletAddress = useMemo(() => {
    if (!wallet?.account?.address) return "No wallet connected";

    const address = wallet.account.address.toString();
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }, [wallet]);

  const isConnected = status === "connected";

  const runArciumEncryption = async () => {
    setArciumError(null);
    setIsEncrypting(true);

    try {
      const response = await fetch("/api/arcium/encrypt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: arciumValues }),
      });
      const data = (await response.json()) as ArciumEncryptionResult | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Arcium encryption failed.");
      }

      setArciumStatus(data);
      setArciumResult(data);
    } catch (error) {
      setArciumError(
        error instanceof Error ? error.message : "Arcium encryption failed.",
      );
    } finally {
      setIsEncrypting(false);
    }
  };

  return (
    <div className="min-h-screen pt-8 pb-12 font-[family:var(--font-geist-sans)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <main className="mx-auto grid w-full max-w-[1200px] items-center gap-[clamp(1.5rem,4vw,4rem)] md:grid-cols-[1.1fr_1fr]">
 
        </main>
      </div>

      {isRegisterOpen && (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-[rgba(4,11,10,0.62)]"
          onClick={() => setIsRegisterOpen(false)}
        >
          <div
            className="w-[min(92vw,420px)] rounded-[1.05rem] border border-[#bdc79f] bg-[var(--secondary)] p-[1.3rem] shadow-[0_18px_40px_rgba(5,14,13,0.4)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-2 text-[1.7rem] tracking-[0.03em] text-[#233525]">
              Register Your Account
            </h2>
            <p className="mb-[1.1rem] text-base leading-[1.45] text-[#3e4f3d]">
              Set up your profile to start learning or publishing courses.
            </p>
            <form onSubmit={handleSubmit} className="grid gap-[0.6rem]">
              <label htmlFor="fullName" className="text-[0.9rem] font-semibold text-[#243527]">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                value={formData.fullName}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, fullName: event.target.value }))
                }
                placeholder="Enter your full name"
                className="w-full rounded-[0.8rem] border border-[#b6c3a3] bg-[var(--secondary)] px-[0.9rem] py-[0.76rem] text-[#1b2c1d] outline-none focus:border-[#2f4331] focus:ring-2 focus:ring-[rgba(35,53,37,0.2)]"
                required
              />

              <label htmlFor="role" className="text-[0.9rem] font-semibold text-[#243527]">
                Role
              </label>
              <select
                id="role"
                value={formData.role}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    role: event.target.value as UserRole,
                  }))
                }
                className="w-full rounded-[0.8rem] border border-[#b6c3a3] bg-[var(--secondary)] px-[0.9rem] py-[0.76rem] text-[#1b2c1d] outline-none focus:border-[#2f4331] focus:ring-2 focus:ring-[rgba(35,53,37,0.2)]"
              >
                <option value="student">Student</option>
                <option value="tutor">Tutor</option>
              </select>

              <button
                type="submit"
                className="cursor-pointer rounded-full border border-[#89a391] bg-[#0f1f1d] px-[1.3rem] py-[0.78rem] font-semibold tracking-[0.03em] text-[var(--secondary)] transition hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Register Now
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
