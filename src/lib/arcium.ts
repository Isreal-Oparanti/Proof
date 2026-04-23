import "server-only";

import { RescueCipher, getArciumEnv, x25519 } from "@arcium-hq/client";
import { randomBytes } from "node:crypto";

const MXE_PUBLIC_KEY_HEX = process.env.ARCIUM_MXE_PUBLIC_KEY_HEX;

type ArciumMode = "configured" | "demo";

export type ArciumServerStatus = {
  arciumAvailable: true;
  backupClusterOffset: number | null;
  clusterOffset: number | null;
  hasMxePublicKey: boolean;
  mode: ArciumMode;
};

export type ArciumEncryptionResult = ArciumServerStatus & {
  ciphertext: number[][];
  clientPublicKeyHex: string;
  mxePublicKeyHex: string;
  nonceHex: string;
  plaintext: string[];
};

export function getArciumServerStatus(): ArciumServerStatus {
  try {
    const env = getArciumEnv();

    return {
      arciumAvailable: true,
      backupClusterOffset: Number.isNaN(env.arciumBackupClusterOffset)
        ? null
        : env.arciumBackupClusterOffset,
      clusterOffset: env.arciumClusterOffset,
      hasMxePublicKey: Boolean(MXE_PUBLIC_KEY_HEX),
      mode: MXE_PUBLIC_KEY_HEX ? "configured" : "demo",
    };
  } catch {
    return {
      arciumAvailable: true,
      backupClusterOffset: null,
      clusterOffset: null,
      hasMxePublicKey: Boolean(MXE_PUBLIC_KEY_HEX),
      mode: MXE_PUBLIC_KEY_HEX ? "configured" : "demo",
    };
  }
}

export function encryptWithArcium(values: number[]): ArciumEncryptionResult {
  const normalizedValues = values.map(normalizeFieldValue);
  const clientSecretKey = x25519.utils.randomSecretKey();
  const clientPublicKey = x25519.getPublicKey(clientSecretKey);
  const mxePublicKey = resolveMxePublicKey();
  const sharedSecret = x25519.getSharedSecret(clientSecretKey, mxePublicKey);
  const nonce = randomBytes(16);
  const cipher = new RescueCipher(sharedSecret);
  const ciphertext = cipher.encrypt(normalizedValues.map((value) => BigInt(value)), nonce);
  const status = getArciumServerStatus();

  return {
    ...status,
    ciphertext,
    clientPublicKeyHex: toHex(clientPublicKey),
    mxePublicKeyHex: toHex(mxePublicKey),
    nonceHex: toHex(nonce),
    plaintext: normalizedValues.map(String),
  };
}

function resolveMxePublicKey() {
  if (MXE_PUBLIC_KEY_HEX) {
    return parseHexKey(MXE_PUBLIC_KEY_HEX);
  }

  const demoSecretKey = x25519.utils.randomSecretKey();
  return x25519.getPublicKey(demoSecretKey);
}

function normalizeFieldValue(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error("Arcium demo values must be integers between 0 and 255.");
  }

  return value;
}

function parseHexKey(value: string) {
  const normalized = value.trim().replace(/^0x/, "");

  if (normalized.length !== 64 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error("ARCIUM_MXE_PUBLIC_KEY_HEX must be a 32-byte hex string.");
  }

  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

function toHex(value: Uint8Array | number[]) {
  return Buffer.from(value).toString("hex");
}
