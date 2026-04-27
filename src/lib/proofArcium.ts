import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/addresses";
import { AccountRole, type AccountLookupMeta, type Instruction } from "@solana/instructions";
import type { AddressLookupTableData } from "@solana/client";

export const PROOF_ARCIUM_PROGRAM_ID = address(
  "Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh",
);
export const MXE_LUT_ADDRESS = address(
  "7gMNVZmDWoWBGHGpdAY1BTYwQgmk73i5o5No93JbMdFr",
);
export const ARCIUM_PROGRAM_ID = address(
  "Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ",
);
export const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");
export const LUT_PROGRAM_ID = address("AddressLookupTab1e1111111111111111111111111");
export const INSTRUCTIONS_SYSVAR_ID = address(
  "Sysvar1nstructions1111111111111111111111111",
);
export const DEFAULT_POOL_ACCOUNT = address(
  "G2sRWJvi3xoyh5k2gY49eG9L8YhAEWQPtNb1zb1GXTtC",
);
export const DEFAULT_CLOCK_ACCOUNT = address(
  "7EbMUTLo5DjdzbN7s8BXeZwXzEwNQb1hScfRvWg8a6ot",
);

const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

const DISCRIMINATORS = {
  createCourse: [120, 121, 154, 164, 107, 180, 167, 241],
  createExam: [247, 135, 105, 245, 128, 52, 23, 97],
  enrollInCourse: [148, 151, 118, 109, 223, 161, 90, 172],
  gradeExamCallback: [29, 57, 229, 201, 184, 48, 63, 94],
  grantExamAccess: [103, 92, 89, 218, 130, 27, 234, 51],
  initGradeExamCompDef: [51, 24, 232, 80, 93, 173, 182, 104],
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  registerUser: [2, 241, 150, 223, 99, 214, 116, 97],
  requestExamAccess: [110, 216, 183, 14, 196, 178, 175, 138],
  takeExam: [23, 26, 175, 45, 43, 91, 213, 125],
} as const;

const ACCOUNT_DISCRIMINATORS = {
  course: [206, 6, 78, 228, 163, 138, 241, 106],
  exam: [217, 124, 206, 150, 202, 222, 128, 5],
  globalConfig: [149, 8, 156, 202, 160, 252, 176, 217],
  user: [159, 117, 95, 227, 239, 151, 58, 236],
} as const;

const SEEDS = {
  arciumSigner: "ArciumSignerAccount",
  course: "course",
  enrollment: "enrollment",
  exam: "exam",
  examAccess: "exam-access",
  globalConfig: "global-config",
  session: "session",
  user: "user",
} as const;

export type ProofArciumRole = "tutor" | "student";

export type ProofUserAccount = {
  authority: string;
  name: string;
  role: ProofArciumRole;
};

export type ProofGlobalConfigAccount = {
  authority: string;
  bump: number;
  courseCounter: bigint;
  examCounter: bigint;
};

export type ProofCourseAccount = {
  active: boolean;
  bump: number;
  courseId: bigint;
  title: string;
  tutor: string;
  tutorName: string;
};

export type ProofExamAccount = {
  bump: number;
  courseId: bigint;
  examId: bigint;
  questionCount: number;
  title: string;
  tutor: string;
};

export type FixedBytes32 = readonly number[] | Uint8Array;

export type EncryptedContentKeyInput = {
  nonce: bigint | number | string;
  ciphertexts: readonly FixedBytes32[];
};

export type EncryptedExamInput = {
  answerKeyCiphertexts: readonly FixedBytes32[];
  answerKeyNonce: bigint | number | string;
  contentCiphertexts: readonly FixedBytes32[];
  contentNonce: bigint | number | string;
  contentPubkey: FixedBytes32;
};

export type TakeExamAccounts = {
  clusterAccount: Address;
  compDefAccount: Address;
  computationAccount: Address;
  executingPool: Address;
  mempoolAccount: Address;
  mxeAccount: Address;
  poolAccount?: Address;
  clockAccount?: Address;
};

export type InitGradeExamCompDefAccounts = {
  addressLookupTable: Address;
  compDefAccount: Address;
  mxeAccount: Address;
  payer: Address;
};

export type GradeExamCallbackAccounts = {
  clusterAccount: Address;
  compDefAccount: Address;
  computationAccount: Address;
  mxeAccount: Address;
  session: Address;
};

