"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";
import toast from "react-hot-toast";
import { useProofArcium } from "@/hooks/useProofArcium";

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

type PlanFailureLike = {
  error?: unknown;
  kind?: string;
  logs?: string[];
  message?: string;
  plans?: PlanFailureLike[];
  status?: string;
  transactionPlanResult?: PlanFailureLike;
};

const REGISTERED_PROFILE_STORAGE_KEY = "proof-registered-profile";

const DEVNET_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

function getLastLogLine(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("logs" in value && Array.isArray(value.logs) && value.logs.length > 0) {
    const lastLine = value.logs.at(-1);
    return typeof lastLine === "string" ? lastLine : null;
  }

  if ("context" in value && value.context && typeof value.context === "object") {
    return getLastLogLine(value.context);
  }

  if ("cause" in value && value.cause) {
    return getLastLogLine(value.cause);
  }

  return null;
}

function getMessageFromUnknownError(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return null;
}

function getFirstFailedPlanError(plan: unknown): unknown {
  if (!plan || typeof plan !== "object") {
    return null;
  }

  const typedPlan = plan as PlanFailureLike;

  if (typedPlan.kind === "single" && typedPlan.status === "failed" && typedPlan.error) {
    return typedPlan.error;
  }

  if (Array.isArray(typedPlan.plans)) {
    for (const nestedPlan of typedPlan.plans) {
      const nestedError = getFirstFailedPlanError(nestedPlan);
      if (nestedError) {
        return nestedError;
      }
    }
  }

  return null;
}

function getDetailedErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "transactionPlanResult" in error) {
    const failedPlanError = getFirstFailedPlanError(error.transactionPlanResult);
    const failedMessage = getMessageFromUnknownError(failedPlanError);
    const lastLogLine = getLastLogLine(failedPlanError);

    if (failedMessage && lastLogLine && lastLogLine !== failedMessage) {
      return `${failedMessage} (${lastLogLine})`;
    }

    if (failedMessage) {
      return failedMessage;
    }
  }

  return getMessageFromUnknownError(error) || fallback;
}

