"use client";

import Link from "next/link";
import { ConfigProvider, Drawer } from "antd";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAccount, useWalletConnection } from "@solana/react-hooks";
import { useProofExams } from "@/hooks/useProofExams";
import { useExamContent } from "@/hooks/useExamContent";
import {
  coerceAccountDataBytes,
  decodeUserAccount,
  findUserPda,
} from "@/lib/proofArcium";
import type { ProofExamRecord } from "@/hooks/useProofExams";

const DRAWER_THEME_COLOR = "#253533";

type ExamCatalogItem = ProofExamRecord;

function ExamPageContent() {
  const { wallet } = useWalletConnection();
  const examQuery = useProofExams();
  const connectedWalletAddress = wallet?.account?.address?.toString() ?? null;
  const [userPdaAddress, setUserPdaAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!connectedWalletAddress) {
      setUserPdaAddress(null);
      return;
    }
    findUserPda(connectedWalletAddress)
      .then((pda) => { if (!cancelled) setUserPdaAddress(pda); })
      .catch(() => { if (!cancelled) setUserPdaAddress(null); });
    return () => { cancelled = true; };
  }, [connectedWalletAddress]);

  const userAccount = useAccount(userPdaAddress ?? undefined, {
    fetch: true,
    skip: !userPdaAddress,
    watch: false,
  });

  const onChainRole = useMemo(() => {
    const accountBytes =
      userAccount && typeof userAccount === "object" && "data" in userAccount
        ? coerceAccountDataBytes(userAccount.data)
        : null;
    if (!accountBytes) return null;
    try {
      return decodeUserAccount(accountBytes).role;
    } catch {
      return null;
    }
  }, [userAccount]);

  const isTutor = onChainRole === "tutor";

  const [drawerItem, setDrawerItem] = useState<ExamCatalogItem | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const openDrawer = (item: ExamCatalogItem) => {
    setAnswers({});
    setDrawerItem(item);
  };

  const closeDrawer = () => {
    setDrawerItem(null);
    setAnswers({});
  };

  const examContent = useExamContent(
    drawerItem ? drawerItem.examId.toString() : null,
    connectedWalletAddress,
  );

  const visibleExams = useMemo<ExamCatalogItem[]>(() => {
    if (isTutor && connectedWalletAddress) {
      return examQuery.exams.filter((e) => e.tutor === connectedWalletAddress);
    }
    return examQuery.exams;
  }, [examQuery.exams, connectedWalletAddress, isTutor]);

  return (
    <>
    <div className="min-h-screen pt-8 pb-12">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
        <section
          style={{
            width: "100%",
            maxWidth: "1120px",
            marginInline: "auto",
            marginTop: "1.8rem",
            justifySelf: "center",
            alignSelf: "start",
            alignContent: "start",
          }}
          className="grid gap-0"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              width: "100%",
              paddingTop: "2.15rem",
              marginBottom: "1.75rem",
            }}
          >
            <div>
              <h1
                style={{ margin: 0, lineHeight: 1.25 }}
                className="text-[1.45rem] font-semibold text-[var(--secondary)]"
              >
                {isTutor ? "Your created assessments" : "Available assessments"}
              </h1>
              <p
                style={{ margin: "0.3rem 0 0" }}
                className="text-[0.92rem] text-[var(--secondary)]/78"
              >
                {isTutor
                  ? "Exam entries derived from the on-chain courses under your tutor wallet."
                  : "Assessments derived from the full on-chain course catalog."}
              </p>
            </div>
            <Link
              href="/"
              style={{
                height: "2.55rem",
                color: "var(--background)",
                WebkitTextFillColor: "var(--background)",
                opacity: 1,
                textDecoration: "none",
                flexShrink: 0,
              }}
              className="inline-flex min-w-[10.25rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[var(--secondary)] px-[1.1rem] text-center text-[0.95rem] font-semibold transition hover:-translate-y-px hover:bg-[#f3e7d8]"
            >
              Back to courses
            </Link>
          </div>

          <section
            style={{
              width: "100%",
              maxWidth: "1120px",
              marginInline: "auto",
              justifySelf: "center",
            }}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {examQuery.isLoading ? (
              <article className="rounded-[0.95rem] border border-[#4a6460] bg-[linear-gradient(160deg,#2a3b39,#253533)] p-5 text-[0.95rem] text-[var(--secondary)]/80 md:col-span-2 xl:col-span-3">
                Loading on-chain assessments...
              </article>
            ) : visibleExams.length === 0 ? (
              <article className="rounded-[0.95rem] border border-[#4a6460] bg-[linear-gradient(160deg,#2a3b39,#253533)] p-5 text-[0.95rem] text-[var(--secondary)]/80 md:col-span-2 xl:col-span-3">
                {isTutor
                  ? "No created assessments yet. Create a course and add an exam first."
                  : "No on-chain assessments available yet."}
              </article>
            ) : (
              visibleExams.map((item) => {
                const tutorLabel = `${item.tutor.slice(0, 4)}...${item.tutor.slice(-4)}`;
                return (
                  <article
                    key={item.address}
                    style={{
                      borderRadius: "0.7rem",
                      gap: "0.85rem",
                      padding: "1.1rem 1.15rem",
                    }}
                    className="grid border border-[#4a6460] bg-[linear-gradient(160deg,#2a3b39,#253533)]"
                  >
                    <h2 className="m-0 text-[1.08rem] font-semibold leading-[1.35] text-[var(--secondary)]">
                      {item.title}
                    </h2>
                    <p style={{ margin: 0 }} className="text-[0.92rem] text-[var(--secondary)]/78">
                      Tutor: {tutorLabel}
                    </p>
                    <p style={{ margin: 0 }} className="text-[0.92rem] text-[var(--secondary)]/78">
                      Questions: {item.questionCount}
                    </p>
                    <p style={{ margin: 0 }} className="break-all text-[0.82rem] text-[var(--secondary)]/62">
                      Exam #{item.examId.toString()} · Course #{item.courseId.toString()}
                    </p>
                    <div style={{ paddingTop: "0.35rem" }}>
                      <button
                        type="button"
                        style={{
                          minHeight: "2.5rem",
                          padding: "0.68rem 1rem",
                          borderRadius: "0.58rem",
                        }}
                        className="inline-flex cursor-pointer items-center justify-center border border-[#93ab9c] bg-[var(--secondary)] text-[0.9rem] font-semibold text-[#102320] transition hover:bg-[#f3e7d8]"
                        onClick={() => openDrawer(item)}
                      >
                        {isTutor ? "View Questions" : "Take Exam"}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </section>
      </div>
    </div>

    <ConfigProvider
      theme={{
        token: {
          colorBgElevated: DRAWER_THEME_COLOR,
          colorText: "#eef6ed",
          colorTextHeading: "#eef6ed",
          colorBorder: "#4a6460",
          colorIcon: "#93ab9c",
          colorIconHover: "#eef6ed",
        },
      }}
    >
      <Drawer
        open={drawerItem !== null}
        onClose={closeDrawer}
        placement="right"
        width={Math.min(520, typeof window !== "undefined" ? window.innerWidth : 520)}
        title={
          drawerItem ? (
            <div style={{ color: "#eef6ed" }}>
              <div style={{ fontSize: "1.1rem", fontWeight: 600, lineHeight: 1.3 }}>
                {examContent.status === "success" ? examContent.content.title : drawerItem.title}
              </div>
              <div style={{ fontSize: "0.82rem", color: "#93ab9c", marginTop: "0.2rem", fontWeight: 400 }}>
                {isTutor ? "Assessment content" : "Exam questions"} · Exam #{drawerItem.examId.toString()}
              </div>
            </div>
          ) : null
        }
        styles={{
          header: { background: DRAWER_THEME_COLOR, borderBottom: "1px solid #3d5450" },
          body: { background: "#1e2e2c", padding: "1.4rem 1.5rem" },
          mask: { backdropFilter: "blur(2px)" },
        }}
        footer={
          !isTutor && examContent.status === "success" ? (
            <div style={{ background: "#1e2e2c", padding: "0.85rem 1.5rem", borderTop: "1px solid #3d5450" }}>
              <button
                type="button"
                onClick={closeDrawer}
                style={{
                  height: "2.5rem",
                  background: "var(--secondary)",
                  borderColor: "#93ab9c",
                  color: "#102320",
                }}
                className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border px-4 text-[0.95rem] font-semibold transition hover:bg-[#f3e7d8]"
              >
                Submit &amp; Close
              </button>
            </div>
          ) : null
        }
      >
        {examContent.status === "loading" && (
          <p style={{ margin: 0, color: "#93ab9c", fontSize: "0.95rem" }}>
            Loading questions...
          </p>
        )}

        {examContent.status === "error" && (
          <div
            style={{
              padding: "0.85rem 1rem",
              borderRadius: "0.55rem",
              background: "#2a1e1e",
              border: "1px solid #5c3535",
              color: "#f0a0a0",
              fontSize: "0.9rem",
            }}
          >
            {examContent.message.includes("access not granted")
              ? "You need on-chain exam access to view these questions. Ask your tutor to grant you access."
              : examContent.message}
          </div>
        )}

        {examContent.status === "success" && (
          <ol className="grid list-none gap-[1.4rem] p-0">
            {examContent.content.questions.map((q, idx) => (
              <li key={idx} style={{ borderBottom: "1px solid #3d5450", paddingBottom: "1.2rem" }}>
                <p
                  style={{ margin: "0 0 0.75rem", fontSize: "0.98rem", fontWeight: 600, color: "#eef6ed" }}
                >
                  {idx + 1}. {q.prompt}
                </p>
                <ul className="grid list-none gap-2 p-0">
                  {q.options.map((opt, oi) => {
                    const isSelected = answers[idx] === oi;
                    return (
                      <li key={oi}>
                        {isTutor ? (
                          <div
                            style={{
                              padding: "0.55rem 0.9rem",
                              borderRadius: "0.5rem",
                              border: "1px solid #3d5450",
                              fontSize: "0.9rem",
                              color: "#c8dcd4",
                              background: "#253533",
                            }}
                          >
                            {opt}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAnswers((prev) => ({ ...prev, [idx]: oi }))}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "0.55rem 0.9rem",
                              borderRadius: "0.5rem",
                              border: isSelected ? "1.5px solid #7fbf9c" : "1px solid #3d5450",
                              fontSize: "0.9rem",
                              color: isSelected ? "#eef6ed" : "#c8dcd4",
                              background: isSelected ? "#2f4e3e" : "#253533",
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                          >
                            {opt}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </Drawer>
    </ConfigProvider>
    </>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ExamPageContent />
    </Suspense>
  );
}
