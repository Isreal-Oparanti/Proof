"use client";

import { useCallback, useEffect, useState } from "react";

export type ProofCourseRecord = {
  active: boolean;
  address: string;
  courseId: bigint;
  title: string;
  tutor: string;
  tutorName: string;
};

type ApiCourse = {
  active: boolean;
  address: string;
  courseId: string;
  title: string;
  tutor: string;
  tutorName: string;
};

export function useProofCourses() {
  const [courses, setCourses] = useState<ProofCourseRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proof/courses", {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to fetch courses.");
      }
      const data = (await res.json()) as { courses: ApiCourse[] };
      setCourses(
        data.courses
          .map((c) => ({ ...c, courseId: BigInt(c.courseId) }))
          .sort((a, b) => (a.courseId < b.courseId ? 1 : a.courseId > b.courseId ? -1 : 0)),
      );
    } catch (fetchError) {
      console.error("Failed to fetch courses", fetchError);
      setError(fetchError instanceof Error ? fetchError : new Error("Failed to fetch courses."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { courses, error, isLoading, refresh };
}
