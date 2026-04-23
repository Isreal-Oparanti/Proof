"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";
import { WalletConnectionButton } from "../components/WalletConnectionButton";
import styles from "./page.module.css";

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
    <div className={styles.page}>
      <div className={styles.navWrap}>
        <nav className={styles.nav}>
          <div className={styles.brand}>
            <span className={styles.techFont}>Proof</span>
          </div>
          <div className={styles.navActions}>
            <WalletConnectionButton
              className={`${styles.primaryButton} ${styles.techFont}`}
              connectedLabel="Wallet Ready"
            />
          </div>
        </nav>
      </div>

      <main className={styles.main}>
 
      </main>

      {isRegisterOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsRegisterOpen(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h2 className={styles.techFont}>Register Your Account</h2>
            <p>Set up your profile to start learning or publishing courses.</p>
            <form onSubmit={handleSubmit} className={styles.form}>
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                type="text"
                value={formData.fullName}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, fullName: event.target.value }))
                }
                placeholder="Enter your full name"
                required
              />

              <label htmlFor="role">Role</label>
              <select
                id="role"
                value={formData.role}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    role: event.target.value as UserRole,
                  }))
                }
              >
                <option value="student">Student</option>
                <option value="tutor">Tutor</option>
              </select>

              <button type="submit" className={`${styles.primaryButton} ${styles.techFont}`}>
                Register Now
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
