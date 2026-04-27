#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const {
  getArciumProgram,
  getCompDefAccAddress,
  getCircuitState,
  getRawCircuitAccAddress,
} = require("@arcium-hq/client");

const PROOF_ARCIUM_PROGRAM_ID = new PublicKey("Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh");
const MXE_AUTHORITY = new PublicKey("HbLHMchM3PvvPFBFD8c2ARVZTVCurrc8cRm1M6cqWiXP");
const GRADE_EXAM_COMP_DEF_OFFSET = 937725067;
const CIRCUIT_NAME = "grade_exam_v4";
const DEFAULT_CIRCUIT_PATH = "/home/bambo/proof_arcium/build/grade_exam_v4.arcis";
const MAX_REALLOC_PER_IX = 10_240;
const MAX_UPLOAD_PER_TX_BYTES = 814;
const MAX_EMBIGGEN_IX_PER_TX = 18;
const RAW_ACCOUNT_HEADER_BYTES = 9;
const UPLOAD_CHUNK_SIZE = Number(process.env.ARCIUM_UPLOAD_CHUNK_SIZE ?? "2");
const UPLOAD_CHUNK_DELAY_MS = Number(process.env.ARCIUM_UPLOAD_CHUNK_DELAY_MS ?? "1000");

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendTx(provider, tx) {
  tx.feePayer = provider.publicKey;
  const blockhash = await provider.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash.blockhash;
  tx.lastValidBlockHeight = blockhash.lastValidBlockHeight;
  return provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
}

async function ensureRawCircuitAccount(provider, program, compDefAccount, rawCircuit) {
  const rawCircuitAccount = getRawCircuitAccAddress(compDefAccount, 0);
  let accountInfo = await provider.connection.getAccountInfo(rawCircuitAccount, "confirmed");

  if (accountInfo === null) {
    const signature = await program.methods
      .initRawCircuitAcc(GRADE_EXAM_COMP_DEF_OFFSET, PROOF_ARCIUM_PROGRAM_ID, 0)
      .accounts({ signer: provider.publicKey })
      .rpc({ commitment: "confirmed" });
    console.log("Initiated raw circuit acc with raw circuit index 0");
    console.log("Init signature:", signature);
    accountInfo = await provider.connection.getAccountInfo(rawCircuitAccount, "confirmed");
  }

  while (!accountInfo || accountInfo.data.length < rawCircuit.length + RAW_ACCOUNT_HEADER_BYTES) {
    const currentCircuitCapacity = Math.max(
      0,
      (accountInfo?.data.length ?? RAW_ACCOUNT_HEADER_BYTES) - RAW_ACCOUNT_HEADER_BYTES,
    );
    const remaining = rawCircuit.length - currentCircuitCapacity;
    const ixCount = Math.min(
      MAX_EMBIGGEN_IX_PER_TX,
      Math.ceil(remaining / MAX_REALLOC_PER_IX),
    );
    const tx = new anchor.web3.Transaction();
    for (let i = 0; i < ixCount; i += 1) {
      tx.add(
        await program.methods
          .embiggenRawCircuitAcc(GRADE_EXAM_COMP_DEF_OFFSET, PROOF_ARCIUM_PROGRAM_ID, 0)
          .accounts({ signer: provider.publicKey })
          .instruction(),
      );
    }
    console.log(
      `Resizing raw circuit account: ${currentCircuitCapacity}/${rawCircuit.length} bytes`,
    );
    const signature = await sendTx(provider, tx);
    console.log("Resize signature:", signature);
    accountInfo = await provider.connection.getAccountInfo(rawCircuitAccount, "confirmed");
  }

  return rawCircuitAccount;
}

async function uploadRawCircuit(provider, program, rawCircuit) {
  const txCount = Math.ceil(rawCircuit.length / MAX_UPLOAD_PER_TX_BYTES);

  for (let start = 0; start < txCount; start += UPLOAD_CHUNK_SIZE) {
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, txCount);
    console.log(`Uploading txs ${start + 1}-${end} of ${txCount}`);
    const promises = [];

    for (let txIndex = start; txIndex < end; txIndex += 1) {
      const offset = txIndex * MAX_UPLOAD_PER_TX_BYTES;
      const bytes = Buffer.alloc(MAX_UPLOAD_PER_TX_BYTES);
      rawCircuit.copy(bytes, 0, offset, Math.min(offset + MAX_UPLOAD_PER_TX_BYTES, rawCircuit.length));
      promises.push(
        program.methods
          .uploadCircuit(
            GRADE_EXAM_COMP_DEF_OFFSET,
            PROOF_ARCIUM_PROGRAM_ID,
            0,
            Array.from(bytes),
            offset,
          )
          .accounts({ signer: provider.publicKey })
          .rpc({ commitment: "confirmed" }),
      );
    }

    await Promise.all(promises);
    if (end < txCount && UPLOAD_CHUNK_DELAY_MS > 0) {
      await sleep(UPLOAD_CHUNK_DELAY_MS);
    }
  }
}

async function assertRawCircuitMatches(connection, rawCircuitAccount, rawCircuit) {
  const accountInfo = await connection.getAccountInfo(rawCircuitAccount, "confirmed");
  if (!accountInfo) {
    throw new Error("Raw circuit account is missing after upload.");
  }
  const uploaded = accountInfo.data.subarray(
    RAW_ACCOUNT_HEADER_BYTES,
    RAW_ACCOUNT_HEADER_BYTES + rawCircuit.length,
  );
  if (Buffer.compare(Buffer.from(uploaded), Buffer.from(rawCircuit)) !== 0) {
    throw new Error("Raw circuit account bytes do not match local circuit; refusing to finalize.");
  }
  console.log("Verified raw circuit bytes match local circuit.");
}

async function finalizeCompDef(provider, program) {
  const signature = await program.methods
    .finalizeComputationDefinition(GRADE_EXAM_COMP_DEF_OFFSET, PROOF_ARCIUM_PROGRAM_ID)
    .accounts({ signer: provider.publicKey })
    .rpc({ commitment: "confirmed" });
  console.log("Finalize signature:", signature);
  return signature;
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

  console.log("Proof Arcium grade_exam_v4 circuit upload/finalize");
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

  const rawCircuitAccount = await ensureRawCircuitAccount(
    provider,
    arciumProgram,
    compDefAccount,
    rawCircuit,
  );
  console.log("Raw circuit account:", rawCircuitAccount.toBase58());
  await uploadRawCircuit(provider, arciumProgram, rawCircuit);
  await assertRawCircuitMatches(connection, rawCircuitAccount, rawCircuit);
  const signatures = [await finalizeCompDef(provider, arciumProgram)];
  console.log("Uploaded/finalized grade_exam_v4 circuit.");
  signatures.forEach((signature, index) => console.log(`Signature ${index + 1}: ${signature}`));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
