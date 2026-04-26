"use client";

import { useSendTransaction, useLookupTable, useWalletSession } from "@solana/react-hooks";
import type { Address } from "@solana/addresses";
import {
  buildCreateCourseInstruction,
  buildCreateExamInstruction,
  buildEnrollInCourseInstruction,
  buildGradeExamCallbackInstruction,
  buildGrantExamAccessInstruction,
  buildInitializeInstruction,
  buildInitGradeExamCompDefInstruction,
  buildRegisterUserInstruction,
  buildRequestExamAccessInstruction,
  buildTakeExamInstruction,
  findArciumSignerPda,
  findCoursePda,
  findEnrollmentPda,
  findExamAccessPda,
  findExamPda,
  findGlobalConfigPda,
  findSessionPda,
  findUserPda,
  MXE_LUT_ADDRESS,
  type EncryptedContentKeyInput,
  type EncryptedExamInput,
  type FixedBytes32,
  type GradeExamCallbackAccounts,
  type GradeExamCallbackOutput,
  type InitGradeExamCompDefAccounts,
  type ProofArciumRole,
  type TakeExamAccounts,
} from "@/lib/proofArcium";

function ensureWallet(address: Address | undefined) {
  if (!address) {
    throw new Error("Connect a wallet before sending Proof Arcium transactions.");
  }

  return address;
}

type TransactionPlanLike = {
  error?: unknown;
  kind?: string;
  plans?: TransactionPlanLike[];
  status?: string;
};

type RpcSimulationData = {
  err?: unknown;
  logs?: string[];
  message?: string;
  unitsConsumed?: number;
};

function getObjectProperty(value: unknown, property: string): unknown {
  if (!value || typeof value !== "object" || !(property in value)) {
    return undefined;
  }

  return (value as Record<string, unknown>)[property];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  const message = getObjectProperty(error, "message");
  return typeof message === "string" ? message : "Unknown transaction error.";
}

function getFirstFailedPlanError(plan: unknown): unknown {
  if (!plan || typeof plan !== "object") {
    return null;
  }

  const typedPlan = plan as TransactionPlanLike;
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

  return typedPlan.error ?? null;
}

function findRpcSimulationData(value: unknown, seen = new WeakSet<object>()): RpcSimulationData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  const maybeData = value as Record<string, unknown>;
  if (Array.isArray(maybeData.logs) || maybeData.err !== undefined) {
    return maybeData as RpcSimulationData;
  }

  for (const key of ["data", "context", "cause", "error", "transactionPlanResult"]) {
    const nested = findRpcSimulationData(maybeData[key], seen);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function parseInstructionError(err: unknown) {
  if (!err || typeof err !== "object" || !("InstructionError" in err)) {
    return null;
  }

  const instructionError = (err as { InstructionError?: unknown }).InstructionError;
  if (!Array.isArray(instructionError) || instructionError.length < 2) {
    return null;
  }

  const instructionIndex = instructionError[0];
  const detail = instructionError[1];
  const customCode =
    detail && typeof detail === "object" && "Custom" in detail
      ? Number((detail as { Custom: unknown }).Custom)
      : null;

  return {
    customCode: Number.isFinite(customCode) ? customCode : null,
    instructionIndex: typeof instructionIndex === "number" ? instructionIndex : null,
  };
}

function parseAnchorErrorLogs(logs: string[]) {
  const anchorLine = logs.find((line) => line.includes("AnchorError"));
  if (!anchorLine) {
    return null;
  }

  const match = anchorLine.match(
    /account: ([^.]+)\. Error Code: ([^.]+)\. Error Number: (\d+)\. Error Message: (.+)$/i,
  );
  const leftIndex = logs.findIndex((line) => line === "Program log: Left:");
  const rightIndex = logs.findIndex((line) => line === "Program log: Right:");

  return {
    account: match?.[1] ?? null,
    code: match?.[2] ?? null,
    left: leftIndex >= 0 ? logs[leftIndex + 1]?.replace("Program log: ", "") : null,
    message: match?.[4] ?? anchorLine,
    number: match?.[3] ? Number(match[3]) : null,
    right: rightIndex >= 0 ? logs[rightIndex + 1]?.replace("Program log: ", "") : null,
  };
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(
      value,
      (_key, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue),
      2,
    );
  } catch {
    return String(value);
  }
}