export default function Home() {
  const router = useRouter();
  const { status, wallet } = useWalletConnection();
  const proofArcium = useProofArcium();
  const [arciumStatus, setArciumStatus] = useState<ArciumStatus | null>(null);
  const [arciumError, setArciumError] = useState<string | null>(null);
  const [arciumResult, setArciumResult] = useState<ArciumEncryptionResult | null>(null);
  const [arciumValues, setArciumValues] = useState<[number, number]>([7, 21]);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: "",
    role: "student",
  });
  const [registeredWalletAddress, setRegisteredWalletAddress] = useState<string | null>(null);
  const connectedWalletAddress = wallet?.account?.address?.toString() ?? null;
  const isRegistered =
    connectedWalletAddress !== null &&
    registeredWalletAddress === connectedWalletAddress;

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
          const message =
            error instanceof Error ? error.message : "Failed to load Arcium status.";
          setArciumError(message);
          toast.error(message);
        }
      }
    }

    loadArciumStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connectedWalletAddress || typeof window === "undefined") {
      return;
    }

    const savedProfile = window.localStorage.getItem(
      `${REGISTERED_PROFILE_STORAGE_KEY}:${connectedWalletAddress}`,
    );

    if (!savedProfile) {
      return;
    }

    try {
      const parsedProfile = JSON.parse(savedProfile) as RegistrationFormData;
      setFormData(parsedProfile);
      setRegisteredWalletAddress(connectedWalletAddress);
    } catch {
      window.localStorage.removeItem(
        `${REGISTERED_PROFILE_STORAGE_KEY}:${connectedWalletAddress}`,
      );
    }
  }, [connectedWalletAddress]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = formData.fullName.trim();
    if (!trimmedName) {
      toast.error("Enter your full name to continue.");
      return;
    }

    if (!connectedWalletAddress) {
      toast.error("Connect a wallet before creating a profile.");
      return;
    }

    proofArcium.reset();

    try {
      await proofArcium.registerUser({
        name: trimmedName,
        role: formData.role,
      });

      if (typeof window !== "undefined") {
        const registeredProfile = {
          fullName: trimmedName,
          role: formData.role,
        } satisfies RegistrationFormData;

        window.localStorage.setItem(
          `${REGISTERED_PROFILE_STORAGE_KEY}:${connectedWalletAddress}`,
          JSON.stringify(registeredProfile),
        );
        window.dispatchEvent(new Event("proof-profile-updated"));
      }

      setFormData((prev) => ({
        ...prev,
        fullName: trimmedName,
      }));
      setRegisteredWalletAddress(connectedWalletAddress);
      toast.success(`Registered ${trimmedName} as ${formData.role}.`);
    } catch (error) {
      console.error("Registration transaction failed", error);
      toast.error(getDetailedErrorMessage(error, "Failed to register user."));
    }
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
      const message =
        error instanceof Error ? error.message : "Arcium encryption failed.";
      setArciumError(message);
      toast.error(message);
    } finally {
      setIsEncrypting(false);
    }
  };

  return (
    <div className="min-h-screen pt-8 pb-12 font-[family:var(--font-geist-sans)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <main
          className={
            status === "connected" && !isRegistered
              ? "mx-auto flex min-h-[calc(100vh-8rem)] w-full items-center justify-center"
              : "mx-auto grid min-h-[calc(100vh-8rem)] w-full max-w-[1200px] items-center gap-[clamp(1.5rem,4vw,4rem)] md:grid-cols-[1.1fr_1fr]"
          }
        >
          {status === "connected" && !isRegistered ? (
            <section className="flex w-full items-center justify-center py-6">
              <div
                style={{ padding: "18px 20px" }}
                className="w-full max-w-[460px] rounded-[0.95rem] border border-[#bdc79f] bg-[var(--secondary)] shadow-[0_18px_40px_rgba(5,14,13,0.4)]"
              >
                <h2
                  style={{ marginBottom: "4px" }}
                  className="text-[1.6rem] leading-none tracking-[0.02em] text-[#233525]"
                >
                  Register Your Account
                </h2>
                <p className="text-[0.95rem] text-[#3e4f3d]">
                  Create your on-chain user profile before continuing.
                </p>
                <form
                  onSubmit={handleSubmit}
                  style={{ marginTop: "12px" }}
                  className="rounded-[0.85rem] bg-[rgba(255,255,255,0.2)]"
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                      padding: "14px 18px",
                    }}
                    className="sm:px-10 sm:py-7"
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      <label
                        htmlFor="fullName"
                        className="text-[0.98rem] font-semibold text-[#243527]"
                      >
                        Full name
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        value={formData.fullName}
                        style={{ paddingInline: "20px" }}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, fullName: event.target.value }))
                        }
                        placeholder="Enter your full name"
                        className="min-h-[3.1rem] w-full rounded-[0.65rem] border border-[#b6c3a3] bg-[var(--secondary)] py-[0.8rem] text-[1rem] text-[#1b2c1d] outline-none placeholder:text-[#94a08f] focus:border-[#2f4331] focus:ring-2 focus:ring-[rgba(35,53,37,0.2)]"
                        required
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      <label htmlFor="role" className="text-[0.98rem] font-semibold text-[#243527]">
                        Role
                      </label>
                      <select
                        id="role"
                        value={formData.role}
                        style={{ paddingInline: "20px" }}
                        onChange={(event) =>
                          setFormData((prev) => ({
                            ...prev,
                            role: event.target.value as UserRole,
                          }))
                        }
                        className="min-h-[3.1rem] w-full rounded-[0.65rem] border border-[#b6c3a3] bg-[var(--secondary)] py-[0.8rem] text-[1rem] text-[#1b2c1d] outline-none focus:border-[#2f4331] focus:ring-2 focus:ring-[rgba(35,53,37,0.2)]"
                      >
                        <option value="student">Student</option>
                        <option value="tutor">Tutor</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      style={{ marginTop: "0" }}
                      className="inline-flex min-h-[3rem] min-w-[12rem] cursor-pointer items-center justify-center rounded-[0.72rem] border border-[#89a391] bg-[#0f1f1d] px-6 py-[0.8rem] text-[1rem] font-semibold tracking-[0.02em] text-[var(--secondary)] transition hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={proofArcium.isSending}
                    >
                      {proofArcium.isSending ? "Registering..." : "Register"}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
