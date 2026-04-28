"use client";

import Link from "next/link";
import { ConfigProvider, Drawer } from "antd";
import type { CSSProperties } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAccount, useWalletConnection } from "@solana/react-hooks";
import { address, getAddressEncoder } from "@solana/addresses";

import toast from "react-hot-toast";
import { useProofExams } from "@/hooks/useProofExams";
import { useExamContent } from "@/hooks/useExamContent";
import { useEnrollments } from "@/hooks/useEnrollments";
import { useProofArcium } from "@/hooks/useProofArcium";
import {
  coerceAccountDataBytes,
  decodeUserAccount,
  findUserPda,
} from "@/lib/proofArcium";
import type { ProofExamRecord } from "@/hooks/useProofExams";

type ArciumTakeExamSetup = {
  clusterAccount: string;
  compDefAccount: string;
  computationAccount: string;
  computationOffset: string;
  executingPool: string;
  mempoolAccount: string;
  mxeAccount: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number[];
  needsExamAccessRequest: boolean;
};

const DRAWER_THEME_COLOR = "#253533";
const SOLANA_TRANSACTION_ALREADY_PROCESSED = 7050007;
const loadingPanelStyle: CSSProperties = {
  borderRadius: "0.95rem",
  background: "linear-gradient(160deg,#2a3b39,#253533)",
  padding: "1.25rem",
  fontSize: "0.95rem",
  color: "rgba(245,232,213,0.8)",
};
const compactLoadingPanelStyle: CSSProperties = {
  ...loadingPanelStyle,
  padding: "0.85rem 1rem",
  fontSize: "0.9rem",
};

type ExamCatalogItem = ProofExamRecord;

const SOLSCAN_DEVNET_BASE_URL = "https://solscan.io/account";

function getSolscanAccountUrl(account: string) {
  return `${SOLSCAN_DEVNET_BASE_URL}/${account}?cluster=devnet`;
}

function hasSolanaErrorCode(value: unknown, code: number, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  const record = value as Record<string, unknown>;
  const context = record.context;
  if (
    context &&
    typeof context === "object" &&
    "__code" in context &&
    Number((context as { __code: unknown }).__code) === code
  ) {
    return true;
  }

  return Object.values(record).some((nestedValue) =>
    hasSolanaErrorCode(nestedValue, code, seen),
  );
}

