import "server-only";

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { decodeCourseAccount, coerceAccountDataBytes } from "@/lib/proofArcium";

const PROOF_ARCIUM_PID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");

// sha256("account:Course")[0..8] encoded as base58 = [206,6,78,228,163,138,241,106]
const COURSE_DISCRIMINATOR_BASE58 = "bThS38FG2WV";

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
 * GET /api/proof/courses
 * Returns all on-chain course accounts decoded as JSON.
 */
export async function GET() {
  try {
    const connection = getConnection();

    const accounts = await connection.getProgramAccounts(PROOF_ARCIUM_PID, {
      filters: [{ memcmp: { offset: 0, bytes: COURSE_DISCRIMINATOR_BASE58 } }],
      encoding: "base64",
    });

    const courses = accounts.flatMap(({ pubkey, account }) => {
      try {
        const bytes = coerceAccountDataBytes(account.data);
        if (!bytes) return [];
        const decoded = decodeCourseAccount(bytes);
        return [{
          address: pubkey.toBase58(),
          active: decoded.active,
          bump: decoded.bump,
          courseId: decoded.courseId.toString(),
          title: decoded.title,
          tutor: decoded.tutor,
          tutorName: decoded.tutorName,
        }];
      } catch {
        return [];
      }
    });

    return NextResponse.json({ courses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch courses." },
      { status: 500 },
    );
  }
}
