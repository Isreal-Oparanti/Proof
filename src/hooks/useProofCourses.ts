"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSolanaClient } from "@solana/react-hooks";
import {
  coerceAccountDataBytes,
  decodeCourseAccount,
  PROOF_ARCIUM_PROGRAM_ID,
} from "@/lib/proofArcium";

export type ProofCourseRecord = {
  active: boolean;
  address: string;
  courseId: bigint;
  title: string;
  tutor: string;
  tutorName: string;
};

type ProgramAccountEntry = {
  pubkey?: string;
  account?: unknown;
};

function normalizeProgramAccounts(accounts: unknown): ProgramAccountEntry[] {
  if (Array.isArray(accounts)) {
    return accounts;
  }

  if (
    accounts &&
    typeof accounts === "object" &&
    "value" in accounts &&
    Array.isArray(accounts.value)
  ) {
    return accounts.value;
  }

  return [];
}

export function useProofCourses() {
  const client = useSolanaClient();
  const [rawAccounts, setRawAccounts] = useState<ProgramAccountEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await client.runtime.rpc.getProgramAccounts(PROOF_ARCIUM_PROGRAM_ID, {
        encoding: "base64",
      }).send({ abortSignal: AbortSignal.timeout(20_000) });

      setRawAccounts(normalizeProgramAccounts(response));
    } catch (fetchError) {
      const normalizedError =
        fetchError instanceof Error
          ? fetchError
          : new Error("Failed to fetch Proof Arcium program accounts.");

      console.error("Failed to fetch Proof Arcium program accounts", normalizedError);
      setRawAccounts([]);
      setError(normalizedError);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const courses = useMemo<ProofCourseRecord[]>(() => {
    if (rawAccounts.length === 0) {
      return [];
    }

    return rawAccounts.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || !("account" in entry)) {
        return [];
      }

      const address =
        "pubkey" in entry && typeof entry.pubkey === "string" ? entry.pubkey : "";
      const bytes = coerceAccountDataBytes(entry.account);

      if (!bytes) {
        console.log("Program account did not normalize to bytes", {
          address,
          rawAccount: entry.account,
        });
        return [];
      }

      try {
        const decoded = decodeCourseAccount(bytes);
        console.log("Decoded course account", {
          address,
          decoded,
        });
        return [{ address, ...decoded }];
      } catch (error) {
        console.log("Program account did not decode as Course", {
          address,
          error: error instanceof Error ? error.message : error,
          normalizedByteLength: bytes.length,
          normalizedBytePreview: Array.from(bytes.slice(0, 32)),
        });
        return [];
      }
    }).sort((left, right) => {
      if (left.courseId === right.courseId) {
        return 0;
      }

      return left.courseId < right.courseId ? 1 : -1;
    });
  }, [rawAccounts]);

  useEffect(() => {
    console.log("Fetched raw program accounts for Proof Arcium", {
      rawQueryAccounts: rawAccounts,
      totalAccounts: rawAccounts.length,
      accountAddresses: rawAccounts.flatMap((entry) =>
        entry && typeof entry === "object" && "pubkey" in entry && typeof entry.pubkey === "string"
          ? [entry.pubkey]
          : [],
      ),
      fetchError: error?.message ?? null,
    });
    console.log("Fetched decoded on-chain courses", courses);
  }, [courses, error, rawAccounts]);

  return {
    accounts: rawAccounts,
    courses,
    error,
    isLoading,
    refresh,
  };
}
