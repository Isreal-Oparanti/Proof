import "server-only";

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { decodeExamAccount, coerceAccountDataBytes } from "@/lib/proofArcium";

const PROOF_ARCIUM_PID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");

// sha256("account:Exam")[0..8] encoded as base58 = [217,124,206,150,202,222,128,5]
const EXAM_DISCRIMINATOR_BASE58 = "dNuHUrhvep4";

let _connection: Connection | null = null;
function getConnection() {
  if (!_connection) {
    _connection = new Connection(
      "https://api.devnet.solana.com",
      "confirmed",
    );
  }
  return _connection;
}

/**
 * GET /api/proof/exams
 * Returns all on-chain exam accounts decoded as JSON.
 */
export async function GET() {
  try {
    const connection = getConnection();

    const accounts = await connection.getProgramAccounts(PROOF_ARCIUM_PID, {
      filters: [{ memcmp: { offset: 0, bytes: EXAM_DISCRIMINATOR_BASE58 } }],
      encoding: "base64",
    });

    const exams = accounts.flatMap(({ pubkey, account }) => {
      try {
        const bytes = coerceAccountDataBytes(account.data);
        if (!bytes) return [];
        const decoded = decodeExamAccount(bytes);
        return [{
          address: pubkey.toBase58(),
          bump: decoded.bump,
          courseId: decoded.courseId.toString(),
          examId: decoded.examId.toString(),
          questionCount: decoded.questionCount,
          title: decoded.title,
          tutor: decoded.tutor,
        }];
      } catch {
        return [];
      }
    });

    return NextResponse.json({ exams });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch exams." },
      { status: 500 },
    );
  }
}
