"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useWalletConnection } from "@solana/react-hooks";
import { Connection, PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";
import { AddExamDrawer } from "@/components/AddExamDrawer";
import { useProofArcium } from "@/hooks/useProofArcium";
import { useProofCourses } from "@/hooks/useProofCourses";
import { useProofUsers } from "@/hooks/useProofUsers";
import { useEnrollments } from "@/hooks/useEnrollments";
import {
  coerceAccountDataBytes,
  decodeGlobalConfigAccount,
  decodeUserAccount,
  findGlobalConfigPda,
  findUserPda,
} from "@/lib/proofArcium";

type UserRole = "student" | "tutor";

type RegistrationFormData = {
  fullName: string;
  role: UserRole;
};

type ArciumStatus = {
  arciumAvailable: true;
  backupClusterOffset: number | null;
  clusterOffset: number | null;
  hasMxePublicKey: boolean;
  mode: "configured" | "demo";
};

type ArciumEncryptionResult = ArciumStatus & {
  ciphertext: number[][];
  clientPublicKeyHex: string;
  mxePublicKeyHex: string;
  nonceHex: string;
  plaintext: string[];
};

type PlanFailureLike = {
  error?: unknown;
  kind?: string;
  logs?: string[];
  message?: string;
  plans?: PlanFailureLike[];
  status?: string;
  transactionPlanResult?: PlanFailureLike;
};

const DEVNET_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const MAX_USER_NAME_LENGTH = 64;
const MAX_COURSE_TITLE_LENGTH = 100;
const loadingPanelStyle: CSSProperties = {
  borderRadius: "0.95rem",
  background: "linear-gradient(160deg,#2a3b39,#253533)",
  padding: "1.25rem",
  fontSize: "0.95rem",
  color: "rgba(245,232,213,0.8)",
};

function getLastLogLine(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("logs" in value && Array.isArray(value.logs) && value.logs.length > 0) {
    const lastLine = value.logs.at(-1);
    return typeof lastLine === "string" ? lastLine : null;
  }

  if ("context" in value && value.context && typeof value.context === "object") {
    return getLastLogLine(value.context);
  }

  return null;
}

function getMessageFromUnknownError(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return null;
}

function getCustomProgramErrorCode(error: unknown): number | null {
  const message = getMessageFromUnknownError(error);
  if (!message) {
    return null;
  }

  const match = message.match(/custom program error: #(\d+)/i);
  return match ? Number(match[1]) : null;
}

function getFirstFailedPlanError(plan: unknown): unknown {
  if (!plan || typeof plan !== "object") {
    return null;
  }

  const typedPlan = plan as PlanFailureLike;

  if (typedPlan.kind === "single" && typedPlan.status === "failed" && typedPlan.error) {
    return typedPlan.error;
  }

  if (Array.isArray(typedPlan.plans)) {
    for (const nestedPlan of typedPlan.plans) {
      const nestedError = getFirstFailedPlanError(nestedPlan);
      if (nestedError) {
        return nestedError;
      }
    }
  }

  return null;
}

function getDetailedErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "transactionPlanResult" in error) {
    const failedPlanError = getFirstFailedPlanError(error.transactionPlanResult);
    const failedMessage = getMessageFromUnknownError(failedPlanError);
    const lastLogLine = getLastLogLine(failedPlanError);

    if (failedMessage && lastLogLine && lastLogLine !== failedMessage) {
      return `${failedMessage} (${lastLogLine})`;
    }

    if (failedMessage) {
      return failedMessage;
    }
  }

  return getMessageFromUnknownError(error) || fallback;
}

function isAlreadyProcessedError(error: unknown) {
  const detailedMessage = getDetailedErrorMessage(error, "").toLowerCase();
  const rawMessage = (getMessageFromUnknownError(error) || "").toLowerCase();

  return detailedMessage.includes("already been processed") || rawMessage.includes("already been processed");
}