function logReadableTransactionError(error: unknown) {
  const transactionPlanResult = getObjectProperty(error, "transactionPlanResult");
  const failedPlanError = getFirstFailedPlanError(transactionPlanResult);
  const simulationData = findRpcSimulationData(failedPlanError) ?? findRpcSimulationData(error);
  const logs = simulationData?.logs ?? [];
  const instructionError = parseInstructionError(simulationData?.err);
  const anchorError = parseAnchorErrorLogs(logs);
  const invokedInstructions = logs
    .filter((line) => line.includes("Program log: Instruction:"))
    .map((line) => line.replace("Program log: Instruction: ", ""));

  console.groupCollapsed("[Proof Arcium] Transaction failed");
  console.error("Message:", getErrorMessage(failedPlanError ?? error));
  console.log("Summary:", {
    anchorError,
    invokedInstructions,
    instructionError,
    unitsConsumed: simulationData?.unitsConsumed ?? null,
  });

  if (logs.length > 0) {
    console.log("Simulation logs:");
    console.table(logs.map((line, index) => ({ index, line })));
  }

  if (transactionPlanResult) {
    console.log("transactionPlanResult:", transactionPlanResult);
  }

  console.log("Raw error JSON:", safeJson(error));
  console.groupEnd();
}

export function useProofArcium() {
  const wallet = useWalletSession();
  const transaction = useSendTransaction();
  const lutQuery = useLookupTable(MXE_LUT_ADDRESS);

  function getAuthority() {
    if (!wallet) {
      throw new Error("Connect a wallet before sending Proof Arcium transactions.");
    }

    return ensureWallet(wallet.account.address);
  }

  async function send(args: {
    instructions: Awaited<ReturnType<typeof buildInitializeInstruction>>[];
  }) {
    if (!wallet) {
      throw new Error("Connect a wallet before sending Proof Arcium transactions.");
    }

    const feePayer = getAuthority();
    try {
      return await transaction.send(
        {
          authority: wallet,
          feePayer,
          instructions: args.instructions,
          version: 0,
        },
        { skipPreflight: false },
      );
    } catch (error) {
      logReadableTransactionError(error);
      throw error;
    }
  }

  return {
    connectedAddress: wallet?.account.address,
    error: transaction.error,
    isSending: transaction.isSending,
    reset: transaction.reset,
    signature: transaction.signature,
    status: transaction.status,

    findArciumSignerPda,
    findCoursePda,
    findEnrollmentPda,
    findExamAccessPda,
    findExamPda,
    findGlobalConfigPda,
    findSessionPda,
    findUserPda,
    send,

    getInitializeInstruction() {
      return buildInitializeInstruction(getAuthority());
    },

    getRegisterUserInstruction(args: { name: string; role: ProofArciumRole }) {
      return buildRegisterUserInstruction(getAuthority(), args);
    },

    getCreateCourseInstruction(args: { courseId: bigint | number | string; title: string }) {
      return buildCreateCourseInstruction(getAuthority(), args);
    },

    getCreateExamInstruction(args: {
      courseId: bigint | number | string;
      encryptedExam: EncryptedExamInput;
      examId: bigint | number | string;
      questionCount: number;
      title: string;
    }) {
      return buildCreateExamInstruction(getAuthority(), args);
    },

    getEnrollInCourseInstruction(args: { courseId: bigint | number | string }) {
      return buildEnrollInCourseInstruction(getAuthority(), args);
    },

    getRequestExamAccessInstruction(args: {
      courseId: bigint | number | string;
      examId: bigint | number | string;
      studentContentPubkey: FixedBytes32;
    }) {
      return buildRequestExamAccessInstruction(getAuthority(), args);
    },

    getGrantExamAccessInstruction(args: {
      courseId: bigint | number | string;
      encryptedContentKey: EncryptedContentKeyInput;
      examId: bigint | number | string;
      student: Address | string;
    }) {
      return buildGrantExamAccessInstruction(getAuthority(), args);
    },

    getInitGradeExamCompDefInstruction(args: Omit<InitGradeExamCompDefAccounts, "payer">) {
      return buildInitGradeExamCompDefInstruction({ ...args, payer: getAuthority() });
    },

    getTakeExamInstruction(args: {
      answers: Uint8Array | readonly number[];
      computationOffset: bigint | number | string;
      courseId: bigint | number | string;
      examId: bigint | number | string;
      takeExamAccounts: TakeExamAccounts;
    }) {
      // Do not pass LUT data — use all static accounts to avoid
      // "sanitize accounts offsets correctly" RPC errors caused by
      // stale/mismatched LUT address indices.
      return buildTakeExamInstruction(getAuthority(), args, undefined);
    },

    getGradeExamCallbackInstruction(args: GradeExamCallbackAccounts & { output: GradeExamCallbackOutput }) {
      return buildGradeExamCallbackInstruction(args);
    },
  };
}
