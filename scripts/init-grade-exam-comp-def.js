#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");

const PROOF_ARCIUM_PROGRAM_ID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");
const ARCIUM_PROGRAM_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const LUT_PROGRAM_ID = new PublicKey("AddressLookupTab1e1111111111111111111111111");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

const MXE_ACCOUNT = new PublicKey("D2kBu9GH7UAfhcNfphtYy1VPcSRKAiGpNYaVdr1HmxUE");
const MXE_AUTHORITY = new PublicKey("HbLHMchM3PvvPFBFD8c2ARVZTVCurrc8cRm1M6cqWiXP");
const GRADE_EXAM_COMP_DEF_ACCOUNT = new PublicKey("CH6pn78ozWgUYKduP8HvbzfZiRGCCFnRSb92AwnvtCfj");
const MXE_LUT_ACCOUNT = new PublicKey("7gMNVZmDWoWBGHGpdAY1BTYwQgmk73i5o5No93JbMdFr");

const INIT_GRADE_EXAM_COMP_DEF_DISCRIMINATOR = Buffer.from([
  51, 24, 232, 80, 93, 173, 182, 104,
]);

function readKeypair() {
  const keypairPath =
    process.env.SOLANA_KEYPAIR ||
    path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return { keypair: Keypair.fromSecretKey(Uint8Array.from(secret)), keypairPath };
}

function buildInstruction(payer) {
  return new TransactionInstruction({
    programId: PROOF_ARCIUM_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: MXE_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: GRADE_EXAM_COMP_DEF_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: MXE_LUT_ACCOUNT, isSigner: false, isWritable: true },
      { pubkey: LUT_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ARCIUM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: INIT_GRADE_EXAM_COMP_DEF_DISCRIMINATOR,
  });
}

async function main() {
  const shouldSend = process.argv.includes("--send");
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const { keypair, keypairPath } = readKeypair();

  console.log("Proof Arcium grade_exam_v4 comp-def init");
  console.log("RPC:", rpcUrl);
  console.log("Keypair:", keypairPath);
  console.log("Signer:", keypair.publicKey.toBase58());
  console.log("Expected MXE authority:", MXE_AUTHORITY.toBase58());
  console.log("Comp-def account:", GRADE_EXAM_COMP_DEF_ACCOUNT.toBase58());
  console.log("MXE account:", MXE_ACCOUNT.toBase58());
  console.log("MXE LUT:", MXE_LUT_ACCOUNT.toBase58());

  if (!keypair.publicKey.equals(MXE_AUTHORITY)) {
    throw new Error("This keypair is not the MXE authority. Refusing to send.");
  }

  const existing = await connection.getAccountInfo(GRADE_EXAM_COMP_DEF_ACCOUNT);
  if (existing) {
    console.log("Already initialized. No transaction needed.");
    return;
  }

  const transaction = new Transaction().add(buildInstruction(keypair.publicKey));
  transaction.feePayer = keypair.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;

  const simulation = await connection.simulateTransaction(transaction, [keypair]);
  console.log("Simulation result:", simulation.value.err ? "failed" : "ok");
  if (simulation.value.logs?.length) {
    console.log("Simulation logs:");
    simulation.value.logs.forEach((line, index) => console.log(`${index}: ${line}`));
  }

  if (simulation.value.err) {
    throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
  }

  if (!shouldSend) {
    console.log("Dry run only. Re-run with --send to sign and submit.");
    return;
  }

  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {
    commitment: "confirmed",
  });
  console.log("Initialized grade_exam_v4 comp-def.");
  console.log("Signature:", signature);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
