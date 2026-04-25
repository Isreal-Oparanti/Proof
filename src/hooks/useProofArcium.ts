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
    return transaction.send({
      authority: wallet,
      feePayer,
      instructions: args.instructions,
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
      return buildTakeExamInstruction(getAuthority(), args);
    },

    getGradeExamCallbackInstruction(args: GradeExamCallbackAccounts & { output: GradeExamCallbackOutput }) {
      return buildGradeExamCallbackInstruction(args);
    },
  };
}
