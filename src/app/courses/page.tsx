"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "../../components/Navbar";
import { DUMMY_ASSESSMENTS } from "../../data/dummyAssessments";
import type { Assessment } from "../../data/dummyAssessments";

function readStoredAssessments(key: string): Assessment[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Assessment[]) : [];
  } catch {
    window.localStorage.removeItem(key);
    return [];
  }
}

function CoursesPageContent() {
  const searchParams = useSearchParams();
  const role = (searchParams.get("role") || "student").toLowerCase();
  const name = searchParams.get("name") || "Learner";
  const isTutor = role === "tutor";
  const decodedName = decodeURIComponent(name);
  const tutorStorageKey = `proof-accessments-${decodedName.toLowerCase()}`;
  const enrollStorageKey = `proof-enrolled-${decodedName.toLowerCase()}`;
  const [enrolledList, setEnrolledList] = useState<Assessment[]>(() =>
    isTutor ? [] : readStoredAssessments(enrollStorageKey),
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [assessmentName, setAssessmentName] = useState("");
  const [myAssessments, setMyAssessments] = useState<Assessment[]>(() =>
    isTutor ? readStoredAssessments(tutorStorageKey) : [],
  );

  const examHref = useMemo(() => {
    const params = new URLSearchParams({
      role,
      name: decodedName,
    });
    return `/exam?${params.toString()}`;
  }, [role, decodedName]);

  const enroll = (assessmentId: Assessment["id"]) => {
    if (isTutor) return;
    const assessment = DUMMY_ASSESSMENTS.find((a) => a.id === assessmentId);
    if (!assessment) return;
    setEnrolledList((prev) => {
      if (prev.some((x) => x.id === assessmentId)) return prev;
      const next = [...prev, assessment];
      window.localStorage.setItem(enrollStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const createAssessment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = assessmentName.trim();
    if (!cleanName || !isTutor) return;

    const nextAssessments = [
      {
        id: Date.now(),
        title: cleanName,
        tutor: decodedName,
        level: "Custom",
        lessons: 1,
        questions: [
          { prompt: "Sample question 1 (placeholder)", options: ["A", "B", "C", "D"] },
          { prompt: "Sample question 2 (placeholder)", options: ["A", "B", "C", "D"] },
        ],
      },
      ...myAssessments,
    ];
    setMyAssessments(nextAssessments);
    window.localStorage.setItem(tutorStorageKey, JSON.stringify(nextAssessments));
    setAssessmentName("");
    setIsCreateOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#253533] font-[family:var(--font-geist-sans)] text-[#eef6ed]">
      <Navbar displayName={decodedName} role={role} />

      <main className="mx-auto mt-[1.1rem] w-full max-w-[1280px] px-[0.85rem] pb-8">
        <section className="mb-5 border-none bg-transparent px-[0.15rem]">
          <div className="flex flex-wrap items-start justify-between gap-4 max-[680px]:flex-col max-[680px]:items-stretch">
            <h1 className="min-w-[min(100%,280px)] flex-1 text-[clamp(1.35rem,2.2vw,1.95rem)] leading-tight">
              Available onchain assessment
            </h1>
            {(isTutor ? myAssessments.length > 0 : enrolledList.length > 0) && (
              <Link
                href={examHref}
                className="shrink-0 self-center rounded-full border border-[#93ab9c] bg-[var(--secondary)] px-[1.1rem] py-[0.65rem] text-[0.88rem] font-bold text-[#102320] max-[680px]:self-start"
              >
                {isTutor ? "Created assessments" : "Enrolled assessments"}
              </Link>
            )}
          </div>
          <p className="mt-[0.65rem] mb-[0.85rem] max-w-[62ch] leading-[1.55] text-[var(--secondary)]/80">
            {isTutor
              ? "You can create and manage accessments. Enroll is disabled for tutor accounts."
              : "Enroll in accessments and begin your on-chain evaluation flow."}
          </p>
          {isTutor && (
            <button
              type="button"
              className="cursor-pointer rounded-full border border-[#93ab9c] bg-[#0f1f1d] px-4 py-[0.62rem] font-semibold text-[var(--secondary)] disabled:opacity-55"
              onClick={() => setIsCreateOpen(true)}
            >
              Create Accessment
            </button>
          )}
        </section>

        <section className="grid grid-cols-1 gap-[0.9rem] md:grid-cols-2 xl:grid-cols-3">
          {DUMMY_ASSESSMENTS.map((assessment) => {
            const isEnrolled = enrolledList.some((x) => x.id === assessment.id);
            return (
              <article
                key={assessment.id}
                className="grid gap-[0.45rem] rounded-[0.95rem] border border-[#4a6460] bg-[linear-gradient(160deg,#2a3b39,#253533)] p-4"
              >
                <h3 className="mb-[0.2rem] text-[1.02rem] leading-[1.35]">{assessment.title}</h3>
                <p className="text-[0.9rem] text-[var(--secondary)]/78">Tutor: {assessment.tutor}</p>
                <p className="text-[0.9rem] text-[var(--secondary)]/78">
                  {assessment.level} . {assessment.lessons} lessons
                </p>
                <button
                  type="button"
                  className="mt-[0.4rem] cursor-pointer rounded-full border border-[#8ea89a] bg-[var(--secondary)] px-[0.9rem] py-[0.55rem] font-bold text-[#102320] disabled:cursor-not-allowed disabled:opacity-65"
                  onClick={() => enroll(assessment.id)}
                  disabled={isTutor || isEnrolled}
                >
                  {isTutor ? "Enroll Disabled" : isEnrolled ? "Enrolled" : "Enroll"}
                </button>
              </article>
            );
          })}
        </section>
      </main>

      {isCreateOpen && (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-[rgba(4,11,10,0.62)]"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            className="w-[min(92vw,420px)] rounded-[1.05rem] border border-[#bdc79f] bg-[var(--secondary)] p-[1.3rem] shadow-[0_18px_40px_rgba(5,14,13,0.4)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="mb-2 text-[1.4rem] text-[#233525]">
              Create Accessment
            </h2>
            <p className="mb-4 text-[#3e4f3d]">Publish a new on-chain accessment for learners.</p>
            <form onSubmit={createAssessment} className="grid gap-[0.6rem]">
              <label htmlFor="assessmentName" className="text-[0.9rem] font-semibold text-[#243527]">
                Accessment name
              </label>
              <input
                id="assessmentName"
                type="text"
                value={assessmentName}
                onChange={(event) => setAssessmentName(event.target.value)}
                placeholder="e.g. Solana Basics Assessment"
                className="w-full rounded-[0.8rem] border border-[#b6c3a3] bg-[var(--secondary)] px-[0.9rem] py-[0.76rem] text-[#1b2c1d] outline-none focus:border-[#2f4331] focus:ring-2 focus:ring-[rgba(35,53,37,0.2)]"
                required
              />
              <button
                type="submit"
                className="cursor-pointer rounded-full border border-[#93ab9c] bg-[#0f1f1d] px-4 py-[0.62rem] font-semibold text-[var(--secondary)] disabled:opacity-55"
              >
                Create Accessment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#253533]" />}>
      <CoursesPageContent />
    </Suspense>
  );
}
