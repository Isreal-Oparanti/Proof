"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { findEnrollmentPda } from "@/lib/proofArcium";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/**
 * Returns a Set of course IDs (as strings) that the given student is enrolled in.
 * Refreshes whenever the courseIds list or studentWallet changes.
 */
export function useEnrollments(
  courseIds: bigint[],
  studentWallet: string | null,
): Set<string> {
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!studentWallet || courseIds.length === 0) {
      setEnrolled(new Set());
      return;
    }

    let cancelled = false;

    async function check() {
      const conn = new Connection(RPC_URL, "confirmed");
      const results = await Promise.all(
        courseIds.map(async (id) => {
          try {
            const pda = await findEnrollmentPda(id, studentWallet!);
            const info = await conn.getAccountInfo(new PublicKey(pda));
            return info !== null ? id.toString() : null;
          } catch {
            return null;
          }
        }),
      );

      if (!cancelled) {
        setEnrolled(new Set(results.filter((r): r is string => r !== null)));
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    courseIds.map((id) => id.toString()).join(","),
    studentWallet,
  ]);

  return enrolled;
}
