import "server-only";

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import clientPromise from "@/lib/mongodb";
import { encryptWithArcium, decryptWithArcium } from "@/lib/arcium";

const DB_NAME = "proof_arcium";
const COLLECTION = "exam_content";
// Lazily initialised so it picks up the env var at request time, not at module load.
let _connection: Connection | null = null;
function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    _connection = new Connection(rpcUrl, "confirmed");
  }
  return _connection;
}

const PROGRAM_ID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");
const EXAM_ACCESS_SEED = "exam-access";
const EXAM_SEED = "exam";
const ENROLLMENT_SEED = "enrollment";

async function deriveExamPda(examId: string) {
  const examIdBuf = Buffer.alloc(8);
  examIdBuf.writeBigUInt64LE(BigInt(examId));
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from(EXAM_SEED), examIdBuf],
    PROGRAM_ID,
  );
  return pda;
}

/**
 * Read the tutor pubkey and course_id from the on-chain Exam account.
 * Exam layout (Borsh):
 *   discriminator(8) + exam_id(8) + course_id(8) + tutor(32) + ...
 */
async function getExamInfo(examId: string): Promise<{ tutor: string; courseId: bigint } | null> {
  const pda = await deriveExamPda(examId);
  const info = await getConnection().getAccountInfo(pda);
  if (!info?.data || info.data.length < 8 + 8 + 8 + 32) return null;
  const courseId = info.data.readBigUInt64LE(8 + 8); // skip discriminator(8) + exam_id(8)
  const tutorBytes = info.data.slice(8 + 8 + 8, 8 + 8 + 8 + 32);
  return { tutor: new PublicKey(tutorBytes).toBase58(), courseId };
}

async function deriveEnrollmentPda(courseId: bigint, studentWallet: string) {
  const courseIdBuf = Buffer.alloc(8);
  courseIdBuf.writeBigUInt64LE(courseId);
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from(ENROLLMENT_SEED), courseIdBuf, new PublicKey(studentWallet).toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

/** Returns true if the student has an Enrollment account for the given course. */
async function isEnrolled(courseId: bigint, studentWallet: string): Promise<boolean> {
  const pda = await deriveEnrollmentPda(courseId, studentWallet);
  const info = await getConnection().getAccountInfo(new PublicKey(pda));
  return info !== null;
}

async function deriveExamAccessPda(examId: string, studentWallet: string) {
  const examIdBuf = Buffer.alloc(8);
  examIdBuf.writeBigUInt64LE(BigInt(examId));
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from(EXAM_ACCESS_SEED), examIdBuf, new PublicKey(studentWallet).toBuffer()],
    PROGRAM_ID,
  );
  return pda;
}

async function hasGrantedAccess(examId: string, studentWallet: string) {
  const pda = await deriveExamAccessPda(examId, studentWallet);
  const info = await getConnection().getAccountInfo(pda);
  if (!info?.data || info.data.length < 9) return false;
  // ExamAccess layout (Borsh):
  //   discriminator(8) + exam_id(8) + course_id(8) + student(32) +
  //   student_content_pubkey(32) + content_key_nonce(16) +
  //   encrypted_content_key vec (4 + len*32) + granted(1)
  // Parse dynamically to find granted.
  let offset = 8 + 8 + 8 + 32 + 32 + 16;
  if (info.data.length < offset + 4) return false;
  const vecLen = info.data.readUInt32LE(offset);
  offset += 4 + vecLen * 32;
  if (info.data.length <= offset) return false;
  return info.data[offset] === 1;
}

/** Encrypt arbitrary bytes with Arcium server-side, returns what must be stored. */
function arciumEncryptBytes(bytes: number[]) {
  const { ciphertext, clientSecretKeyHex, nonceHex } = encryptWithArcium(bytes);
  return { ciphertext, clientSecretKeyHex, nonceHex };
}

/** Decrypt back to bytes using stored secret. */
function arciumDecryptBytes(blob: { ciphertext: number[][]; clientSecretKeyHex: string; nonceHex: string }) {
  return decryptWithArcium(blob.ciphertext, blob.clientSecretKeyHex, blob.nonceHex);
}

type StoreContentBody = {
  correctAnswers: number[];
  examId: string;
  questions: { options: string[]; prompt: string }[];
  title: string;
};

// POST /api/exam/content — tutor stores exam content; server Arcium-encrypts it
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StoreContentBody;

    if (!body.examId || !body.title || !body.questions?.length || !body.correctAnswers?.length) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Encode the questions JSON to bytes and encrypt with Arcium
    const questionsJson = JSON.stringify({ title: body.title, questions: body.questions });
    const questionsBytes = Array.from(new TextEncoder().encode(questionsJson));
    const questionsEncrypted = arciumEncryptBytes(questionsBytes);

    // Encrypt the correct answers (0–3 per question)
    const answersEncrypted = arciumEncryptBytes(body.correctAnswers);

    const client = await clientPromise;
    const collection = client.db(DB_NAME).collection(COLLECTION);

    await collection.updateOne(
      { examId: body.examId },
      {
        $set: {
          examId: body.examId,
          // Arcium-encrypted blobs — clientSecretKeyHex stays server-side in MongoDB
          questionsEncrypted,
          answersEncrypted,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to store exam content." },
      { status: 500 },
    );
  }
}

// GET /api/exam/content?examId=<id>&wallet=<address>
// - If wallet is the tutor who created the exam → returns questions
// - If wallet has a granted ExamAccess on-chain → returns questions
// - If wallet is enrolled in the exam's course → returns questions
// - Otherwise → 403
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get("examId");
    const wallet = searchParams.get("wallet") ?? searchParams.get("studentWallet");

    if (!examId || !wallet) {
      return NextResponse.json({ error: "Missing examId or wallet." }, { status: 400 });
    }

    // Check if the requester is the tutor of this exam
    const examInfo = await getExamInfo(examId);
    const isTutor = examInfo?.tutor === wallet;

    if (!isTutor) {
      // Check for an explicitly granted ExamAccess account first
      const granted = await hasGrantedAccess(examId, wallet);
      if (!granted) {
        // Fallback: any student enrolled in the exam's course can access it
        const enrolled = examInfo ? await isEnrolled(examInfo.courseId, wallet) : false;
        if (!enrolled) {
          return NextResponse.json({ error: "Exam access not granted on-chain." }, { status: 403 });
        }
      }
    }

    const client = await clientPromise;
    const collection = client.db(DB_NAME).collection(COLLECTION);
    const doc = await collection.findOne(
      { examId },
      { projection: { _id: 0, questionsEncrypted: 1 } },
    );

    if (!doc?.questionsEncrypted) {
      return NextResponse.json({ error: "Exam content not found." }, { status: 404 });
    }

    // Decrypt server-side, send plaintext to the authorized requester
    const plainBytes = arciumDecryptBytes(doc.questionsEncrypted as Parameters<typeof arciumDecryptBytes>[0]);
    const content = JSON.parse(new TextDecoder().decode(Uint8Array.from(plainBytes))) as {
      title: string;
      questions: { options: string[]; prompt: string }[];
    };

    return NextResponse.json(content);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch exam content." },
      { status: 500 },
    );
  }
}