function isSpuriousTransactionPlanError(error: unknown) {
  if (!error || typeof error !== "object" || !("transactionPlanResult" in error)) {
    return false;
  }
  return getFirstFailedPlanError((error as { transactionPlanResult: unknown }).transactionPlanResult) === null;
}

function isTransactionPlanFailedWrapper(error: unknown) {
  const message = (getMessageFromUnknownError(error) || "").toLowerCase();
  return message.includes("provided transaction plan failed to execute");
}

function getTransactionPlanResult(error: unknown) {
  return error && typeof error === "object" && "transactionPlanResult" in error
    ? (error as { transactionPlanResult: unknown }).transactionPlanResult
    : null;
}

function logEnrollFailureDetails(error: unknown, courseId: bigint, title: string) {
  console.log("Enroll course real error message", getDetailedErrorMessage(error, "Failed to enroll in course."));
  console.log("Enroll course failure details", {
    courseId: courseId.toString(),
    customProgramErrorCode: getCustomProgramErrorCode(error),
    rawMessage: getMessageFromUnknownError(error),
    title,
    transactionPlanResult: getTransactionPlanResult(error),
  });
}

function hasFetchedOnChainAccount(account: ReturnType<typeof useAccount>) {
  return Boolean(
    account &&
      typeof account === "object" &&
      account.fetching === false &&
      account.owner !== null &&
      account.lamports !== null &&
      account.data !== undefined,
  );
}

function isMissingOnChainAccount(account: ReturnType<typeof useAccount>) {
  return Boolean(
    account &&
      typeof account === "object" &&
      account.fetching === false &&
      account.owner === null &&
      account.lamports === null &&
      account.data === undefined,
  );
}

