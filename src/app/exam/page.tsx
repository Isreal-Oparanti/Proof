"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNav } from "../../components/AppNav";
import { DUMMY_ASSESSMENTS } from "../../data/dummyAssessments";
import type { Assessment, AssessmentQuestion } from "../../data/dummyAssessments";
import styles from "./page.module.css";

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
    <div className={styles.layout}>
      <AppNav displayName={decodedName} role={role} />

      <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            {isTutor ? "Your created assessments" : "Your enrolled assessments"}
          </h1>
          <p className={styles.pageSubtitle}>
            {isTutor
              ? "Exam content for each accessment you created."
              : "Assessments you enrolled in from the catalog. Open each to view exam-style content."}
          </p>
        </div>
        <Link href={backHref} className={styles.backLink}>
          Back to courses
        </Link>
      </header>

      {isTutor ? (
        tutorAssessments.length === 0 ? (
          <p className={styles.empty}>No created assessments yet. Create one from the courses page.</p>
        ) : (
          <ul className={styles.list}>
            {tutorAssessments.map((item) => {
              const enriched = enrichWithExamContent(item);
              return (
                <li key={item.id} className={styles.examCard}>
                  <h2>{enriched.title}</h2>
                  <p className={styles.meta}>
                    Tutor: {enriched.tutor} · {enriched.level} · {enriched.lessons} lesson(s)
                  </p>
                  <div className={styles.examBody}>
                    <h3 className={styles.sectionLabel}>Exam content</h3>
                    <ol className={styles.questionList}>
                      {enriched.questions.map((q, idx) => (
                        <li key={idx} className={styles.question}>
                          <p className={styles.prompt}>{q.prompt}</p>
                          <ul className={styles.options}>
                            {q.options.map((opt, oi) => (
                              <li key={oi}>{opt}</li>
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
        <p className={styles.empty}>You have not enrolled in any assessments yet.</p>
      ) : (
        <ul className={styles.list}>
          {enrolledAssessments.map((item) => {
            const fromDummy = DUMMY_ASSESSMENTS.find((d) => d.id === item.id) || item;
            const enriched = enrichWithExamContent(fromDummy);
            return (
              <li key={item.id} className={styles.examCard}>
                <h2>{enriched.title}</h2>
                <p className={styles.meta}>
                  Tutor: {enriched.tutor} · {enriched.level} · {enriched.lessons} lesson(s)
                </p>
                <div className={styles.examBody}>
                  <h3 className={styles.sectionLabel}>Assessment content</h3>
                  <ol className={styles.questionList}>
                    {enriched.questions.map((q, idx) => (
                      <li key={idx} className={styles.question}>
                        <p className={styles.prompt}>{q.prompt}</p>
                        <ul className={styles.options}>
                          {q.options.map((opt, oi) => (
                            <li key={oi}>{opt}</li>
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
    <Suspense fallback={<div className={styles.layout} />}>
      <ExamPageContent />
    </Suspense>
  );
}
