"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSolanaClient } from "@solana/react-hooks";
import {
  coerceAccountDataBytes,
  decodeExamAccount,
  PROOF_ARCIUM_PROGRAM_ID,
} from "@/lib/proofArcium";

export type ProofExamRecord = {
  address: string;
  courseId: bigint;
  examId: bigint;
  questionCount: number;
  title: string;
  tutor: string;
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

export function useProofExams() {
  const client = useSolanaClient();
  const [rawAccounts, setRawAccounts] = useState<ProgramAccountEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await client.runtime.rpc
        .getProgramAccounts(PROOF_ARCIUM_PROGRAM_ID, { encoding: "base64" })
        .send({ abortSignal: AbortSignal.timeout(20_000) });

      setRawAccounts(normalizeProgramAccounts(response));
    } catch (fetchError) {
      const normalizedError =
        fetchError instanceof Error
          ? fetchError
          : new Error("Failed to fetch Proof Arcium program accounts.");

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

  const exams = useMemo<ProofExamRecord[]>(() => {
    if (rawAccounts.length === 0) {
      return [];
    }

    return rawAccounts
      .flatMap((entry) => {
        if (!entry || typeof entry !== "object" || !("account" in entry)) {
          return [];
        }

        const entryAddress =
          "pubkey" in entry && typeof entry.pubkey === "string" ? entry.pubkey : "";
        const bytes = coerceAccountDataBytes(entry.account);

        if (!bytes) {
          return [];
        }

        try {
          const decoded = decodeExamAccount(bytes);
          return [{ address: entryAddress, ...decoded }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => {
        if (a.examId === b.examId) return 0;
        return a.examId < b.examId ? 1 : -1;
      });
  }, [rawAccounts]);

  return {
    exams,
    error,
    isLoading,
    refresh,
  };
}