export type GradeExamCallbackOutput = {
  kind: "success";
  score: number;
  correctnessMask: number;
  signature: FixedBytes32;
} | {
  kind: "failure";
};

type InstructionAccount = {
  address: Address;
  role: AccountRole;
} | AccountLookupMeta;

function lookupAccount(
  addr: Address,
  role: AccountRole.READONLY | AccountRole.WRITABLE,
  lut: { address: Address; data: AddressLookupTableData } | undefined,
): InstructionAccount {
  if (lut) {
    const idx = lut.data.addresses.indexOf(addr);
    if (idx !== -1) {
      return { address: addr, addressIndex: idx, lookupTableAddress: lut.address, role };
    }
  }
  return { address: addr, role };
}

function concatBytes(...parts: readonly Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

function encodeU8(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error("Expected a u8-compatible integer.");
  }

  return Uint8Array.of(value);
}

function encodeU32(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("Expected a u32-compatible integer.");
  }

  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value, true);
  return bytes;
}

function coerceBigInt(value: bigint | number | string) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("Expected an integer-compatible numeric value.");
    }

    return BigInt(value);
  }

  return BigInt(value);
}

function encodeUnsigned(value: bigint | number | string, byteLength: number) {
  const normalized = coerceBigInt(value);
  const max = BigInt(1) << BigInt(byteLength * 8);

  if (normalized < BigInt(0) || normalized >= max) {
    throw new Error(`Value does not fit in ${byteLength * 8} bits.`);
  }

  const bytes = new Uint8Array(byteLength);
  let cursor = normalized;

  for (let index = 0; index < byteLength; index += 1) {
    bytes[index] = Number(cursor & BigInt(0xff));
    cursor >>= BigInt(8);
  }

  return bytes;
}

function encodeU64(value: bigint | number | string) {
  return encodeUnsigned(value, 8);
}

function encodeU128(value: bigint | number | string) {
  return encodeUnsigned(value, 16);
}

function encodeString(value: string) {
  const bytes = new TextEncoder().encode(value);
  return concatBytes(encodeU32(bytes.length), bytes);
}

function normalizeFixed32(value: FixedBytes32) {
  const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);

  if (bytes.length !== 32) {
    throw new Error("Expected a 32-byte value.");
  }

  return bytes;
}

function normalizeFixed64(value: FixedBytes32) {
  const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);

  if (bytes.length !== 64) {
    throw new Error("Expected a 64-byte value.");
  }

  return bytes;
}

function encodeVecOfFixed32(values: readonly FixedBytes32[]) {
  return concatBytes(
    encodeU32(values.length),
    ...values.map((value) => normalizeFixed32(value)),
  );
}

function encodeByteArray(bytes: Uint8Array) {
  return concatBytes(encodeU32(bytes.length), bytes);
}

function encodeRole(role: ProofArciumRole) {
  return encodeU8(role === "tutor" ? 0 : 1);
}

function decodeBase64Bytes(value: string): Uint8Array | null {
  if (typeof globalThis.atob === "function") {
    const decoded = globalThis.atob(value);
    return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  }

  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }

  return null;
}

export function coerceAccountDataBytes(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (Array.isArray(data) && data.every((value) => typeof value === "number")) {
    return Uint8Array.from(data);
  }

  if (data && typeof data === "object") {
    if (
      "data" in data &&
      Array.isArray(data.data) &&
      data.data.length >= 2 &&
      typeof data.data[0] === "string" &&
      data.data[1] === "base64"
    ) {
      return decodeBase64Bytes(data.data[0]);
    }

    const values = Object.values(data);
    if (values.length > 0 && values.every((value) => typeof value === "number")) {
      return Uint8Array.from(values);
    }
  }

  return null;
}

export function decodeUserAccount(data: Uint8Array | readonly number[]): ProofUserAccount {
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const discriminator = Uint8Array.from(ACCOUNT_DISCRIMINATORS.user);

  if (bytes.length < 8 + 32 + 4 + 1) {
    throw new Error("User account data is too short.");
  }

  for (let index = 0; index < discriminator.length; index += 1) {
    if (bytes[index] !== discriminator[index]) {
      throw new Error("Invalid user account discriminator.");
    }
  }

  let offset = 8;
  const authority = addressDecoder.decode(bytes.slice(offset, offset + 32));
  offset += 32;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLength = view.getUint32(offset, true);
  offset += 4;

  if (offset + nameLength + 1 > bytes.length) {
    throw new Error("User account name length is out of bounds.");
  }

  const nameBytes = bytes.slice(offset, offset + nameLength);
  offset += nameLength;

  const roleByte = bytes[offset];
  const role: ProofArciumRole = roleByte === 0 ? "tutor" : "student";

  return {
    authority,
    name: new TextDecoder().decode(nameBytes),
    role,
  };
}