export default function Home() {
  const { status, wallet } = useWalletConnection();
  const proofArcium = useProofArcium();
  const [arciumStatus, setArciumStatus] = useState<ArciumStatus | null>(null);
  const [arciumError, setArciumError] = useState<string | null>(null);
  const [arciumResult, setArciumResult] = useState<ArciumEncryptionResult | null>(null);
  const [arciumValues, setArciumValues] = useState<[number, number]>([7, 21]);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [formData, setFormData] = useState<RegistrationFormData>({
    fullName: "",
    role: "student",
  });
  const [userPdaAddress, setUserPdaAddress] = useState<string | null>(null);
  const [globalConfigAddress, setGlobalConfigAddress] = useState<string | null>(null);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [selectedCourseForExam, setSelectedCourseForExam] = useState<null | {
    courseId: bigint;
    title: string;
    tutor: string;
    tutorName: string;
  }>(null);
  const connectedWalletAddress = wallet?.account?.address?.toString() ?? null;
  const courseQuery = useProofCourses();
  const userProfilesQuery = useProofUsers();
  const userAccount = useAccount(userPdaAddress ?? undefined, {
    fetch: true,
    skip: !userPdaAddress,
    watch: true,
  });
  const globalConfigAccount = useAccount(globalConfigAddress ?? undefined, {
    fetch: true,
    skip: !globalConfigAddress,
    watch: true,
  });
  const hasFetchedUserAccount = Boolean(
    userAccount &&
      typeof userAccount === "object" &&
      userAccount.fetching === false,
  );
  const isRegisteredOnChain = Boolean(
    hasFetchedUserAccount && hasFetchedOnChainAccount(userAccount),
  );
  const hasGlobalConfig = hasFetchedOnChainAccount(globalConfigAccount);
  const isGlobalConfigMissing = isMissingOnChainAccount(globalConfigAccount);
  const isGlobalConfigLoading = Boolean(globalConfigAccount?.fetching);
  const decodedGlobalConfig = useMemo(() => {
    const accountBytes =
      globalConfigAccount && typeof globalConfigAccount === "object" && "data" in globalConfigAccount
        ? coerceAccountDataBytes(globalConfigAccount.data)
        : null;

    if (!hasGlobalConfig || !accountBytes) {
      return null;
    }

    try {
      return decodeGlobalConfigAccount(accountBytes);
    } catch (error) {
      console.error("Failed to decode global config account", error);
      return null;
    }
  }, [globalConfigAccount, hasGlobalConfig]);
  const onChainProfile = useMemo(() => {
    const accountBytes =
      userAccount && typeof userAccount === "object" && "data" in userAccount
        ? coerceAccountDataBytes(userAccount.data)
        : null;

    if (
      !isRegisteredOnChain ||
      !userAccount ||
      typeof userAccount !== "object" ||
      !accountBytes
    ) {
      return null;
    }

    try {
      const decodedProfile = decodeUserAccount(accountBytes);
      console.log("Fetched on-chain user profile (page)", decodedProfile);
      // console.log("Readable on-chain user name (page)", decodedProfile.name);
      // console.log("Readable on-chain user role (page)", decodedProfile.role);
      return decodedProfile;
    } catch (error) {
      console.error("Failed to decode user account", {
        error,
        rawData: "data" in userAccount ? userAccount.data : null,
        normalizedBytes: Array.from(accountBytes),
      });
      return null;
    }
  }, [isRegisteredOnChain, userAccount]);
  const effectiveName = onChainProfile?.name ?? formData.fullName;
  const effectiveRole = onChainProfile?.role ?? formData.role;
  const isRegistered = connectedWalletAddress !== null && isRegisteredOnChain;
  const isTutor = effectiveRole === "tutor";
  const displayCourses = useMemo(() => courseQuery.courses, [courseQuery.courses]);
  const [enrolledCourseIds, refreshEnrollments] = useEnrollments(
    useMemo(() => displayCourses.map((c) => c.courseId), [displayCourses]),
    !isTutor ? connectedWalletAddress : null,
  );
  const nextExamId = useMemo(
    () => (decodedGlobalConfig ? (decodedGlobalConfig.examCounter + BigInt(1)).toString() : null),
    [decodedGlobalConfig],
  );

  useEffect(() => {
    console.log("Displayed courses on home page", displayCourses);
  }, [displayCourses]);

  useEffect(() => {
    let cancelled = false;

    async function loadArciumStatus() {
      try {
        const response = await fetch("/api/arcium/encrypt");
        const data = (await response.json()) as ArciumStatus;

        if (!response.ok) {
          throw new Error("Failed to load Arcium status.");
        }

        if (!cancelled) {
          setArciumStatus(data);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Failed to load Arcium status.";
          setArciumError(message);
          toast.error(message);
        }
      }
    }

    loadArciumStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(async () => {
        if (!connectedWalletAddress) {
          queueMicrotask(() => setUserPdaAddress(null));
          return;
        }

        const pda = await findUserPda(connectedWalletAddress);
        console.log("Derived user PDA (page)", {
          walletAddress: connectedWalletAddress,
          userPda: pda,
        });
        if (!cancelled) {
          setUserPdaAddress(pda);
        }
      })
      .catch((error) => {
        console.error("Failed to derive user PDA", error);
        if (!cancelled) {
          setUserPdaAddress(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [connectedWalletAddress]);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve()
      .then(async () => {
        const pda = await findGlobalConfigPda();
        if (!cancelled) {
          setGlobalConfigAddress(pda);
        }
      })
      .catch((error) => {
        console.error("Failed to derive global config PDA", error);
        if (!cancelled) {
          setGlobalConfigAddress(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userPdaAddress) {
      return;
    }

    const accountBytes =
      userAccount && typeof userAccount === "object" && "data" in userAccount
        ? coerceAccountDataBytes(userAccount.data)
        : null;

    // console.log("Fetched raw user account (page)", {
    //   userPdaAddress,
    //   exists:
    //     userAccount && typeof userAccount === "object" && "exists" in userAccount
    //       ? userAccount.exists
    //       : null,
    //   fetching:
    //     userAccount && typeof userAccount === "object" && "fetching" in userAccount
    //       ? userAccount.fetching
    //       : null,
    //   owner:
    //     userAccount && typeof userAccount === "object" && "owner" in userAccount
    //       ? userAccount.owner
    //       : null,
    //   lamports:
    //     userAccount && typeof userAccount === "object" && "lamports" in userAccount
    //       ? userAccount.lamports
    //       : null,
    //   rawData:
    //     userAccount && typeof userAccount === "object" && "data" in userAccount
    //       ? userAccount.data
    //       : null,
    //   rawDataKeys:
    //     userAccount &&
    //     typeof userAccount === "object" &&
    //     "data" in userAccount &&
    //     userAccount.data &&
    //     typeof userAccount.data === "object"
    //       ? Object.keys(userAccount.data)
    //       : null,
    //   normalizedByteLength: accountBytes?.length ?? null,
    //   normalizedBytePreview: accountBytes ? Array.from(accountBytes.slice(0, 24)) : null,
    //   userAccount,
    // });
  }, [userAccount, userPdaAddress]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = formData.fullName.trim();
    if (!trimmedName) {
      toast.error("Enter your full name to continue.");
      return;
    }

    if (trimmedName.length > MAX_USER_NAME_LENGTH) {
      toast.error(`Full name must be ${MAX_USER_NAME_LENGTH} characters or less.`);
      return;
    }

    if (!connectedWalletAddress) {
      toast.error("Connect a wallet before creating a profile.");
      return;
    }

    if (isRegisteredOnChain) {
      toast.success("This wallet already has a registered on-chain profile.");
      return;
    }

    proofArcium.reset();

    try {
      const instruction = await proofArcium.getRegisterUserInstruction({
        name: trimmedName,
        role: formData.role,
      });
      await proofArcium.send({ instructions: [instruction] });

      setFormData((prev) => ({
        ...prev,
        fullName: trimmedName,
      }));
      toast.success(`Registered ${trimmedName} as ${formData.role}.`);
    } catch (error) {
      if (isAlreadyProcessedError(error) || isSpuriousTransactionPlanError(error)) {
        setFormData((prev) => ({ ...prev, fullName: trimmedName }));
        toast.success(`Registered ${trimmedName} as ${formData.role}.`);
        return;
      }
      console.error("Registration transaction failed", error);
      toast.error(getDetailedErrorMessage(error, "Failed to register user."));
    }
  };

  const createCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitle = courseTitle.trim();
    if (!trimmedTitle) {
      return;
    }

    if (!connectedWalletAddress) {
      toast.error("Connect a wallet before creating a course.");
      return;
    }

    if (proofArcium.isSending) {
      return;
    }

    if (isGlobalConfigLoading || !globalConfigAddress) {
      toast.error("Program configuration is still loading. Try again in a moment.");
      return;
    }

    if (trimmedTitle.length > MAX_COURSE_TITLE_LENGTH) {
      toast.error(`Course title must be ${MAX_COURSE_TITLE_LENGTH} characters or less.`);
      return;
    }

    if (!decodedGlobalConfig) {
      toast.error("Unable to read the on-chain course counter.");
      return;
    }

    const nextCourseId = (decodedGlobalConfig.courseCounter + BigInt(1)).toString();

    proofArcium.reset();

    try {
      if (isGlobalConfigMissing) {
        try {
          const initializeInstruction = await proofArcium.getInitializeInstruction();
          await proofArcium.send({ instructions: [initializeInstruction] });
        } catch (error) {
          const errorCode = getCustomProgramErrorCode(error);

          console.error("Initialize transaction failed before createCourse", {
            errorCode,
            errorMessage: getMessageFromUnknownError(error),
          });

          if (errorCode !== 0 && errorCode !== 6000) {
            throw error;
          }
        }
      } else if (!hasGlobalConfig) {
        toast.error("Program configuration is unavailable.");
        return;
      }

      const instruction = await proofArcium.getCreateCourseInstruction({
        courseId: nextCourseId,
        title: trimmedTitle,
      });
      await proofArcium.send({ instructions: [instruction] });
      await courseQuery.refresh();
      setCourseTitle("");
      setIsCreateOpen(false);
      toast.success(`Created ${trimmedTitle}.`);
    } catch (error) {
      if (isAlreadyProcessedError(error) || isSpuriousTransactionPlanError(error)) {
        await courseQuery.refresh();
        setCourseTitle("");
        setIsCreateOpen(false);
        toast.success(`Created ${trimmedTitle}.`);
        return;
      }

      console.error("Create course transaction failed", error);
      console.error("Create course on-chain failure details", {
        customProgramErrorCode: getCustomProgramErrorCode(error),
        courseId: nextCourseId,
        detailedMessage: getDetailedErrorMessage(error, "Failed to create course."),
        errorMessage: getMessageFromUnknownError(error),
        title: trimmedTitle,
        transactionPlanResult:
          error && typeof error === "object" && "transactionPlanResult" in error
            ? error.transactionPlanResult
            : null,
      });
      toast.error(getDetailedErrorMessage(error, "Failed to create course."));
    }
  };

  const enrollInCourse = async (courseId: bigint, title: string) => {
    if (!connectedWalletAddress) {
      toast.error("Connect a wallet before enrolling in a course.");
      return;
    }

    if (proofArcium.isSending) {
      return;
    }

    proofArcium.reset();

    const confirmEnrollmentOnChain = async () => {
      const enrollmentPda = await proofArcium.findEnrollmentPda(
        courseId,
        connectedWalletAddress,
      );
      const connection = new Connection(DEVNET_ENDPOINT, "confirmed");

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const accountInfo = await connection.getAccountInfo(new PublicKey(enrollmentPda));
        if (accountInfo !== null) {
          return true;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 900);
        });
      }

      return false;
    };

    try {
      const instruction = await proofArcium.getEnrollInCourseInstruction({
        courseId: courseId.toString(),
      });
      await proofArcium.send({ instructions: [instruction] });
      await courseQuery.refresh();
      refreshEnrollments();
      toast.success(`Enrolled in ${title}.`);
    } catch (error) {
      logEnrollFailureDetails(error, courseId, title);

      if (isAlreadyProcessedError(error) || isSpuriousTransactionPlanError(error)) {
        await courseQuery.refresh();
        refreshEnrollments();
        toast.success(`Enrolled in ${title}.`);
        return;
      }

      if (isTransactionPlanFailedWrapper(error) && await confirmEnrollmentOnChain()) {
        await courseQuery.refresh();
        refreshEnrollments();
        toast.success(`Enrolled in ${title}.`);
        return;
      }

      console.error("Enroll course transaction failed", error);
      toast.error(getDetailedErrorMessage(error, "Failed to enroll in course."));
    }
  };

  const openAddExamDrawer = (course: {
    courseId: bigint;
    title: string;
    tutor: string;
    tutorName: string;
  }) => {
    setSelectedCourseForExam(course);
    setIsAddExamOpen(true);
  };

  const walletAddress = useMemo(() => {
    if (!wallet?.account?.address) return "No wallet connected";

    const address = wallet.account.address.toString();
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }, [wallet]);

  const isConnected = status === "connected";

  const runArciumEncryption = async () => {
    setArciumError(null);
    setIsEncrypting(true);

    try {
      const response = await fetch("/api/arcium/encrypt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: arciumValues }),
      });
      const data = (await response.json()) as ArciumEncryptionResult | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Arcium encryption failed.");
      }

      setArciumStatus(data);
      setArciumResult(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Arcium encryption failed.";
      setArciumError(message);
      toast.error(message);
    } finally {
      setIsEncrypting(false);
    }
  };

  return (
    <div className="min-h-screen pt-8 pb-12 font-[family:var(--font-geist-sans)]">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
        <main
          className={
            status === "connected" && !isRegistered
              ? "mx-auto flex min-h-[calc(100vh-8rem)] w-full items-center justify-center"
              : "mx-auto grid min-h-[calc(100vh-8rem)] w-full gap-8"
          }
        >
          {isRegistered ? (
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
                <button
                  type="button"
                  style={{
                    height: "2.55rem",
                    color: "var(--background)",
                    WebkitTextFillColor: "var(--background)",
                    opacity: 1,
                  }}
                  className="inline-flex min-w-[10.25rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[var(--secondary)] px-[1.1rem] text-center text-[0.95rem] font-semibold transition hover:-translate-y-px hover:bg-[#f3e7d8]"
                  onClick={() => setIsCreateOpen(true)}
                >
                  Create Course
                </button>
                <Link
                  href="/exam"
                  style={{
                    height: "2.55rem",
                    color: "var(--background)",
                    WebkitTextFillColor: "var(--background)",
                    opacity: 1,
                    textDecoration: "none",
                  }}
                  className="inline-flex min-w-[10.25rem] cursor-pointer items-center justify-center rounded-lg border border-[#253533] bg-[var(--secondary)] px-[1.1rem] text-center text-[0.95rem] font-semibold transition hover:-translate-y-px hover:bg-[#f3e7d8]"
                >
                  {isTutor ? "My Exams" : "Exams"}
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
                {courseQuery.isLoading ? (
                  <article style={loadingPanelStyle} className="md:col-span-2 xl:col-span-3">
                    Loading courses...
                  </article>
                ) : displayCourses.length === 0 ? (
                  <article className="rounded-[0.95rem] border border-[#4a6460] bg-[linear-gradient(160deg,#2a3b39,#253533)] p-5 text-[0.95rem] text-[var(--secondary)]/80 md:col-span-2 xl:col-span-3">
                    {isTutor ? "No courses created on-chain yet." : "No published courses found yet."}
                  </article>
                ) : (
                  displayCourses.map((course) => {
                    const tutorLabel =
                      course.tutorName || `${course.tutor.slice(0, 4)}...${course.tutor.slice(-4)}`;
                    const isOwnerTutor = isTutor && connectedWalletAddress === course.tutor;
                    const shouldShowEnroll = isRegistered && !isTutor;
                    const actionDisabled = isTutor && !isOwnerTutor;

                    return (
                    <article
                      key={course.address}
                      style={{
                        borderRadius: "0.7rem",
                        gap: "0.85rem",
                        padding: "1.1rem 1.15rem",
                      }}
                      className="grid border border-[#4a6460] bg-[linear-gradient(160deg,#2a3b39,#253533)]"
                    >
                      <h2 className="m-0 text-[1.08rem] font-semibold leading-[1.35] text-[var(--secondary)]">
                        {course.title}
                      </h2>
                      <p style={{ margin: 0 }} className="text-[0.92rem] text-[var(--secondary)]/78">
                        Tutor: {tutorLabel}
                      </p>
                      <p style={{ margin: 0 }} className="text-[0.92rem] text-[var(--secondary)]/78">
                        Status: {course.active ? "Active" : "Inactive"}
                      </p>
                      <p style={{ margin: 0 }} className="break-all text-[0.82rem] text-[var(--secondary)]/62">
                        Tutor wallet: {course.tutor}
                      </p>
                      <div style={{ paddingTop: "0.35rem" }}>
                        {shouldShowEnroll ? (
                          <button
                            type="button"
                            style={{
                              minHeight: "2.5rem",
                              padding: "0.68rem 1rem",
                              borderRadius: "0.58rem",
                              WebkitTextFillColor: enrolledCourseIds.has(course.courseId.toString()) ? "#54635d" : "#102320",
                              background: enrolledCourseIds.has(course.courseId.toString()) ? "#e5dfd6" : "var(--secondary)",
                              borderColor: enrolledCourseIds.has(course.courseId.toString()) ? "#a2aea1" : "#93ab9c",
                              cursor: enrolledCourseIds.has(course.courseId.toString()) ? "default" : "pointer",
                            }}
                            className="inline-flex items-center justify-center border text-[0.9rem] font-semibold transition"
                            onClick={() => {
                              if (!enrolledCourseIds.has(course.courseId.toString())) {
                                void enrollInCourse(course.courseId, course.title);
                              }
                            }}
                            disabled={proofArcium.isSending || enrolledCourseIds.has(course.courseId.toString())}
                          >
                            {enrolledCourseIds.has(course.courseId.toString())
                              ? "Enrolled"
                              : proofArcium.isSending
                              ? "Enrolling..."
                              : "Enroll"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            style={{
                              minHeight: "2.5rem",
                              padding: "0.68rem 1rem",
                              borderRadius: "0.58rem",
                              background: actionDisabled ? "#e5dfd6" : "var(--secondary)",
                              borderColor: actionDisabled ? "#a2aea1" : "#93ab9c",
                              color: actionDisabled ? "#54635d" : "#102320",
                              opacity: actionDisabled ? 0.92 : 1,
                              pointerEvents: actionDisabled ? "none" : "auto",
                              cursor: actionDisabled ? "not-allowed" : "pointer",
                            }}
                            className="inline-flex cursor-pointer items-center justify-center border border-[#93ab9c] bg-[var(--secondary)] text-[0.9rem] font-semibold text-[#102320] transition hover:bg-[#f3e7d8]"
                            onClick={() => {
                              if (actionDisabled) {
                                return;
                              }

                              openAddExamDrawer({
                                courseId: course.courseId,
                                title: course.title,
                                tutor: course.tutor,
                                tutorName: course.tutorName,
                              });
                            }}
                            aria-disabled={actionDisabled}
                            title={actionDisabled ? "Only the course owner can add an exam." : "Add an exam for this course"}
                          >
                            Add Exam
                          </button>
                        )}
                      </div>
                    </article>
                    );
                  })
                )}
              </section>
            </section>
          ) : null}

          {status === "connected" && !isRegistered ? (
            <section className="flex w-full items-center justify-center py-6">
              <div
                style={{ padding: "18px 20px" }}
                className="w-full max-w-[460px] rounded-[0.95rem] border border-[#bdc79f] bg-[var(--secondary)] shadow-[0_18px_40px_rgba(5,14,13,0.4)]"
              >
                <h2
                  style={{ marginBottom: "4px" }}
                  className="text-[1.6rem] leading-none tracking-[0.02em] text-[#233525]"
                >
                  Register Your Account
                </h2>
                <p className="text-[0.95rem] text-[#3e4f3d]">
                  Create your on-chain user profile before continuing.
                </p>
                <form
                  onSubmit={handleSubmit}
                  style={{ marginTop: "12px" }}
                  className="rounded-[0.85rem] bg-[rgba(255,255,255,0.2)]"
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                      padding: "14px 18px",
                    }}
                    className="sm:px-10 sm:py-7"
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      <label
                        htmlFor="fullName"
                        className="text-[0.98rem] font-semibold text-[#243527]"
                      >
                        Full name
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        value={formData.fullName}
                        style={{ paddingInline: "20px", color: "#253533", WebkitTextFillColor: "#253533" }}
                        onChange={(event) =>
                          setFormData((prev) => ({ ...prev, fullName: event.target.value }))
                        }
                        placeholder="Enter your full name"
                        className="min-h-[3.1rem] w-full rounded-[0.65rem] border border-[#b6c3a3] bg-[var(--secondary)] py-[0.8rem] text-[1rem] text-[#1b2c1d] outline-none placeholder:text-[#94a08f] focus:border-[#2f4331] focus:ring-2 focus:ring-[rgba(35,53,37,0.2)]"
                        required
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      <label htmlFor="role" className="text-[0.98rem] font-semibold text-[#243527]">
                        Role
                      </label>
                      <select
                        id="role"
                        value={formData.role}
                        style={{ paddingInline: "20px", color: "#253533", WebkitTextFillColor: "#253533" }}
                        onChange={(event) =>
                          setFormData((prev) => ({
                            ...prev,
                            role: event.target.value as UserRole,
                          }))
                        }
                        className="min-h-[3.1rem] w-full rounded-[0.65rem] border border-[#b6c3a3] bg-[var(--secondary)] py-[0.8rem] text-[1rem] text-[#1b2c1d] outline-none focus:border-[#2f4331] focus:ring-2 focus:ring-[rgba(35,53,37,0.2)]"
                      >
                        <option value="student">Student</option>
                        <option value="tutor">Tutor</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      style={{ marginTop: "0" }}
                      className="inline-flex min-h-[3rem] min-w-[12rem] cursor-pointer items-center justify-center rounded-[0.72rem] border border-[#89a391] bg-[#0f1f1d] px-6 py-[0.8rem] text-[1rem] font-semibold tracking-[0.02em] text-[var(--secondary)] transition hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={proofArcium.isSending}
                    >
                      {proofArcium.isSending ? "Registering..." : "Register"}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}
        </main>
      </div>

      <AddExamDrawer
        course={selectedCourseForExam}
        nextExamId={nextExamId}
        onClose={() => {
          setIsAddExamOpen(false);
          setSelectedCourseForExam(null);
        }}
        open={isAddExamOpen}
        tutorDisplayName={effectiveName}
      />

      {isRegistered && isCreateOpen ? (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-[rgba(4,11,10,0.62)]"
          onClick={() => setIsCreateOpen(false)}
        >
          <div
            style={{ padding: "18px 20px" }}
            className="w-full max-w-[460px] rounded-[0.95rem] border border-[#bdc79f] bg-[var(--secondary)] shadow-[0_18px_40px_rgba(5,14,13,0.4)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              style={{ marginBottom: "4px" }}
              className="text-[1.6rem] leading-none tracking-[0.02em] text-[#233525]"
            >
              Create Course
            </h2>
       
            <form
              onSubmit={createCourse}
              style={{ marginTop: "12px" }}
              className="rounded-[0.85rem] bg-[rgba(255,255,255,0.2)]"
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  padding: "14px 18px",
                }}
                className="sm:px-10 sm:py-7"
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <label htmlFor="courseTitle" className="text-[0.98rem] font-semibold text-[#243527]">
                    Course title
                  </label>
                  <input
                    id="courseTitle"
                    type="text"
                    value={courseTitle}
                    style={{ paddingInline: "20px", WebkitTextFillColor: "#1b2c1d" }}
                    onChange={(event) => setCourseTitle(event.target.value)}
                    placeholder="e.g. Solana Basics"
                    className="min-h-[3.1rem] w-full rounded-[0.65rem] border border-[#b6c3a3] bg-[var(--secondary)] py-[0.8rem] text-[1rem] text-[#1b2c1d] outline-none placeholder:text-[#94a08f] focus:border-[#2f4331] focus:ring-2 focus:ring-[rgba(35,53,37,0.2)]"
                    required
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    marginTop: "0",
                    background: "#0f1f1d",
                    borderColor: "#89a391",
                    color: proofArcium.isSending ? "#9fd39f" : "var(--secondary)",
                    cursor: proofArcium.isSending ? "not-allowed" : "pointer",
                    opacity: 1,
                  }}
                  className="inline-flex min-h-[3rem] min-w-[12rem] items-center justify-center rounded-[0.72rem] border px-6 py-[0.8rem] text-[1rem] font-semibold tracking-[0.02em] transition hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed"
                  disabled={proofArcium.isSending}
                >
                  {proofArcium.isSending ? "Saving..." : "Save Course"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
