"use client";

import { useEffect, useState } from "react";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; correctAnswers: number[] };

/**
 * Fetches the correct answers for an exam after the student's session is graded.
 *
 * The API checks on-chain that session.completed = true before decrypting
 * and returning the answers (which are Arcium-encrypted in MongoDB).
 *
 * Usage: call once the session is marked completed on-chain, then display
 * correctAnswers[i] alongside the student's own submitted answer for revision.
 */
export function useExamAnswers(examId: string | null, studentWallet: string | null) {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  useEffect(() => {
    if (!examId || !studentWallet) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    const params = new URLSearchParams({ examId, studentWallet });

    fetch(`/api/exam/answers?${params.toString()}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          setState({ status: "error", message: err.error ?? "Failed to load answers." });
          return;
        }
        const data = (await res.json()) as { correctAnswers: number[] };
        setState({ status: "success", correctAnswers: data.correctAnswers });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load answers.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [examId, studentWallet]);

  return state;
}
