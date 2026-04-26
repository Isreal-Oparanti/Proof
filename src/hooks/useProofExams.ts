"use client";

import { useCallback, useEffect, useState } from "react";

export type ProofExamRecord = {
  address: string;
  courseId: bigint;
  examId: bigint;
  questionCount: number;
  title: string;
  tutor: string;
};

type ApiExam = {
  address: string;
  courseId: string;
  examId: string;
  questionCount: number;
  title: string;
  tutor: string;
};

export function useProofExams() {
  const [exams, setExams] = useState<ProofExamRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proof/exams", {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to fetch exams.");
      }
      const data = (await res.json()) as { exams: ApiExam[] };
      setExams(
        data.exams
          .map((e) => ({ ...e, courseId: BigInt(e.courseId), examId: BigInt(e.examId) }))
          .sort((a, b) => (a.examId < b.examId ? 1 : a.examId > b.examId ? -1 : 0)),
      );
    } catch (fetchError) {
      console.error("Failed to fetch exams", fetchError);
      setError(fetchError instanceof Error ? fetchError : new Error("Failed to fetch exams."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { exams, error, isLoading, refresh };
}
