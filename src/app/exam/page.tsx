"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";
import { useProofCourses } from "@/hooks/useProofCourses";
import type { AssessmentQuestion } from "../../data/dummyAssessments";

type ExamCatalogItem = {
  id: string;
  lessons: number;
  level: string;
  questions: AssessmentQuestion[];
  statusLabel: string;
  title: string;
  tutor: string;
};

function ExamPageContent() {
  const searchParams = useSearchParams();
  const { wallet } = useWalletConnection();
  const courseQuery = useProofCourses();
  const role = (searchParams.get("role") || "student").toLowerCase();
  const nameParam = searchParams.get("name") || "Learner";
  const decodedName = decodeURIComponent(nameParam);
  const isTutor = role === "tutor";
  const connectedWalletAddress = wallet?.account?.address?.toString() ?? null;

  const backHref = useMemo(() => {
    const params = new URLSearchParams({
      role,
      name: decodedName,
    });
    return `/courses?${params.toString()}`;
  }, [role, decodedName]);

  const defaultQuestions = useMemo<AssessmentQuestion[]>(
    () => [
      { prompt: "What is the primary goal of on-chain assessment records?", options: ["Privacy", "Immutability", "Speed only", "UI polish"] },
      { prompt: "Which layer stores the tamper-proof score in Proof?", options: ["Browser cache", "Solana", "Email", "Spreadsheet"] },
    ],
    [],
  );

  const visibleExamCatalog = useMemo<ExamCatalogItem[]>(() => {
    const visibleCourses =
      isTutor && connectedWalletAddress
        ? courseQuery.courses.filter((course) => course.tutor === connectedWalletAddress)
        : courseQuery.courses;

    return visibleCourses.map((course) => ({
      id: course.courseId.toString(),
      lessons: defaultQuestions.length,
      level: course.active ? "Published" : "Draft",
      questions: defaultQuestions,
      statusLabel: course.active ? "Active" : "Inactive",
      title: course.title,
      tutor: course.tutorName || `${course.tutor.slice(0, 4)}...${course.tutor.slice(-4)}`,
    }));
  }, [connectedWalletAddress, courseQuery.courses, defaultQuestions, isTutor]);

  return (
    <div className="min-h-screen bg-[#253533] text-[#eef6ed]">
      <div className="mx-auto max-w-[900px] px-[clamp(0.85rem,3vw,2rem)] pt-5 pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-[0.4rem] text-[clamp(1.35rem,2.4vw,1.85rem)] leading-tight">
            {isTutor ? "Your created assessments" : "Available assessments"}
          </h1>
          <p className="max-w-[52ch] text-[0.95rem] leading-[1.55] text-[var(--secondary)]/80">
            {isTutor
              ? "Exam entries derived from the on-chain courses under your tutor wallet."
              : "Assessments derived from the full on-chain course catalog."}
          </p>
        </div>
        <Link
          href={backHref}
          className="self-center rounded-full border border-[#93ab9c] bg-[var(--secondary)] px-[1.15rem] py-[0.72rem] text-[0.9rem] font-bold text-[#102320]"
        >
          Back to courses
        </Link>
      </header>

      {courseQuery.isLoading ? (
        <p className="m-0 text-[var(--secondary)]/80">Loading on-chain assessments...</p>
      ) : visibleExamCatalog.length === 0 ? (
        <p className="m-0 text-[var(--secondary)]/80">
          {isTutor
            ? "No created assessments yet. Create a course from the courses page first."
            : "No on-chain assessments available yet."}
        </p>
      ) : (
        <ul className="grid list-none gap-[1.1rem] p-0">
          {visibleExamCatalog.map((item) => {
            return (
              <li key={item.id} className="rounded-2xl border border-[#4d6661] bg-[#2b3c3a] px-[1.2rem] py-[1.15rem]">
                <h2 className="mb-[0.35rem] text-[1.15rem]">{item.title}</h2>
                <p className="mb-[0.85rem] text-[0.9rem] text-[var(--secondary)]/78">
                  Tutor: {item.tutor} · {item.level} · {item.lessons} question(s)
                </p>
                <p className="mb-[0.85rem] text-[0.9rem] text-[var(--secondary)]/78">
                  Assessment #{item.id} · {item.statusLabel}
                </p>
                <div className="border-t border-[#4a5f5b] pt-[0.85rem]">
                  <h3 className="mb-[0.6rem] text-[0.82rem] font-medium uppercase tracking-[0.08em] text-[var(--secondary)]/74">
                    Assessment content
                  </h3>
                  <ol className="grid list-decimal gap-[0.85rem] pl-[1.1rem]">
                    {item.questions.map((q, idx) => (
                      <li key={idx} className="text-[#dfece3]">
                        <p className="mb-[0.4rem] text-[0.95rem] font-semibold">{q.prompt}</p>
                        <ul className="list-disc pl-4 text-[0.88rem] text-[var(--secondary)]/76">
                          {q.options.map((opt, oi) => (
                            <li key={oi} className="mb-[0.2rem]">{opt}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#253533]" />}>
      <ExamPageContent />
    </Suspense>
  );
}
