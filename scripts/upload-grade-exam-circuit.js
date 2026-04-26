#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { getArciumProgram, getCompDefAccAddress, getCircuitState, uploadCircuit } = require("@arcium-hq/client");

const PROOF_ARCIUM_PROGRAM_ID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");
const MXE_AUTHORITY = new PublicKey("HbLHMchM3PvvPFBFD8c2ARVZTVCurrc8cRm1M6cqWiXP");
const GRADE_EXAM_COMP_DEF_OFFSET = 2545603068;
const CIRCUIT_NAME = "grade_exam";
const DEFAULT_CIRCUIT_PATH = "/home/bambo/proof_arcium/build/grade_exam.arcis";

function readKeypair() {
  const keypairPath =
    process.env.SOLANA_KEYPAIR ||
    path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return { keypair: Keypair.fromSecretKey(Uint8Array.from(secret)), keypairPath };
}

function makeProvider(connection, keypair) {
  const wallet = new anchor.Wallet(keypair);
  return new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

async function main() {
  const shouldSend = process.argv.includes("--send");
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const circuitPath = process.env.GRADE_EXAM_CIRCUIT_PATH || DEFAULT_CIRCUIT_PATH;
  const rawCircuit = fs.readFileSync(circuitPath);
  const { keypair, keypairPath } = readKeypair();
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = makeProvider(connection, keypair);
  const arciumProgram = getArciumProgram(provider);
  const compDefAccount = getCompDefAccAddress(PROOF_ARCIUM_PROGRAM_ID, GRADE_EXAM_COMP_DEF_OFFSET);

  console.log("Proof Arcium grade_exam circuit upload/finalize");
  console.log("RPC:", rpcUrl);
  console.log("Keypair:", keypairPath);
  console.log("Signer:", keypair.publicKey.toBase58());
  console.log("Expected MXE authority:", MXE_AUTHORITY.toBase58());
  console.log("Circuit path:", circuitPath);
  console.log("Circuit bytes:", rawCircuit.length);
  console.log("Comp-def account:", compDefAccount.toBase58());

  if (!keypair.publicKey.equals(MXE_AUTHORITY)) {
    throw new Error("This keypair is not the MXE authority. Refusing to upload/finalize.");
  }

  const account = await arciumProgram.account.computationDefinitionAccount.fetch(compDefAccount);
  const state = getCircuitState(account.circuitSource);
  console.log("Current circuit state:", state);

  if (state === "Onchain" || state === "OnchainFinalized") {
    console.log("Circuit already uploaded and finalized. No transaction needed.");
    return;
  }

  if (state !== "OnchainPending") {
    throw new Error(`Unexpected circuit state: ${state}`);
  }

  if (!shouldSend) {
    console.log("Dry run only. Re-run with --send to upload raw circuit accounts and finalize.");
    return;
  }

  const signatures = await uploadCircuit(
    provider,
    CIRCUIT_NAME,
    PROOF_ARCIUM_PROGRAM_ID,
    rawCircuit,
    true,
    500,
    { commitment: "confirmed" },
  );
  console.log("Uploaded/finalized grade_exam circuit.");
  signatures.forEach((signature, index) => console.log(`Signature ${index + 1}: ${signature}`));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