function ExamPageContent() {
  const { wallet } = useWalletConnection();
  const examQuery = useProofExams();
  const connectedWalletAddress = wallet?.account?.address?.toString() ?? null;
  const [userPdaAddress, setUserPdaAddress] = useState<string | null>(null);
  const [completedExams, setCompletedExams] = useState<Record<string, CompletedResult>>({});
  const [loadingScoreExamIds, setLoadingScoreExamIds] = useState<Set<string>>(new Set());

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
  const examCourseIds = useMemo(
    () => examQuery.exams.map((exam) => exam.courseId),
    [examQuery.exams],
  );
  const [enrolledCourseIds] = useEnrollments(
    examCourseIds,
    !isTutor ? connectedWalletAddress : null,
  );

  const proofArcium = useProofArcium();

  const [drawerItem, setDrawerItem] = useState<ExamCatalogItem | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Grading flow
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<number, number> | null>(null);
  type GradingState = "idle" | "pending" | "done" | "timeout";
  const [gradingState, setGradingState] = useState<GradingState>("idle");
  const [correctAnswers, setCorrectAnswers] = useState<number[] | null>(null);
  const [checkingOnChain, setCheckingOnChain] = useState(false);
  const [isLoadingPastResult, setIsLoadingPastResult] = useState(false);
  // Completed exam results fetched from on-chain
  type CompletedResult = {
    correctAnswers: number[];
    score: number;
    submittedAnswers: Record<number, number>;
    totalQuestions: number;
    txHash?: string;
  };

  const openDrawer = (item: ExamCatalogItem) => {
    const key = item.examId.toString();
    const prior = completedExams[key];
    setAnswers({});
    setDrawerItem(item);
    setIsLoadingPastResult(!isTutor && Boolean(prior));
    if (prior) {
      setSubmittedAnswers(prior.submittedAnswers);
      setCorrectAnswers(prior.correctAnswers);
      setGradingState("done");
    } else {
      // Will trigger on-chain check via useEffect
      setSubmittedAnswers(null);
      setGradingState("idle");
      setCorrectAnswers(null);
    }
    proofArcium.reset();
  };

  const closeDrawer = () => {
    setDrawerItem(null);
    setAnswers({});
    setSubmittedAnswers(null);
    setGradingState("idle");
    setCorrectAnswers(null);
    setCheckingOnChain(false);
    setIsLoadingPastResult(false);
  };

  function getCompletedResultFromStatus(data: {
    correctAnswers?: number[];
    score?: number | null;
    submittedAnswers?: number[];
    totalQuestions?: number;
  }): CompletedResult | null {
    if (!data.correctAnswers?.length || !data.submittedAnswers?.length) {
      return null;
    }

    const onChainSubmitted: Record<number, number> = {};
    data.submittedAnswers.forEach((answer, index) => {
      onChainSubmitted[index] = answer;
    });

    return {
      score:
        data.score ??
        data.correctAnswers.reduce(
          (score, correctAnswer, index) => score + (data.submittedAnswers?.[index] === correctAnswer ? 1 : 0),
          0,
        ),
      totalQuestions: data.totalQuestions ?? data.correctAnswers.length,
      correctAnswers: data.correctAnswers,
      submittedAnswers: onChainSubmitted,
    };
  }

  function showImmediateResult(
    examId: string,
    answerArray: number[],
    correctAnswerArray: number[],
  ) {
    const onChainSubmitted: Record<number, number> = {};
    answerArray.forEach((answer, index) => {
      onChainSubmitted[index] = answer;
    });

    const result: CompletedResult = {
      score: correctAnswerArray.reduce(
        (acc, correctAnswer, index) => acc + (answerArray[index] === correctAnswer ? 1 : 0),
        0,
      ),
      totalQuestions: correctAnswerArray.length,
      correctAnswers: correctAnswerArray,
      submittedAnswers: onChainSubmitted,
    };

    setSubmittedAnswers(onChainSubmitted);
    setCorrectAnswers(correctAnswerArray);
    setCompletedExams((prev) => ({ ...prev, [examId]: result }));
    setGradingState("done");
  }

  async function showSessionSolscanToast(examId: bigint | number | string) {
    if (!connectedWalletAddress) return;

    try {
      const sessionPda = await proofArcium.findSessionPda(examId, connectedWalletAddress);
      const solscanUrl = getSolscanAccountUrl(sessionPda);
      toast.success(
        (t) => (
          <span>
            Exam submitted on-chain.{" "}
            <a
              href={solscanUrl}
              rel="noreferrer"
              target="_blank"
              style={{ color: "#9fe6b8", fontWeight: 700, textDecoration: "underline" }}
              onClick={() => toast.dismiss(t.id)}
            >
              View session on Solscan
            </a>
          </span>
        ),
        { duration: 9000 },
      );
    } catch (error) {
      console.warn("[Proof Arcium] Failed to derive session PDA for Solscan toast", error);
    }
  }

  async function openAssessmentProof(examId: bigint | number | string) {
    if (!connectedWalletAddress) {
      toast.error("Connect a wallet to view your on-chain assessment proof.");
      return;
    }

    const proofWindow = window.open("about:blank", "_blank");

    try {
      const sessionPda = await proofArcium.findSessionPda(examId, connectedWalletAddress);
      const solscanUrl = getSolscanAccountUrl(sessionPda);

      if (proofWindow) {
        proofWindow.opener = null;
        proofWindow.location.href = solscanUrl;
      } else {
        toast.success(
          <span>
            Proof ready.{" "}
            <a
              href={solscanUrl}
              rel="noreferrer"
              target="_blank"
              style={{ color: "#9fe6b8", fontWeight: 700, textDecoration: "underline" }}
            >
              Open on Solscan
            </a>
          </span>,
          { duration: 9000 },
        );
      }
    } catch (error) {
      proofWindow?.close();
      console.warn("[Proof Arcium] Failed to derive assessment proof PDA", error);
      toast.error("Unable to open on-chain assessment proof.");
    }
  }

  // On-chain completion check — runs whenever a non-tutor opens a drawer for
  // an exam not yet in local state. Checks the session PDA on devnet.
  useEffect(() => {
    if (!drawerItem || !connectedWalletAddress || isTutor) return;
    const key = drawerItem.examId.toString();
    if (completedExams[key]) return; // already known from this session
    let cancelled = false;
    setCheckingOnChain(true);
    const params = new URLSearchParams({
      examId: key,
      studentWallet: connectedWalletAddress,
    });
    fetch(`/api/exam/status?${params}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) return;
        const data = (await res.json()) as {
          completed: boolean;
          correctAnswers?: number[];
          pending?: boolean;
          score?: number | null;
          submittedAnswers?: number[];
          totalQuestions?: number;
        };
        if (cancelled) return;
        const result = getCompletedResultFromStatus(data);
        if (result) {
          setCompletedExams((prev) => ({ ...prev, [key]: result }));
          setCorrectAnswers(result.correctAnswers);
          setSubmittedAnswers(result.submittedAnswers);
          setGradingState("done");
        } else if (data.pending) {
          // takeExam was called but Arcium callback not yet received — start polling
          setGradingState("pending");
        }
      })
      .catch(() => { /* RPC hiccup — treat as not completed */ })
      .finally(() => { if (!cancelled) setCheckingOnChain(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerItem?.examId, connectedWalletAddress, isTutor]);

  // Poll /api/exam/answers every 3 s (up to 2 min) after submission
  useEffect(() => {
    if (gradingState !== "pending" || !drawerItem || !connectedWalletAddress) return;
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 40;

    const interval = setInterval(async () => {
      if (cancelled) return;
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(interval);
        if (!cancelled) setGradingState("timeout");
        return;
      }
      try {
        const params = new URLSearchParams({
          examId: drawerItem.examId.toString(),
          studentWallet: connectedWalletAddress,
        });
        const res = await fetch(`/api/exam/answers?${params}`);
        if (res.ok) {
          const data = (await res.json()) as { correctAnswers: number[] };
          clearInterval(interval);
          if (!cancelled) {
            setCorrectAnswers(data.correctAnswers);
            setGradingState("done");
            // Persist to session state so re-opening the drawer shows results
            if (drawerItem) {
              const key = drawerItem.examId.toString();
              const onChainSubmitted: Record<number, number> = {};
              if (submittedAnswers) Object.assign(onChainSubmitted, submittedAnswers);
              setCompletedExams((prev) => ({
                ...prev,
                [key]: {
                  correctAnswers: data.correctAnswers,
                  score: data.correctAnswers.reduce((acc, ca, idx) => acc + (onChainSubmitted[idx] === ca ? 1 : 0), 0),
                  submittedAnswers: onChainSubmitted,
                  totalQuestions: data.correctAnswers.length,
                },
              }));
            }
          }
        }
        // 403 means not yet graded — keep polling
      } catch { /* network hiccup — retry */ }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gradingState, drawerItem, connectedWalletAddress]);

  async function handleSubmitExam() {
    if (!drawerItem || !connectedWalletAddress || examContent.status !== "success") return;

    const totalQuestions = examContent.content.questions.length;
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < totalQuestions) {
      toast.error(`Please answer all ${totalQuestions} questions before submitting.`);
      return;
    }

    if (proofArcium.isSending || isSubmitting) return;

    const answerArray = Array.from({ length: totalQuestions }, (_, i) => answers[i] ?? 0);

    setIsSubmitting(true);
    proofArcium.reset();

    try {
      // 2. Fetch Arcium account addresses + next computation offset,
      //    and compute the score server-side so it can go in the memo.
      const setupRes = await fetch("/api/arcium/take-exam-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: drawerItem.examId.toString(),
          studentWallet: connectedWalletAddress,
          answers: answerArray,
        }),
      });
      if (!setupRes.ok) {
        const err = (await setupRes.json()) as {
          compDefAccount?: string;
          correctAnswers?: number[];
          error?: string;
          alreadyCompleted?: boolean;
          alreadySubmitted?: boolean;
          mxeAuthority?: string | null;
          pending?: boolean;
          score?: number;
          totalQuestions?: number;
        };
        if (setupRes.status === 409 || err.alreadyCompleted) {
          if (err.alreadySubmitted || err.pending) {
            if (err.correctAnswers?.length) {
              showImmediateResult(drawerItem.examId.toString(), answerArray, err.correctAnswers);
              void showSessionSolscanToast(drawerItem.examId);
            } else {
              const orderedAnswers = { ...answers };
              setSubmittedAnswers(orderedAnswers);
              setGradingState("pending");
              toast.success("Exam submission is already on-chain. Waiting for Arcium to grade...");
            }
            return;
          }

          if (err.alreadyCompleted) {
            toast.error("You have already completed this exam.");
            setGradingState("done");
            return;
          }

          console.warn("[Proof Arcium] Exam submission blocked by setup", {
            compDefAccount: err.compDefAccount,
            error: err.error,
            mxeAuthority: err.mxeAuthority,
          });
          toast.error(err.error ?? "Arcium setup is incomplete.");
          return;
        }
        throw new Error(err.error ?? "Failed to fetch Arcium setup.");
      }
      const setup = (await setupRes.json()) as ArciumTakeExamSetup;
      console.log("[Proof Arcium] take_exam setup", {
        compDefAccount: setup.compDefAccount,
        computationAccount: setup.computationAccount,
        computationOffset: setup.computationOffset,
        examId: drawerItem.examId.toString(),
        mempoolAccount: setup.mempoolAccount,
        needsExamAccessRequest: setup.needsExamAccessRequest,
      });

      const txInstructions = [];
      // 3. If no ExamAccess PDA exists, prepend requestExamAccess so takeExam can read it.
      //    We use the student's wallet pubkey bytes as a placeholder for studentContentPubkey.
      if (setup.needsExamAccessRequest) {
        const studentPubkeyBytes = Uint8Array.from(getAddressEncoder().encode(address(connectedWalletAddress)));
        const requestAccessIx = await proofArcium.getRequestExamAccessInstruction({
          courseId: drawerItem.courseId,
          examId: drawerItem.examId,
          studentContentPubkey: studentPubkeyBytes,
        });
        txInstructions.push(requestAccessIx);
      }

      // 4. Build takeExam instruction
      const takeExamIx = await proofArcium.getTakeExamInstruction({
        answers: answerArray,
        computationOffset: setup.computationOffset,
        courseId: drawerItem.courseId,
        examId: drawerItem.examId,
        takeExamAccounts: {
          clusterAccount: address(setup.clusterAccount),
          compDefAccount: address(setup.compDefAccount),
          computationAccount: address(setup.computationAccount),
          executingPool: address(setup.executingPool),
          mempoolAccount: address(setup.mempoolAccount),
          mxeAccount: address(setup.mxeAccount),
        },
      });

      txInstructions.push(takeExamIx);

      // 5. Send all instructions in a single transaction
      const txResult = await proofArcium.send({ instructions: txInstructions });
      // Try to get the transaction signature/hash
      const txHash = txResult || null;

      // Save hash, score, and completed status to backend
      if (txHash) {
        await fetch("/api/exam/grade-hash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examId: drawerItem.examId.toString(),
            studentWallet: connectedWalletAddress,
            txHash,
            score: setup.score,
            completed: true,
          }),
        });
      }

      // Transaction landed. Show the student their result immediately using
      // the server-side answer check, while the Arcium callback finalizes
      // the public on-chain session asynchronously.
      showImmediateResult(drawerItem.examId.toString(), answerArray, setup.correctAnswers);
      void showSessionSolscanToast(drawerItem.examId);
      closeDrawer();
      // Optionally, refresh data in the background if needed:
      // void examQuery.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit exam.";
      if (
        hasSolanaErrorCode(e, SOLANA_TRANSACTION_ALREADY_PROCESSED) ||
        msg.toLowerCase().includes("already processed")
      ) {
        const setup = await fetch("/api/arcium/take-exam-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examId: drawerItem.examId.toString(),
            studentWallet: connectedWalletAddress,
            answers: answerArray,
          }),
        }).then((response) => response.json() as Promise<Partial<ArciumTakeExamSetup>>);

        if (setup.correctAnswers?.length) {
          showImmediateResult(drawerItem.examId.toString(), answerArray, setup.correctAnswers);
          void showSessionSolscanToast(drawerItem.examId);
          void examQuery.refresh();
        } else {
          const orderedAnswers = { ...answers };
          setSubmittedAnswers(orderedAnswers);
          setGradingState("pending");
          toast.success("Exam submission is already on-chain. Waiting for Arcium to grade...");
          void examQuery.refresh();
        }
      } else if (msg.toLowerCase().includes("already initialized")) {
        // Program rejected retake — session PDA already exists on-chain
        toast.error("You have already completed this exam. Fetching your results…");
        setGradingState("pending"); // triggers poll to load results
      } else {
        toast.error(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const examContent = useExamContent(
    drawerItem ? drawerItem.examId.toString() : null,
    connectedWalletAddress,
  );

  useEffect(() => {
    if (examContent.status !== "loading") {
      setIsLoadingPastResult(false);
    }
  }, [examContent.status]);

  const visibleExams = useMemo<ExamCatalogItem[]>(() => {
    if (isTutor && connectedWalletAddress) {
      return examQuery.exams.filter((e) => e.tutor === connectedWalletAddress);
    }
    return examQuery.exams;
  }, [examQuery.exams, connectedWalletAddress, isTutor]);

  useEffect(() => {
    if (isTutor || !connectedWalletAddress || visibleExams.length === 0) {
      return;
    }

    const examsToCheck = visibleExams.filter(
      (exam) => !completedExams[exam.examId.toString()],
    );

    if (examsToCheck.length === 0) {
      return;
    }

    let cancelled = false;
    const studentWallet = connectedWalletAddress;
    const loadingKeys = examsToCheck.map((exam) => exam.examId.toString());

    setLoadingScoreExamIds((prev) => {
      const next = new Set(prev);
      loadingKeys.forEach((key) => next.add(key));
      return next;
    });

    async function loadSubmittedExamStatuses() {
      try {
        const statusResults = await Promise.all(
          examsToCheck.map(async (exam) => {
            const key = exam.examId.toString();

            try {
              const params = new URLSearchParams({
                examId: key,
                studentWallet,
              });

              const response = await fetch(`/api/exam/status?${params}`);

              if (!response.ok) {
                return null;
              }

              const data = (await response.json()) as {
                completed: boolean;
                correctAnswers?: number[];
                pending?: boolean;
                score?: number | null;
                submittedAnswers?: number[];
                totalQuestions?: number;
              };

              const result = getCompletedResultFromStatus(data);

              return result ? ([key, result] as const) : null;
            } catch {
              return null;
            }
          }),
        );

        if (cancelled) {
          return;
        }

        const submittedEntries = statusResults.filter(
          (entry): entry is readonly [string, CompletedResult] => entry !== null,
        );

        if (submittedEntries.length > 0) {
          setCompletedExams((prev) => ({
            ...prev,
            ...Object.fromEntries(submittedEntries),
          }));
        }
      } finally {
        if (!cancelled) {
          setLoadingScoreExamIds((prev) => {
            const next = new Set(prev);
            loadingKeys.forEach((key) => next.delete(key));
            return next;
          });
        }
      }
    }

    void loadSubmittedExamStatuses();

    return () => {
      cancelled = true;
    };
  }, [completedExams, connectedWalletAddress, isTutor, visibleExams]);

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
                <article style={loadingPanelStyle} className="md:col-span-2 xl:col-span-3">
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
                  const examKey = item.examId.toString();
                  const tutorLabel = `${item.tutor.slice(0, 4)}...${item.tutor.slice(-4)}`;
                  const completedResult = completedExams[examKey];
                  const hasSubmitted = Boolean(completedResult);
                  const isScoreLoading = loadingScoreExamIds.has(examKey);
                  const isEnrolled = enrolledCourseIds.has(item.courseId.toString());

                  const isActionDisabled =
                    !isTutor && (isScoreLoading || (!hasSubmitted && !isEnrolled));

                  const actionLabel = isTutor
                    ? "View Questions"
                    : isScoreLoading
                      ? "Loading score..."
                      : hasSubmitted
                        ? "View Past Questions"
                        : isEnrolled
                          ? "Take Exam"
                          : "Enroll to take Exam";
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
                      {!isTutor && isScoreLoading && !hasSubmitted && (
                        <div
                          style={{
                            ...compactLoadingPanelStyle,
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            marginTop: "0.1rem",
                          }}
                        >
                          <span
                            style={{
                              width: "0.8rem",
                              height: "0.8rem",
                              border: "2px solid rgba(245,232,213,0.35)",
                              borderTopColor: "rgba(245,232,213,0.9)",
                              borderRadius: "50%",
                              display: "inline-block",
                              animation: "spin 0.8s linear infinite",
                            }}
                          />
                          <span style={{ fontSize: "0.85rem", color: "rgba(245,232,213,0.8)" }}>
                            Loading score...
                          </span>
                        </div>
                      )}
                      {!isTutor && completedResult && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.1rem" }}>
                          <span style={{
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            padding: "0.18rem 0.6rem",
                            borderRadius: "0.4rem",
                            background: (() => {
                              const pct = Math.round((completedResult.score / completedResult.totalQuestions) * 100);
                              return pct >= 70 ? "#1a3828" : "#2a1a1a";
                            })(),
                            border: (() => {
                              const pct = Math.round((completedResult.score / completedResult.totalQuestions) * 100);
                              return `1px solid ${pct >= 70 ? "#3d7a5a" : "#5c3535"}`;
                            })(),
                            color: (() => {
                              const pct = Math.round((completedResult.score / completedResult.totalQuestions) * 100);
                              return pct >= 70 ? "#7fbf9c" : "#f0a0a0";
                            })(),
                          }}>
                            {completedResult.score}/{completedResult.totalQuestions}
                          </span>
                          <span style={{ fontSize: "0.78rem", color: "#93ab9c" }}>Score</span>
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", paddingTop: "0.35rem" }}>
                        <button
                          type="button"
                          disabled={isActionDisabled}
                          style={{
                            minHeight: "2.5rem",
                            padding: "0.68rem 1rem",
                            borderRadius: "0.58rem",
                            cursor: isActionDisabled ? "not-allowed" : "pointer",
                            opacity: isActionDisabled ? 0.55 : 1,
                            WebkitTextFillColor: "#102320",
                          }}
                          className="inline-flex items-center justify-center border border-[#93ab9c] bg-[var(--secondary)] text-[0.9rem] font-semibold text-[#102320] transition enabled:cursor-pointer enabled:hover:bg-[#f3e7d8]"
                          onClick={() => {
                            if (isActionDisabled) {
                              return;
                            }

                            openDrawer(item);
                          }}
                        >
                          {actionLabel}
                        </button>
                        {!isTutor && hasSubmitted && (
                          <button
                            type="button"
                            style={{
                              minHeight: "2.5rem",
                              padding: "0.68rem 1rem",
                              borderRadius: "0.58rem",
                              cursor: "pointer",
                              WebkitTextFillColor: "var(--secondary)",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid #6f9187",
                              background: "#102320",
                              fontWeight: 600,
                              fontSize: "0.9rem",
                            }}
                            onClick={() => {
                              void openAssessmentProof(item.examId);
                            }}
                          >
                            View On-chain Proof
                          </button>
                        )}
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
          size="large"
          title={
            drawerItem ? (
              <div style={{ color: "#eef6ed" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 600, lineHeight: 1.3 }}>
                    {examContent.status === "success" ? examContent.content.title : drawerItem.title}
                  </span>
                  {!isTutor && completedExams[drawerItem.examId.toString()] && (() => {
                    const r = completedExams[drawerItem.examId.toString()];
                    const pct = Math.round((r.score / r.totalQuestions) * 100);
                    return (
                      <span style={{
                        fontSize: "0.82rem",
                        fontWeight: 700,
                        padding: "0.2rem 0.7rem",
                        borderRadius: "0.4rem",
                        background: pct >= 70 ? "#1a3828" : "#2a1a1a",
                        border: `1px solid ${pct >= 70 ? "#3d7a5a" : "#5c3535"}`,
                        color: pct >= 70 ? "#7fbf9c" : "#f0a0a0",
                      }}>
                        {r.score}/{r.totalQuestions} · {pct}%
                      </span>
                    );
                  })()}
                </div>
                <div style={{ fontSize: "0.82rem", color: "#93ab9c", marginTop: "0.2rem", fontWeight: 400 }}>
                  {isTutor ? "Assessment content" : (completedExams[drawerItem.examId.toString()] ? "Past submission" : "Exam questions")} · Exam #{drawerItem.examId.toString()}
                </div>
              </div>
            ) : null
          }
          styles={{
            header: { background: DRAWER_THEME_COLOR, borderBottom: "1px solid #3d5450" },
            body: { background: "#1e2e2c", padding: "1.6rem 2rem" },
            mask: { backdropFilter: "blur(2px)" },
          }}
          footer={
            !isTutor ? (
              <div style={{ padding: "0.85rem 1.5rem", borderTop: "1px solid #3d5450" }}>
                {gradingState === "idle" && examContent.status === "success" && (
                  <button
                    type="button"
                    onClick={handleSubmitExam}
                    disabled={isSubmitting || proofArcium.isSending || checkingOnChain}
                    style={{
                      height: "2.5rem",
                      background: isSubmitting || proofArcium.isSending || checkingOnChain ? "#4a6460" : "var(--secondary)",
                      borderColor: "#93ab9c",
                      color: "#102320",
                      WebkitTextFillColor: "#102320",
                      cursor: isSubmitting || proofArcium.isSending || checkingOnChain ? "not-allowed" : "pointer",
                      opacity: isSubmitting || proofArcium.isSending || checkingOnChain ? 0.7 : 1,
                    }}
                    className="inline-flex w-full items-center justify-center rounded-lg border px-4 text-[0.95rem] font-semibold transition hover:bg-[#f3e7d8]"
                  >
                    {isSubmitting || proofArcium.isSending ? "Submitting…" : "Submit & Close"}
                  </button>
                )}
                {gradingState === "pending" && (
                  <button
                    type="button"
                    disabled
                    style={{
                      height: "2.5rem",
                      background: "#253533",
                      borderColor: "#4a6460",
                      color: "#93ab9c",
                      WebkitTextFillColor: "#93ab9c",
                      cursor: "not-allowed",
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 text-[0.95rem] font-semibold"
                  >
                    <span
                      style={{
                        width: "0.85rem",
                        height: "0.85rem",
                        border: "2px solid #93ab9c",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    Grading…
                  </button>
                )}
                {(gradingState === "done" || gradingState === "timeout") && (
                  <button
                    type="button"
                    onClick={closeDrawer}
                    style={{
                      height: "2.5rem",
                      background: "var(--secondary)",
                      borderColor: "#93ab9c",
                      color: "#102320",
                      WebkitTextFillColor: "#102320",
                      cursor: "pointer",
                    }}
                    className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border px-4 text-[0.95rem] font-semibold transition hover:bg-[#f3e7d8]"
                  >
                    Close
                  </button>
                )}
              </div>
            ) : null
          }
        >
          {isLoadingPastResult && (
            <div
              style={{
                ...loadingPanelStyle,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.85rem",
              }}
            >
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ width: "2.25rem", height: "2.25rem", border: "3px solid rgba(245,232,213,0.35)", borderTopColor: "rgba(245,232,213,0.9)", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
              <p style={{ margin: 0, fontSize: "0.98rem", fontWeight: 500, color: "rgba(245,232,213,0.9)" }}>Loading past submission...</p>
            </div>
          )}

          {!isLoadingPastResult && checkingOnChain && gradingState === "idle" && (
            <p style={{ ...compactLoadingPanelStyle, margin: 0 }}>
              Checking on-chain status…
            </p>
          )}

          {!isLoadingPastResult && examContent.status === "loading" && gradingState === "idle" && !checkingOnChain && (
            <p style={{ ...compactLoadingPanelStyle, margin: 0 }}>
              Loading questions...
            </p>
          )}

          {!isLoadingPastResult && examContent.status === "error" && gradingState === "idle" && (
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
              {examContent.message.includes("access not granted") ? (
                <>
                  You must be enrolled in this course to take the exam.{" "}
                  <Link href="/courses" style={{ color: "#7fbf9c", textDecoration: "underline" }}>Go to Courses</Link>
                  {" "}to enroll first.
                </>
              ) : examContent.message}
            </div>
          )}

          {/* Grading spinner */}
          {!isLoadingPastResult && gradingState === "pending" && (
            <div
              style={{
                ...loadingPanelStyle,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ width: "2.5rem", height: "2.5rem", border: "3px solid rgba(245,232,213,0.35)", borderTopColor: "rgba(245,232,213,0.9)", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
              <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500, color: "rgba(245,232,213,0.9)" }}>Arcium is grading your answers…</p>
              <p style={{ margin: 0, fontSize: "0.87rem", color: "rgba(245,232,213,0.72)" }}>This may take up to 2 minutes. Keep this window open.</p>
            </div>
          )}

          {/* Grading timeout */}
          {!isLoadingPastResult && gradingState === "timeout" && (
            <div style={{ padding: "1rem", borderRadius: "0.55rem", background: "#2a2010", border: "1px solid #5c4a20", color: "#f0d080", fontSize: "0.9rem" }}>
              Grading is taking longer than expected. Your answers were recorded on-chain — check back later or view the Session account for your score.
            </div>
          )}

          {/* Results view */}
          {!isLoadingPastResult && gradingState === "done" && correctAnswers && submittedAnswers && examContent.status === "success" && (() => {
            const questions = examContent.content.questions;
            const score = questions.reduce((acc, _, idx) => acc + (submittedAnswers[idx] === correctAnswers[idx] ? 1 : 0), 0);
            const pct = Math.round((score / questions.length) * 100);
            return (
              <div className="grid gap-[1.4rem]">
                {/* Score banner */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem 1.2rem",
                  borderRadius: "0.7rem",
                  background: pct >= 70 ? "#1a3828" : "#2a1a1a",
                  border: `1px solid ${pct >= 70 ? "#3d7a5a" : "#5c3535"}`,
                }}>
                  <div>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#93ab9c" }}>Your score</p>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "1.6rem", fontWeight: 700, color: pct >= 70 ? "#7fbf9c" : "#f0a0a0" }}>
                      {score} / {questions.length}
                    </p>
                  </div>
                  <div style={{ fontSize: "2.2rem", fontWeight: 700, color: pct >= 70 ? "#7fbf9c" : "#f0a0a0" }}>
                    {pct}%
                  </div>
                </div>

                {/* Per-question breakdown */}
                <ol className="grid list-none gap-[1.2rem] p-0">
                  {questions.map((q, idx) => {
                    const studentAns = submittedAnswers[idx];
                    const correctAns = correctAnswers[idx];
                    const isCorrect = studentAns === correctAns;
                    const optionLabel = (i: number) => String.fromCharCode(97 + i);
                    return (
                      <li key={idx} style={{ borderBottom: "1px solid #3d5450", paddingBottom: "1.2rem" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.8rem" }}>
                          <span style={{
                            flexShrink: 0,
                            width: "1.4rem",
                            height: "1.4rem",
                            borderRadius: "50%",
                            background: isCorrect ? "#2f4e3e" : "#4e2020",
                            border: `1px solid ${isCorrect ? "#7fbf9c" : "#c06060"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            color: isCorrect ? "#7fbf9c" : "#f0a0a0",
                            fontWeight: 700,
                            marginTop: "0.15rem",
                          }}>
                            {isCorrect ? "✓" : "✗"}
                          </span>
                          <p style={{ margin: 0, fontSize: "0.98rem", fontWeight: 600, color: "#eef6ed", lineHeight: 1.5 }}>
                            {idx + 1}. {q.prompt}
                          </p>
                        </div>
                        <ul className="grid list-none gap-[0.45rem] p-0" style={{ paddingLeft: "1.9rem" }}>
                          {q.options.map((opt, oi) => {
                            const isStudentChoice = oi === studentAns;
                            const isCorrectAnswer = oi === correctAns;
                            let bg = "#253533";
                            let border = "1px solid #3d5450";
                            let textColor = "#8aa89e";
                            if (isCorrectAnswer) { bg = "#1a3828"; border = "1px solid #3d7a5a"; textColor = "#eef6ed"; }
                            if (isStudentChoice && !isCorrectAnswer) { bg = "#3a1a1a"; border = "1px solid #7a3a3a"; textColor = "#f0a0a0"; }
                            return (
                              <li key={oi}>
                                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem", padding: "0.55rem 0.85rem", borderRadius: "0.45rem", border, background: bg, fontSize: "0.92rem", color: textColor, lineHeight: 1.5 }}>
                                  <span style={{ fontWeight: 600, minWidth: "1.1rem", flexShrink: 0, color: isCorrectAnswer ? "#7fbf9c" : isStudentChoice ? "#f0a0a0" : "#5a7a6a" }}>
                                    {optionLabel(oi)})
                                  </span>
                                  <span style={{ flex: 1 }}>{opt}</span>
                                  {isCorrectAnswer && <span style={{ fontSize: "0.78rem", color: "#7fbf9c", flexShrink: 0, fontWeight: 600 }}>✓ correct</span>}
                                  {isStudentChoice && !isCorrectAnswer && <span style={{ fontSize: "0.78rem", color: "#f0a0a0", flexShrink: 0, fontWeight: 600 }}>your answer</span>}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })()}

          {!isLoadingPastResult && examContent.status === "success" && gradingState === "idle" && (
            <ol className="grid list-none gap-[1.4rem] p-0">
              {examContent.content.questions.map((q, idx) => (
                <li key={idx} style={{ borderBottom: "1px solid #3d5450", paddingBottom: "1.6rem" }}>
                  <p
                    style={{ margin: "0 0 1rem", fontSize: "1.05rem", fontWeight: 600, color: "#eef6ed", lineHeight: 1.5 }}
                  >
                    {idx + 1}. {q.prompt}
                  </p>
                  <ul className="grid list-none gap-[0.6rem] p-0">
                    {q.options.map((opt, oi) => {
                      const label = String.fromCharCode(97 + oi);
                      const isSelected = answers[idx] === oi;
                      return (
                        <li key={oi}>
                          {isTutor ? (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "0.65rem",
                                padding: "0.7rem 1rem",
                                borderRadius: "0.55rem",
                                border: "1px solid #3d5450",
                                fontSize: "0.97rem",
                                color: "#c8dcd4",
                                background: "#253533",
                                lineHeight: 1.5,
                              }}
                            >
                              <span style={{ fontWeight: 600, color: "#7fbf9c", minWidth: "1.1rem", flexShrink: 0 }}>{label})</span>
                              <span>{opt}</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAnswers((prev) => ({ ...prev, [idx]: oi }))}
                              style={{
                                width: "100%",
                                textAlign: "left",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "0.65rem",
                                padding: "0.7rem 1rem",
                                borderRadius: "0.55rem",
                                border: isSelected ? "1.5px solid #7fbf9c" : "1px solid #3d5450",
                                fontSize: "0.97rem",
                                color: isSelected ? "#eef6ed" : "#c8dcd4",
                                background: isSelected ? "#2f4e3e" : "#253533",
                                cursor: "pointer",
                                transition: "all 0.15s",
                                lineHeight: 1.5,
                              }}
                            >
                              <span style={{ fontWeight: 600, color: isSelected ? "#7fbf9c" : "#7fbf9c", minWidth: "1.1rem", flexShrink: 0 }}>{label})</span>
                              <span>{opt}</span>
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