export function decodeGlobalConfigAccount(
  data: Uint8Array | readonly number[],
): ProofGlobalConfigAccount {
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const discriminator = Uint8Array.from(ACCOUNT_DISCRIMINATORS.globalConfig);

  if (bytes.length < 8 + 32 + 8 + 8 + 1) {
    throw new Error("Global config account data is too short.");
  }

  for (let index = 0; index < discriminator.length; index += 1) {
    if (bytes[index] !== discriminator[index]) {
      throw new Error("Invalid global config account discriminator.");
    }
  }

  let offset = 8;
  const authority = addressDecoder.decode(bytes.slice(offset, offset + 32));
  offset += 32;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const courseCounter = view.getBigUint64(offset, true);
  offset += 8;
  const examCounter = view.getBigUint64(offset, true);
  offset += 8;
  const bump = bytes[offset];

  return {
    authority,
    bump,
    courseCounter,
    examCounter,
  };
}

export function decodeCourseAccount(data: Uint8Array | readonly number[]): ProofCourseAccount {
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const discriminator = Uint8Array.from(ACCOUNT_DISCRIMINATORS.course);

  if (bytes.length < 8 + 8 + 32 + 4) {
    throw new Error("Course account data is too short.");
  }

  for (let index = 0; index < discriminator.length; index += 1) {
    if (bytes[index] !== discriminator[index]) {
      throw new Error("Invalid course account discriminator.");
    }
  }

  let offset = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const courseId = view.getBigUint64(offset, true);
  offset += 8;

  const titleLength = view.getUint32(offset, true);
  offset += 4;

  if (offset + titleLength + 32 + 4 + 1 + 1 > bytes.length) {
    throw new Error("Course account title length is out of bounds.");
  }

  const titleBytes = bytes.slice(offset, offset + titleLength);
  offset += titleLength;

  const tutor = addressDecoder.decode(bytes.slice(offset, offset + 32));
  offset += 32;

  const tutorNameLength = view.getUint32(offset, true);
  offset += 4;

  if (offset + tutorNameLength + 1 + 1 > bytes.length) {
    throw new Error("Course account tutor name length is out of bounds.");
  }

  const tutorNameBytes = bytes.slice(offset, offset + tutorNameLength);
  offset += tutorNameLength;

  const active = bytes[offset] === 1;
  offset += 1;
  const bump = bytes[offset];

  return {
    active,
    bump,
    courseId,
    title: new TextDecoder().decode(titleBytes),
    tutor,
    tutorName: new TextDecoder().decode(tutorNameBytes),
  };
}

export function decodeExamAccount(data: Uint8Array | readonly number[]): ProofExamAccount {
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const discriminator = Uint8Array.from(ACCOUNT_DISCRIMINATORS.exam);

  if (bytes.length < 8 + 8 + 8 + 32 + 4 + 1) {
    throw new Error("Exam account data is too short.");
  }

  for (let index = 0; index < discriminator.length; index += 1) {
    if (bytes[index] !== discriminator[index]) {
      throw new Error("Invalid exam account discriminator.");
    }
  }

  let offset = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const examId = view.getBigUint64(offset, true);
  offset += 8;
  const courseId = view.getBigUint64(offset, true);
  offset += 8;
  const tutor = addressDecoder.decode(bytes.slice(offset, offset + 32));
  offset += 32;

  const titleLength = view.getUint32(offset, true);
  offset += 4;

  if (offset + titleLength + 1 > bytes.length) {
    throw new Error("Exam account title length is out of bounds.");
  }

  const titleBytes = bytes.slice(offset, offset + titleLength);
  offset += titleLength;

  const questionCount = bytes[offset];
  const bump = bytes[bytes.length - 1];

  return {
    bump,
    courseId,
    examId,
    questionCount,
    title: new TextDecoder().decode(titleBytes),
    tutor,
  };
}

