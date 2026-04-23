"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNav } from "../../components/AppNav";
import styles from "./page.module.css";
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
    <div className={styles.page}>
      <AppNav displayName={decodedName} role={role} />

      <main className={styles.main}>
        <section className={styles.tipSection}>
          <div className={styles.tipTopRow}>
            <h1 className={styles.tipTitle}>Available onchain assessment</h1>
            {(isTutor ? myAssessments.length > 0 : enrolledList.length > 0) && (
              <Link href={examHref} className={styles.tipExamLink}>
                {isTutor ? "Created assessments" : "Enrolled assessments"}
              </Link>
            )}
          </div>
          <p className={styles.tipDesc}>
            {isTutor
              ? "You can create and manage accessments. Enroll is disabled for tutor accounts."
              : "Enroll in accessments and begin your on-chain evaluation flow."}
          </p>
          {isTutor && (
            <button
              type="button"
              className={styles.createButton}
              onClick={() => setIsCreateOpen(true)}
            >
              Create Accessment
            </button>
          )}
        </section>

        <section className={styles.grid}>
          {DUMMY_ASSESSMENTS.map((assessment) => {
            const isEnrolled = enrolledList.some((x) => x.id === assessment.id);
            return (
              <article key={assessment.id} className={styles.card}>
                <h3>{assessment.title}</h3>
                <p>Tutor: {assessment.tutor}</p>
                <p>
                  {assessment.level} . {assessment.lessons} lessons
                </p>
                <button
                  type="button"
                  className={styles.enrollButton}
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
        <div className={styles.modalOverlay} onClick={() => setIsCreateOpen(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h2>Create Accessment</h2>
            <p>Publish a new on-chain accessment for learners.</p>
            <form onSubmit={createAssessment} className={styles.form}>
              <label htmlFor="assessmentName">Accessment name</label>
              <input
                id="assessmentName"
                type="text"
                value={assessmentName}
                onChange={(event) => setAssessmentName(event.target.value)}
                placeholder="e.g. Solana Basics Assessment"
                required
              />
              <button type="submit" className={styles.createButton}>
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
    <Suspense fallback={<div className={styles.page} />}>
      <CoursesPageContent />
    </Suspense>
  );
}
