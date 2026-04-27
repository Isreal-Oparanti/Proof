"use client";

import { useEffect, useState } from "react";

export type ExamQuestion = {
  options: string[];
  prompt: string;
};

export type ExamContent = {
  questions: ExamQuestion[];
  title: string;
};

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; content: ExamContent };

/**
 * Fetches exam questions from MongoDB.
 *
 * Access is gated server-side: the API checks that the studentWallet
 * has a granted ExamAccess account on-chain before returning questions.
 *
 * The link between on-chain and off-chain is the examId:
 *   on-chain Exam account (exam_id) ──► MongoDB document (examId)
 */
export function useExamContent(examId: string | null, studentWallet: string | null) {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  useEffect(() => {
    if (!examId || !studentWallet) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    const params = new URLSearchParams({ examId, wallet: studentWallet });

    fetch(`/api/exam/content?${params.toString()}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          setState({ status: "error", message: err.error ?? "Failed to load exam." });
          return;
        }
        const content = (await res.json()) as ExamContent;
        setState({ status: "success", content });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load exam.",
        });
      });

    return () => { cancelled = true; };
  }, [examId, studentWallet]);

  return state;
}
