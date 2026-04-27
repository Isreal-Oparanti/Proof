import "server-only";

import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const DB_NAME = "proof_arcium";
const COLLECTION = "exam_grades";

// POST /api/exam/grade-hash
// Body: { examId: string, studentWallet: string, txHash: string, score: number, completed: boolean }
export async function POST(request: Request) {
  try {
    const { examId, studentWallet, txHash, score, completed } = await request.json();
    if (!examId || !studentWallet || !txHash || typeof score !== "number" || typeof completed !== "boolean") {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const client = await clientPromise;
    const collection = client.db(DB_NAME).collection(COLLECTION);
    // Prevent duplicate: upsert by examId+studentWallet
    const result = await collection.findOneAndUpdate(
      { examId, studentWallet },
      { $set: { txHash, score, completed } },
      { upsert: true, returnDocument: "after" }
    );
    return NextResponse.json({
      examId,
      studentWallet,
      txHash: result.value?.txHash || txHash,
      score: result.value?.score || score,
      completed: result.value?.completed ?? completed,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save grade hash." }, { status: 500 });
  }
}

// GET /api/exam/grade-hash?examId=...&studentWallet=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get("examId");
    const studentWallet = searchParams.get("studentWallet");
    if (!examId || !studentWallet) {
      return NextResponse.json({ error: "Missing examId or studentWallet." }, { status: 400 });
    }
    const client = await clientPromise;
    const collection = client.db(DB_NAME).collection(COLLECTION);
    const doc = await collection.findOne({ examId, studentWallet });
    if (!doc) {
      return NextResponse.json({ error: "Grade hash not found." }, { status: 404 });
    }
    return NextResponse.json({
      examId,
      studentWallet,
      txHash: doc.txHash,
      score: doc.score,
      completed: doc.completed,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch grade hash." }, { status: 500 });
  }
}
