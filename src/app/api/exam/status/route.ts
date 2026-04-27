import "server-only";

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import clientPromise from "@/lib/mongodb";
import { decryptWithArcium } from "@/lib/arcium";

const PROOF_ARCIUM_PID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");
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

/**
 * GET /api/exam/status?examId=...&studentWallet=...
 *
 * Checks on-chain whether a student's session PDA exists (i.e. they have
 * already submitted takeExam). If so, also returns the correct answers from
 * MongoDB so the client can display the results without re-sending a tx.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get("examId");
    const studentWallet = searchParams.get("studentWallet");

    if (!examId || !studentWallet) {
      return NextResponse.json({ error: "Missing examId or studentWallet." }, { status: 400 });
    }

    // Derive session PDA: seeds = ["session", u64_le(examId), student_pubkey]
    const examIdBuf = Buffer.alloc(8);
    examIdBuf.writeBigUInt64LE(BigInt(examId));
    const [sessionPda] = await PublicKey.findProgramAddress(
      [Buffer.from("session"), examIdBuf, new PublicKey(studentWallet).toBuffer()],
      PROOF_ARCIUM_PID,
    );

    const connection = getConnection();
    const sessionInfo = await connection.getAccountInfo(sessionPda);

    if (sessionInfo === null) {
      // Session PDA does not exist — student has not taken this exam yet
      return NextResponse.json({ completed: false });
    }

    // Parse ExamSession Borsh data to extract score, correctness, answers, and completed flag.
    // Layout: discriminator(8) + exam_id(8) + course_id(8) + student(32) +
    //         answers vec<u8>(4+len) + score(u16=2) + correctness_mask(u32=4) +
    //         correctness vec<bool>(4+len) + completed(bool=1) + ...
    const data = sessionInfo.data;
    let sessionScore: number | null = null;
    let totalQuestions = 0;
    let submittedAnswers: number[] | null = null;
    let sessionCompleted = false;

    try {
      let offset = 8 + 8 + 8 + 32; // discriminator + exam_id + course_id + student
      const answersLen = data.readUInt32LE(offset);
      offset += 4;
      submittedAnswers = Array.from(data.slice(offset, offset + answersLen));
      totalQuestions = answersLen;
      offset += answersLen;
      sessionScore = data.readUInt16LE(offset);
      offset += 2;
      // correctness_mask(4)
      offset += 4;
      const correctnessLen = data.readUInt32LE(offset);
      offset += 4 + correctnessLen;
      sessionCompleted = data[offset] === 1;
    } catch {
      // Parsing failed — session exists but data is unreadable
    }

    // Once a session exists, the student has submitted. Return the stored
    // answers and score data so the UI can show their past result even if
    // the Arcium callback is still pending.
    const client = await clientPromise;
    const doc = await client.db(DB_NAME).collection(COLLECTION).findOne({ examId });

    let correctAnswers: number[] = [];

    if (doc?.answersEncrypted) {
      const enc = doc.answersEncrypted as {
        ciphertext: number[][];
        clientSecretKeyHex: string;
        nonceHex: string;
      };
      correctAnswers = decryptWithArcium(enc.ciphertext, enc.clientSecretKeyHex, enc.nonceHex);
    }

    const fallbackScore =
      submittedAnswers && correctAnswers.length > 0
        ? correctAnswers.reduce(
            (score, correctAnswer, index) => score + (submittedAnswers[index] === correctAnswer ? 1 : 0),
            0,
          )
        : 0;

    return NextResponse.json({
      completed: sessionCompleted,
      correctAnswers,
      totalQuestions,
      pending: !sessionCompleted,
      score: sessionCompleted ? sessionScore : fallbackScore,
      submittedAnswers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check exam status." },
      { status: 500 },
    );
  }
}
