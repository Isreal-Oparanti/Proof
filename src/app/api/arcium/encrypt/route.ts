import { NextResponse } from "next/server";
import { encryptWithArcium, getArciumServerStatus } from "@/lib/arcium";

type EncryptRequestBody = {
  values?: number[];
};

export async function GET() {
  return NextResponse.json(getArciumServerStatus());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EncryptRequestBody;
    const values = Array.isArray(body.values) ? body.values : [7, 21];

    // Never expose clientSecretKeyHex to the browser — strip it before returning.
    const { clientSecretKeyHex: _secret, ...safeResult } = encryptWithArcium(values);
    return NextResponse.json(safeResult);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Arcium encryption failed.",
      },
      { status: 400 },
    );
  }
}
