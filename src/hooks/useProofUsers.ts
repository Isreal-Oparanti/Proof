"use client";

import { useMemo } from "react";
import { useProgramAccounts } from "@solana/react-hooks";
import {
  coerceAccountDataBytes,
  decodeUserAccount,
  PROOF_ARCIUM_PROGRAM_ID,
} from "@/lib/proofArcium";

export type ProofUserRecord = {
  accountAddress: string;
  authority: string;
  name: string;
  role: "tutor" | "student";
};

export function useProofUsers() {
  const query = useProgramAccounts(PROOF_ARCIUM_PROGRAM_ID);

  const users = useMemo<ProofUserRecord[]>(() => {
    if (!Array.isArray(query.accounts)) {
      return [];
    }

    return query.accounts.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || !("account" in entry)) {
        return [];
      }

      const accountAddress =
        "pubkey" in entry && typeof entry.pubkey === "string" ? entry.pubkey : "";
      const bytes = coerceAccountDataBytes(entry.account);

      if (!bytes) {
        return [];
      }

      try {
        const decoded = decodeUserAccount(bytes);
        return [{ accountAddress, ...decoded }];
      } catch {
        return [];
      }
    });
  }, [query.accounts]);

  const usersByAuthority = useMemo(
    () =>
      Object.fromEntries(users.map((user) => [user.authority, user])),
    [users],
  );

  return {
    ...query,
    users,
    usersByAuthority,
  };
}
