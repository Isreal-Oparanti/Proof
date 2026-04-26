import "server-only";

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import clientPromise from "@/lib/mongodb";
import { decryptWithArcium } from "@/lib/arcium";

const DB_NAME = "proof_arcium";
const COLLECTION = "exam_content";
let _connection: Connection | null = null;
function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    _connection = new Connection(rpcUrl, "confirmed");
  }
  return _connection;
}

const PROGRAM_ID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");
const SESSION_SEED = "session";

async function deriveSessionPda(examId: string, studentWallet: string) {
  const examIdBuf = Buffer.alloc(8);
  examIdBuf.writeBigUInt64LE(BigInt(examId));
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from(SESSION_SEED), examIdBuf, new PublicKey(studentWallet).toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

/**
 * Parse ExamSession Borsh bytes to extract whether the session is completed.
 *
 * Layout (Borsh):
 *   discriminator(8) + exam_id(u64=8) + course_id(u64=8) + student(pubkey=32) +
 *   answers(vec<u8>: 4+len) + score(u16=2) + correctness_mask(u32=4) +
 *   correctness(vec<bool>: 4+len) + completed(bool=1) + ...
 */
function parseSessionCompleted(data: Buffer): boolean {
  let offset = 8 + 8 + 8 + 32; // discriminator + exam_id + course_id + student
  if (data.length < offset + 4) return false;

  // answers vec
  const answersLen = data.readUInt32LE(offset);
  offset += 4 + answersLen;

  // score(2) + correctness_mask(4)
  offset += 2 + 4;

  // correctness vec<bool>
  if (data.length < offset + 4) return false;
  const correctnessLen = data.readUInt32LE(offset);
  offset += 4 + correctnessLen;

  // completed bool
  if (data.length <= offset) return false;
  return data[offset] === 1;
}

async function isSessionCompleted(examId: string, studentWallet: string) {
  const pda = await deriveSessionPda(examId, studentWallet);
  const info = await getConnection().getAccountInfo(pda);
  if (!info?.data) return false;
  return parseSessionCompleted(info.data);
}

// GET /api/exam/answers?examId=<id>&studentWallet=<address>
// Returns the correct answers (as indices 0–3) only after the student's
// session.completed = true on-chain (i.e. after Arcium has graded their submission).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get("examId");
    const studentWallet = searchParams.get("studentWallet");

    if (!examId || !studentWallet) {
      return NextResponse.json({ error: "Missing examId or studentWallet." }, { status: 400 });
    }

    const completed = await isSessionCompleted(examId, studentWallet);
    if (!completed) {
      return NextResponse.json(
        { error: "Exam not yet graded. Submit your answers first." },
        { status: 403 },
      );
    }

    const client = await clientPromise;
    const collection = client.db(DB_NAME).collection(COLLECTION);
    const doc = await collection.findOne(
      { examId },
      { projection: { _id: 0, answersEncrypted: 1 } },
    );

    if (!doc?.answersEncrypted) {
      return NextResponse.json({ error: "Exam answer data not found." }, { status: 404 });
    }

    type EncryptedBlob = { ciphertext: number[][]; clientSecretKeyHex: string; nonceHex: string };
    const blob = doc.answersEncrypted as EncryptedBlob;
    const correctAnswers = decryptWithArcium(blob.ciphertext, blob.clientSecretKeyHex, blob.nonceHex);

    return NextResponse.json({ correctAnswers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch exam answers." },
      { status: 500 },
    );
  }
}