function encodeEncryptedContentKeyInput(value: EncryptedContentKeyInput) {
  return concatBytes(
    encodeU128(value.nonce),
    encodeVecOfFixed32(value.ciphertexts),
  );
}

function encodeEncryptedExamInput(value: EncryptedExamInput) {
  return concatBytes(
    normalizeFixed32(value.contentPubkey),
    encodeU128(value.contentNonce),
    encodeVecOfFixed32(value.contentCiphertexts),
    encodeU128(value.answerKeyNonce),
    encodeVecOfFixed32(value.answerKeyCiphertexts),
  );
}

function encodeGradeExamCallbackOutput(value: GradeExamCallbackOutput) {
  if (value.kind === "failure") {
    return encodeU8(1);
  }

  return concatBytes(
    encodeU8(0),
    encodeU16(value.score),
    encodeU32(value.correctnessMask),
    normalizeFixed64(value.signature),
  );
}

function encodeU16(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("Expected a u16-compatible integer.");
  }

  const bytes = new Uint8Array(2);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, value, true);
  return bytes;
}

function buildInstruction(
  discriminator: readonly number[],
  accounts: readonly InstructionAccount[],
  dataParts: readonly Uint8Array[],
): Instruction {
  return {
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    accounts,
    data: concatBytes(Uint8Array.from(discriminator), ...dataParts),
  };
}

function account(addressValue: Address, role: AccountRole): InstructionAccount {
  return { address: addressValue, role };
}

function encodeAddressSeed(value: Address) {
  return addressEncoder.encode(value);
}

function toAddress(value: Address | string) {
  return typeof value === "string" ? address(value) : value;
}

export async function findUserPda(authority: Address | string) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    seeds: [SEEDS.user, encodeAddressSeed(toAddress(authority))],
  });
  return pda;
}

export async function findGlobalConfigPda() {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    seeds: [SEEDS.globalConfig],
  });
  return pda;
}

export async function findCoursePda(courseId: bigint | number | string) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    seeds: [SEEDS.course, encodeU64(courseId)],
  });
  return pda;
}

export async function findExamPda(examId: bigint | number | string) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    seeds: [SEEDS.exam, encodeU64(examId)],
  });
  return pda;
}

export async function findEnrollmentPda(
  courseId: bigint | number | string,
  student: Address | string,
) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    seeds: [
      SEEDS.enrollment,
      encodeU64(courseId),
      encodeAddressSeed(toAddress(student)),
    ],
  });
  return pda;
}

export async function findExamAccessPda(
  examId: bigint | number | string,
  student: Address | string,
) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    seeds: [
      SEEDS.examAccess,
      encodeU64(examId),
      encodeAddressSeed(toAddress(student)),
    ],
  });
  return pda;
}

export async function findSessionPda(
  examId: bigint | number | string,
  student: Address | string,
) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    seeds: [
      SEEDS.session,
      encodeU64(examId),
      encodeAddressSeed(toAddress(student)),
    ],
  });
  return pda;
}

export async function findArciumSignerPda() {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROOF_ARCIUM_PROGRAM_ID,
    seeds: [SEEDS.arciumSigner],
  });
  return pda;
}

