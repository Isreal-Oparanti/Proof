"use client";

import { useSendTransaction, useWalletSession } from "@solana/react-hooks";
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

export function useProofArcium() {
  const wallet = useWalletSession();
  const transaction = useSendTransaction();

  async function sendInstruction(
    buildInstruction: (authority: Address) => Promise<Awaited<ReturnType<typeof buildInitializeInstruction>>>,
  ) {
    if (!wallet) {
      throw new Error("Connect a wallet before sending Proof Arcium transactions.");
    }

    const feePayer = ensureWallet(wallet.account.address);
    const instruction = await buildInstruction(feePayer);

    return transaction.send({
      authority: wallet,
      feePayer,
      instructions: [instruction],
    });
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

    initialize() {
      return sendInstruction((authority) => buildInitializeInstruction(authority));
    },

    registerUser(args: { name: string; role: ProofArciumRole }) {
      return sendInstruction((authority) => buildRegisterUserInstruction(authority, args));
    },

    createCourse(args: { courseId: bigint | number | string; title: string }) {
      return sendInstruction((authority) => buildCreateCourseInstruction(authority, args));
    },

    createExam(args: {
      courseId: bigint | number | string;
      encryptedExam: EncryptedExamInput;
      examId: bigint | number | string;
      questionCount: number;
      title: string;
    }) {
      return sendInstruction((authority) => buildCreateExamInstruction(authority, args));
    },

    enrollInCourse(args: { courseId: bigint | number | string }) {
      return sendInstruction((authority) => buildEnrollInCourseInstruction(authority, args));
    },

    requestExamAccess(args: {
      courseId: bigint | number | string;
      examId: bigint | number | string;
      studentContentPubkey: FixedBytes32;
    }) {
      return sendInstruction((authority) => buildRequestExamAccessInstruction(authority, args));
    },

    grantExamAccess(args: {
      courseId: bigint | number | string;
      encryptedContentKey: EncryptedContentKeyInput;
      examId: bigint | number | string;
      student: Address | string;
    }) {
      return sendInstruction((authority) => buildGrantExamAccessInstruction(authority, args));
    },

    initGradeExamCompDef(args: Omit<InitGradeExamCompDefAccounts, "payer">) {
      return sendInstruction((authority) =>
        buildInitGradeExamCompDefInstruction({ ...args, payer: authority }),
      );
    },

    takeExam(args: {
      answers: Uint8Array | readonly number[];
      computationOffset: bigint | number | string;
      courseId: bigint | number | string;
      examId: bigint | number | string;
      takeExamAccounts: TakeExamAccounts;
    }) {
      return sendInstruction((authority) => buildTakeExamInstruction(authority, args));
    },

    gradeExamCallback(args: GradeExamCallbackAccounts & { output: GradeExamCallbackOutput }) {
      return sendInstruction(async () => buildGradeExamCallbackInstruction(args));
    },
  };
}
