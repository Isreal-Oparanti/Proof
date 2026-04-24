"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DUMMY_ASSESSMENTS } from "../../data/dummyAssessments";
import type { Assessment, AssessmentQuestion } from "../../data/dummyAssessments";

function readStoredAssessments(key: string): Assessment[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Assessment[]) : [];
  } catch {
    return [];
  }
}

function ExamPageContent() {
  const searchParams = useSearchParams();
  const role = (searchParams.get("role") || "student").toLowerCase();
  const nameParam = searchParams.get("name") || "Learner";
  const decodedName = decodeURIComponent(nameParam);
  const isTutor = role === "tutor";

  const tutorKey = `proof-accessments-${decodedName.toLowerCase()}`;
  const enrollKey = `proof-enrolled-${decodedName.toLowerCase()}`;

  const [tutorAssessments] = useState<Assessment[]>(() =>
    isTutor ? readStoredAssessments(tutorKey) : [],
  );
  const [enrolledAssessments] = useState<Assessment[]>(() =>
    isTutor ? [] : readStoredAssessments(enrollKey),
  );

  const backHref = useMemo(() => {
    const params = new URLSearchParams({
      role,
      name: decodedName,
    });
    return `/courses?${params.toString()}`;
  }, [role, decodedName]);

  const defaultQuestions: AssessmentQuestion[] = [
    { prompt: "What is the primary goal of on-chain assessment records?", options: ["Privacy", "Immutability", "Speed only", "UI polish"] },
    { prompt: "Which layer stores the tamper-proof score in Proof?", options: ["Browser cache", "Solana", "Email", "Spreadsheet"] },
  ];

  const enrichWithExamContent = (item: Assessment): Assessment & { questions: AssessmentQuestion[] } => ({
    ...item,
    questions: item.questions?.length ? item.questions : defaultQuestions,
  });

  return (
    <div className="min-h-screen bg-[#253533] text-[#eef6ed]">
      <div className="mx-auto max-w-[900px] px-[clamp(0.85rem,3vw,2rem)] pt-5 pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-[0.4rem] text-[clamp(1.35rem,2.4vw,1.85rem)] leading-tight">
            {isTutor ? "Your created assessments" : "Your enrolled assessments"}
          </h1>
          <p className="max-w-[52ch] text-[0.95rem] leading-[1.55] text-[var(--secondary)]/80">
            {isTutor
              ? "Exam content for each accessment you created."
              : "Assessments you enrolled in from the catalog. Open each to view exam-style content."}
          </p>
        </div>
        <Link
          href={backHref}
          className="self-center rounded-full border border-[#93ab9c] bg-[var(--secondary)] px-[1.15rem] py-[0.72rem] text-[0.9rem] font-bold text-[#102320]"
        >
          Back to courses
        </Link>
      </header>

      {isTutor ? (
        tutorAssessments.length === 0 ? (
          <p className="m-0 text-[var(--secondary)]/80">No created assessments yet. Create one from the courses page.</p>
        ) : (
          <ul className="grid list-none gap-[1.1rem] p-0">
            {tutorAssessments.map((item) => {
              const enriched = enrichWithExamContent(item);
              return (
                <li key={item.id} className="rounded-2xl border border-[#4d6661] bg-[#2b3c3a] px-[1.2rem] py-[1.15rem]">
                  <h2 className="mb-[0.35rem] text-[1.15rem]">{enriched.title}</h2>
                  <p className="mb-[0.85rem] text-[0.9rem] text-[var(--secondary)]/78">
                    Tutor: {enriched.tutor} · {enriched.level} · {enriched.lessons} lesson(s)
                  </p>
                  <div className="border-t border-[#4a5f5b] pt-[0.85rem]">
                    <h3 className="mb-[0.6rem] text-[0.82rem] font-medium uppercase tracking-[0.08em] text-[var(--secondary)]/74">
                      Exam content
                    </h3>
                    <ol className="grid list-decimal gap-[0.85rem] pl-[1.1rem]">
                      {enriched.questions.map((q, idx) => (
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
        )
      ) : enrolledAssessments.length === 0 ? (
        <p className="m-0 text-[var(--secondary)]/80">You have not enrolled in any assessments yet.</p>
      ) : (
        <ul className="grid list-none gap-[1.1rem] p-0">
          {enrolledAssessments.map((item) => {
            const fromDummy = DUMMY_ASSESSMENTS.find((d) => d.id === item.id) || item;
            const enriched = enrichWithExamContent(fromDummy);
            return (
              <li key={item.id} className="rounded-2xl border border-[#4d6661] bg-[#2b3c3a] px-[1.2rem] py-[1.15rem]">
                <h2 className="mb-[0.35rem] text-[1.15rem]">{enriched.title}</h2>
                <p className="mb-[0.85rem] text-[0.9rem] text-[var(--secondary)]/78">
                  Tutor: {enriched.tutor} · {enriched.level} · {enriched.lessons} lesson(s)
                </p>
                <div className="border-t border-[#4a5f5b] pt-[0.85rem]">
                  <h3 className="mb-[0.6rem] text-[0.82rem] font-medium uppercase tracking-[0.08em] text-[var(--secondary)]/74">
                    Assessment content
                  </h3>
                  <ol className="grid list-decimal gap-[0.85rem] pl-[1.1rem]">
                    {enriched.questions.map((q, idx) => (
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