export async function buildInitializeInstruction(authority: Address | string) {
  const authorityAddress = toAddress(authority);
  const globalConfig = await findGlobalConfigPda();

  return buildInstruction(DISCRIMINATORS.initialize, [
    account(authorityAddress, AccountRole.WRITABLE_SIGNER),
    account(globalConfig, AccountRole.WRITABLE),
    account(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
  ], []);
}

export async function buildRegisterUserInstruction(
  authority: Address | string,
  args: {
    name: string;
    role: ProofArciumRole;
  },
) {
  const authorityAddress = toAddress(authority);
  const user = await findUserPda(authorityAddress);

  return buildInstruction(DISCRIMINATORS.registerUser, [
    account(authorityAddress, AccountRole.WRITABLE_SIGNER),
    account(user, AccountRole.WRITABLE),
    account(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
  ], [
    encodeString(args.name),
    encodeRole(args.role),
  ]);
}

export async function buildCreateCourseInstruction(
  tutor: Address | string,
  args: {
    courseId: bigint | number | string;
    title: string;
  },
) {
  const tutorAddress = toAddress(tutor);
  const tutorProfile = await findUserPda(tutorAddress);
  const globalConfig = await findGlobalConfigPda();
  const course = await findCoursePda(args.courseId);

  return buildInstruction(DISCRIMINATORS.createCourse, [
    account(tutorAddress, AccountRole.WRITABLE_SIGNER),
    account(tutorProfile, AccountRole.READONLY),
    account(globalConfig, AccountRole.WRITABLE),
    account(course, AccountRole.WRITABLE),
    account(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
  ], [
    encodeU64(args.courseId),
    encodeString(args.title),
  ]);
}

export async function buildCreateExamInstruction(
  tutor: Address | string,
  args: {
    courseId: bigint | number | string;
    encryptedExam: EncryptedExamInput;
    examId: bigint | number | string;
    questionCount: number;
    title: string;
  },
) {
  const tutorAddress = toAddress(tutor);
  const tutorProfile = await findUserPda(tutorAddress);
  const globalConfig = await findGlobalConfigPda();
  const course = await findCoursePda(args.courseId);
  const exam = await findExamPda(args.examId);

  return buildInstruction(DISCRIMINATORS.createExam, [
    account(tutorAddress, AccountRole.WRITABLE_SIGNER),
    account(tutorProfile, AccountRole.READONLY),
    account(globalConfig, AccountRole.WRITABLE),
    account(course, AccountRole.READONLY),
    account(exam, AccountRole.WRITABLE),
    account(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
  ], [
    encodeU64(args.examId),
    encodeString(args.title),
    encodeU8(args.questionCount),
    encodeEncryptedExamInput(args.encryptedExam),
  ]);
}

export async function buildEnrollInCourseInstruction(
  student: Address | string,
  args: {
    courseId: bigint | number | string;
  },
) {
  const studentAddress = toAddress(student);
  const studentProfile = await findUserPda(studentAddress);
  const course = await findCoursePda(args.courseId);
  const enrollment = await findEnrollmentPda(args.courseId, studentAddress);

  return buildInstruction(DISCRIMINATORS.enrollInCourse, [
    account(studentAddress, AccountRole.WRITABLE_SIGNER),
    account(studentProfile, AccountRole.READONLY),
    account(course, AccountRole.READONLY),
    account(enrollment, AccountRole.WRITABLE),
    account(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
  ], []);
}

export async function buildRequestExamAccessInstruction(
  student: Address | string,
  args: {
    courseId: bigint | number | string;
    examId: bigint | number | string;
    studentContentPubkey: FixedBytes32;
  },
) {
  const studentAddress = toAddress(student);
  const studentProfile = await findUserPda(studentAddress);
  const course = await findCoursePda(args.courseId);
  const enrollment = await findEnrollmentPda(args.courseId, studentAddress);
  const exam = await findExamPda(args.examId);
  const examAccess = await findExamAccessPda(args.examId, studentAddress);

  return buildInstruction(DISCRIMINATORS.requestExamAccess, [
    account(studentAddress, AccountRole.WRITABLE_SIGNER),
    account(studentProfile, AccountRole.READONLY),
    account(course, AccountRole.READONLY),
    account(enrollment, AccountRole.READONLY),
    account(exam, AccountRole.READONLY),
    account(examAccess, AccountRole.WRITABLE),
    account(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
  ], [normalizeFixed32(args.studentContentPubkey)]);
}

export async function buildGrantExamAccessInstruction(
  tutor: Address | string,
  args: {
    courseId: bigint | number | string;
    encryptedContentKey: EncryptedContentKeyInput;
    examId: bigint | number | string;
    student: Address | string;
  },
) {
  const tutorAddress = toAddress(tutor);
  const studentAddress = toAddress(args.student);
  const tutorProfile = await findUserPda(tutorAddress);
  const course = await findCoursePda(args.courseId);
  const exam = await findExamPda(args.examId);
  const enrollment = await findEnrollmentPda(args.courseId, studentAddress);
  const examAccess = await findExamAccessPda(args.examId, studentAddress);

  return buildInstruction(DISCRIMINATORS.grantExamAccess, [
    account(tutorAddress, AccountRole.WRITABLE_SIGNER),
    account(tutorProfile, AccountRole.READONLY),
    account(course, AccountRole.READONLY),
    account(exam, AccountRole.READONLY),
    account(enrollment, AccountRole.READONLY),
    account(examAccess, AccountRole.WRITABLE),
  ], [encodeEncryptedContentKeyInput(args.encryptedContentKey)]);
}

export async function buildInitGradeExamCompDefInstruction(
  args: InitGradeExamCompDefAccounts,
) {
  return buildInstruction(DISCRIMINATORS.initGradeExamCompDef, [
    account(args.payer, AccountRole.WRITABLE_SIGNER),
    account(args.mxeAccount, AccountRole.WRITABLE),
    account(args.compDefAccount, AccountRole.WRITABLE),
    account(args.addressLookupTable, AccountRole.WRITABLE),
    account(LUT_PROGRAM_ID, AccountRole.READONLY),
    account(ARCIUM_PROGRAM_ID, AccountRole.READONLY),
    account(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
  ], []);
}

export async function buildTakeExamInstruction(
  student: Address | string,
  args: {
    answers: Uint8Array | readonly number[];
    computationOffset: bigint | number | string;
    courseId: bigint | number | string;
    examId: bigint | number | string;
    takeExamAccounts: TakeExamAccounts;
  },
  lut?: AddressLookupTableData,
) {
  const lutCtx = lut ? { address: MXE_LUT_ADDRESS, data: lut } : undefined;
  const studentAddress = toAddress(student);
  const studentProfile = await findUserPda(studentAddress);
  const course = await findCoursePda(args.courseId);
  const enrollment = await findEnrollmentPda(args.courseId, studentAddress);
  const exam = await findExamPda(args.examId);
  const examAccess = await findExamAccessPda(args.examId, studentAddress);
  const session = await findSessionPda(args.examId, studentAddress);
  const signPdaAccount = await findArciumSignerPda();
  const answerBytes =
    args.answers instanceof Uint8Array ? args.answers : Uint8Array.from(args.answers);

  return buildInstruction(DISCRIMINATORS.takeExam, [
    account(studentAddress, AccountRole.WRITABLE_SIGNER),
    account(studentProfile, AccountRole.READONLY),
    account(course, AccountRole.READONLY),
    account(enrollment, AccountRole.READONLY),
    account(exam, AccountRole.READONLY),
    account(examAccess, AccountRole.READONLY),
    account(session, AccountRole.WRITABLE),
    account(signPdaAccount, AccountRole.WRITABLE),
    lookupAccount(args.takeExamAccounts.mxeAccount, AccountRole.READONLY, lutCtx),
    lookupAccount(args.takeExamAccounts.mempoolAccount, AccountRole.WRITABLE, lutCtx),
    lookupAccount(args.takeExamAccounts.executingPool, AccountRole.WRITABLE, lutCtx),
    lookupAccount(args.takeExamAccounts.computationAccount, AccountRole.WRITABLE, lutCtx),
    lookupAccount(args.takeExamAccounts.compDefAccount, AccountRole.READONLY, lutCtx),
    lookupAccount(args.takeExamAccounts.clusterAccount, AccountRole.WRITABLE, lutCtx),
    lookupAccount(args.takeExamAccounts.poolAccount ?? DEFAULT_POOL_ACCOUNT, AccountRole.WRITABLE, lutCtx),
    lookupAccount(args.takeExamAccounts.clockAccount ?? DEFAULT_CLOCK_ACCOUNT, AccountRole.WRITABLE, lutCtx),
    account(SYSTEM_PROGRAM_ID, AccountRole.READONLY),
    lookupAccount(ARCIUM_PROGRAM_ID, AccountRole.READONLY, lutCtx),
  ], [
    encodeU64(args.computationOffset),
    encodeByteArray(answerBytes),
  ]);
}

export function buildGradeExamCallbackInstruction(
  args: GradeExamCallbackAccounts & {
    output: GradeExamCallbackOutput;
  },
) {
  return buildInstruction(DISCRIMINATORS.gradeExamCallback, [
    account(ARCIUM_PROGRAM_ID, AccountRole.READONLY),
    account(args.compDefAccount, AccountRole.READONLY),
    account(args.mxeAccount, AccountRole.READONLY),
    account(args.computationAccount, AccountRole.READONLY),
    account(args.clusterAccount, AccountRole.READONLY),
    account(INSTRUCTIONS_SYSVAR_ID, AccountRole.READONLY),
    account(args.session, AccountRole.WRITABLE),
  ], [encodeGradeExamCallbackOutput(args.output)]);
}
