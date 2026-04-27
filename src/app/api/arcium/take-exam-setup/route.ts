import "server-only";

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  getArciumProgram,
  getClusterAccAddress,
  getCompDefAccAddress,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMXEAccAddress,
  getMempoolAccAddress,
  getMempoolAccInfo,
} from "@arcium-hq/client";
import clientPromise from "@/lib/mongodb";
import { decryptWithArcium } from "@/lib/arcium";

const PROOF_ARCIUM_PID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");
const CLUSTER_OFFSET = Number(process.env.ARCIUM_CLUSTER_OFFSET ?? "456");
const GRADE_EXAM_COMP_DEF_OFFSET = 937725067;
const DB_NAME = "proof_arcium";
const COLLECTION = "exam_content";

let _connection: Connection | null = null;
function getConnection() {
  if (!_connection) {
    _connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
      "confirmed",
    );
  }
  return _connection;
}

function makeReadOnlyProvider(connection: Connection) {
  const wallet: anchor.Wallet = {
    publicKey: PublicKey.default,
    payer: undefined as unknown as anchor.web3.Keypair,
    signTransaction: async <T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(txs: T[]) => txs,
  };
  return new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

function parseSessionCompleted(data: Buffer): boolean {
  let offset = 8 + 8 + 8 + 32;
  if (data.length < offset + 4) return false;

  const answersLen = data.readUInt32LE(offset);
  offset += 4 + answersLen;

  offset += 2 + 4;

  if (data.length < offset + 4) return false;
  const correctnessLen = data.readUInt32LE(offset);
  offset += 4 + correctnessLen;

  return data.length > offset && data[offset] === 1;
}

/**
 * POST /api/arcium/take-exam-setup
 *
 * Body: { examId: string; studentWallet: string; answers: number[] }
 *
 * Returns all Arcium account addresses, the next computation offset,
 * plus the server-computed score (so the memo can include the real score
 * in the same transaction).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      examId: string;
      studentWallet: string;
      answers: number[];
    };

    if (!body.examId || !body.studentWallet || !Array.isArray(body.answers)) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // ── Compute score server-side ────────────────────────────────────────────
    const client = await clientPromise;
    const doc = await client
      .db(DB_NAME)
      .collection(COLLECTION)
      .findOne({ examId: body.examId });

    let score = 0;
    let totalQuestions = body.answers.length;
    let correctAnswers: number[] = [];
    if (doc?.answersEncrypted) {
      const enc = doc.answersEncrypted as {
        ciphertext: number[][];
        clientSecretKeyHex: string;
        nonceHex: string;
      };
      correctAnswers = decryptWithArcium(enc.ciphertext, enc.clientSecretKeyHex, enc.nonceHex);
      totalQuestions = correctAnswers.length;
      score = body.answers.reduce(
        (acc, ans, idx) => acc + (ans === correctAnswers[idx] ? 1 : 0),
        0,
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    const connection = getConnection();
    const provider = makeReadOnlyProvider(connection);
    const arciumProgram = getArciumProgram(provider);

    const mxeAddress = getMXEAccAddress(PROOF_ARCIUM_PID);
    const mempoolAddress = getMempoolAccAddress(CLUSTER_OFFSET);
    const executingPoolAddress = getExecutingPoolAccAddress(CLUSTER_OFFSET);
    const clusterAddress = getClusterAccAddress(CLUSTER_OFFSET);

    // Must match COMP_DEF_OFFSET_GRADE_EXAM = comp_def_offset("grade_exam_v4")
    // in the deployed Anchor program.
    let compDefOffset: number;
    const envCompDefOffset = process.env.ARCIUM_COMP_DEF_OFFSET;
    if (envCompDefOffset !== undefined) {
      compDefOffset = Number(envCompDefOffset);
    } else {
      compDefOffset = GRADE_EXAM_COMP_DEF_OFFSET;
    }
    const compDefAddress = getCompDefAccAddress(PROOF_ARCIUM_PID, compDefOffset);
    const compDefInfo = await connection.getAccountInfo(compDefAddress);
    const needsGradeExamCompDefInit = compDefInfo === null;
    let mxeAuthority: string | null = null;
    try {
      type MxeAccountData = { authority: PublicKey };
      const mxeAcc = (await (arciumProgram.account as unknown as Record<string, { fetch: (addr: PublicKey) => Promise<MxeAccountData> }>)["mxeAccount"].fetch(mxeAddress)) as MxeAccountData;
      mxeAuthority = mxeAcc.authority.toBase58();
    } catch {
      mxeAuthority = null;
    }

    if (needsGradeExamCompDefInit) {
      return NextResponse.json(
        {
          compDefAccount: compDefAddress.toBase58(),
          error:
            "Arcium grade_exam computation definition is not initialized. The MXE authority must call init_grade_exam_comp_def once before students can submit exams.",
          mxeAuthority,
          needsGradeExamCompDefInit,
        },
        { status: 409 },
      );
    }

    // Determine the next computation offset by reading the mempool's slot_counter.
    // The slot_counter increments for each computation queued, making it a safe
    // unique offset for the next computation account PDA.
    let computationOffset: bigint;
    try {
      const mempoolInfo = await getMempoolAccInfo(provider, mempoolAddress);
      // Anchor IDL camelCases snake_case fields: slot_counter → slotCounter
      const { lastUpdatedSlot, slotCounter } = (mempoolInfo as unknown as {
        inner: { lastUpdatedSlot: anchor.BN; slotCounter: anchor.BN | number };
      }).inner;
      computationOffset = (BigInt(lastUpdatedSlot.toString()) << BigInt(16)) + BigInt(slotCounter.toString());
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `Failed to read Arcium mempool slot counter: ${error.message}`
              : "Failed to read Arcium mempool slot counter.",
        },
        { status: 503 },
      );
    }

    const computationAddress = getComputationAccAddress(
      CLUSTER_OFFSET,
      new anchor.BN(computationOffset.toString()),
    );

    // Check whether the student has already submitted takeExam (session PDA exists).
    // seeds = ["session", u64_le(examId), student_pubkey]
    const sessionIdBuf = Buffer.alloc(8);
    sessionIdBuf.writeBigUInt64LE(BigInt(body.examId));
    const [sessionPda] = await PublicKey.findProgramAddress(
      [Buffer.from("session"), sessionIdBuf, new PublicKey(body.studentWallet).toBuffer()],
      PROOF_ARCIUM_PID,
    );
    const sessionInfo = await connection.getAccountInfo(sessionPda);
    if (sessionInfo !== null) {
      const completed = parseSessionCompleted(sessionInfo.data);
      return NextResponse.json(
        completed
          ? { error: "You have already completed this exam.", alreadyCompleted: true }
          : {
              error: "Your exam submission is already on-chain and waiting for Arcium grading.",
              alreadySubmitted: true,
              correctAnswers,
              pending: true,
              score,
              totalQuestions,
            },
        { status: 409 },
      );
    }

    // Check whether the student is enrolled (enrollment PDA must exist for takeExam).
    // First read the exam account to get its course_id.
    // Exam Borsh layout: discriminator(8) + exam_id(8) + course_id(8) + ...
    const examIdBuf = Buffer.alloc(8);
    examIdBuf.writeBigUInt64LE(BigInt(body.examId));
    const [examPda] = await PublicKey.findProgramAddress(
      [Buffer.from("exam"), examIdBuf],
      PROOF_ARCIUM_PID,
    );
    const examInfo = await connection.getAccountInfo(examPda);
    if (!examInfo?.data || examInfo.data.length < 8 + 8 + 8) {
      return NextResponse.json({ error: "Exam account not found on-chain." }, { status: 404 });
    }
    const courseId = examInfo.data.readBigUInt64LE(8 + 8); // skip discriminator(8) + exam_id(8)

    const courseIdBuf = Buffer.alloc(8);
    courseIdBuf.writeBigUInt64LE(courseId);
    const [enrollmentPda] = await PublicKey.findProgramAddress(
      [Buffer.from("enrollment"), courseIdBuf, new PublicKey(body.studentWallet).toBuffer()],
      PROOF_ARCIUM_PID,
    );
    const enrollmentInfo = await connection.getAccountInfo(enrollmentPda);
    if (enrollmentInfo === null) {
      return NextResponse.json(
        { error: "You must be enrolled in this course before taking the exam. Please enroll first." },
        { status: 403 },
      );
    }

    // Check whether the student already has an ExamAccess PDA on-chain.
    // takeExam requires this account to be initialized (Anchor Account<ExamAccess>).
    // If it doesn't exist we tell the client to prepend a requestExamAccess instruction.
    const [examAccessPda] = await PublicKey.findProgramAddress(
      [Buffer.from("exam-access"), examIdBuf, new PublicKey(body.studentWallet).toBuffer()],
      PROOF_ARCIUM_PID,
    );
    const examAccessInfo = await connection.getAccountInfo(examAccessPda);
    const needsExamAccessRequest = examAccessInfo === null;

    return NextResponse.json({
      clusterAccount: clusterAddress.toBase58(),
      compDefAccount: compDefAddress.toBase58(),
      computationAccount: computationAddress.toBase58(),
      computationOffset: computationOffset.toString(),
      executingPool: executingPoolAddress.toBase58(),
      mempoolAccount: mempoolAddress.toBase58(),
      mxeAccount: mxeAddress.toBase58(),
      score,
      totalQuestions,
      correctAnswers,
      needsExamAccessRequest,
      needsGradeExamCompDefInit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Arcium take-exam setup." },
      { status: 500 },
    );
  }
}
