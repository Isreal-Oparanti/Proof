"use client";

import { Button, ConfigProvider, Divider, Drawer, Input, Select, Space, Typography } from "antd";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import toast from "react-hot-toast";
import { useProofArcium } from "@/hooks/useProofArcium";
import type { FixedBytes32 } from "@/lib/proofArcium";

const { Paragraph, Text, Title } = Typography;
const DRAWER_THEME_COLOR = "#253533";
const EXAM_TEMPLATE_TEXT = `Exam Title: Logic Pro Assessment

Question 1:
Prompt: What is the capital of France?
Option 1: Berlin
Option 2: Madrid
Option 3: Paris
Option 4: Rome
Answer: 3

Question 2:
Prompt: Which number is even?
Option 1: 3
Option 2: 7
Option 3: 10
Option 4: 11
Answer: 3
`;

function refreshPageAfterSuccessTransaction() {
  window.setTimeout(() => {
    window.location.reload();
  }, 700);
}

type ExamDrawerCourse = {
  courseId: bigint;
  title: string;
  tutor: string;
  tutorName: string;
};

type DraftQuestion = {
  correctAnswer: number | null;
  options: string[];
  prompt: string;
};

type AddExamDrawerProps = {
  course: ExamDrawerCourse | null;
  nextExamId: string | null;
  onClose: () => void;
  open: boolean;
  tutorDisplayName: string;
};

function createEmptyQuestion(): DraftQuestion {
  return {
    correctAnswer: null,
    options: ["", "", "", ""],
    prompt: "",
  };
}

type ArciumEncryptionResult = {
  ciphertext: number[][];
  clientPublicKeyHex: string;
  error?: string;
  nonceHex: string;
};

type ParsedExamImport = {
  questions: DraftQuestion[];
  title: string;
};

type PlanFailureLike = {
  error?: unknown;
  kind?: string;
  logs?: string[];
  message?: string;
  plans?: PlanFailureLike[];
  status?: string;
  transactionPlanResult?: PlanFailureLike;
};

function encodeUtf8Values(value: string) {
  return Array.from(new TextEncoder().encode(value));
}

function parseHexBytes(value: string) {
  const normalized = value.trim().replace(/^0x/, "");

  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error("Expected a valid hex string.");
  }

  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }

  return bytes;
}

function toFixedBytes32(value: Uint8Array | number[]): FixedBytes32 {
  const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);

  if (bytes.length !== 32) {
    throw new Error("Expected a 32-byte encrypted value.");
  }

  return bytes;
}

function bytesToLittleEndianBigInt(bytes: Uint8Array) {
  return bytes.reduce(
    (result, byte, index) => result + (BigInt(byte) << (BigInt(index) * BigInt(8))),
    BigInt(0),
  );
}

async function encryptValues(values: number[]) {
  const response = await fetch("/api/arcium/encrypt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  const payload = (await response.json()) as ArciumEncryptionResult;

  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Failed to encrypt exam content.");
  }

  return payload;
}

function isAlreadyProcessedError(error: unknown) {
  const message = getDetailedErrorMessage(error, "").toLowerCase();
  return message.includes("already been processed");
}

function getMessageFromUnknownError(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return null;
}

function getLastLogLine(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if ("logs" in value && Array.isArray(value.logs) && value.logs.length > 0) {
    const lastLine = value.logs.at(-1);
    return typeof lastLine === "string" ? lastLine : null;
  }

  if ("context" in value && value.context && typeof value.context === "object") {
    return getLastLogLine(value.context);
  }

  return null;
}

function findLogLine(value: unknown, predicate: (line: string) => boolean, seen = new WeakSet<object>()): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.logs)) {
    const match = record.logs.find((line) => typeof line === "string" && predicate(line));
    if (typeof match === "string") {
      return match;
    }
  }

  for (const key of ["cause", "context", "data", "error", "transactionPlanResult"]) {
    const match = findLogLine(record[key], predicate, seen);
    if (match) {
      return match;
    }
  }

  return null;
}

function getInsufficientLamportsMessage(error: unknown) {
  const logLine = findLogLine(error, (line) => line.toLowerCase().includes("insufficient lamports"));
  const match = logLine?.match(/insufficient lamports\s+(\d+),\s*need\s+(\d+)/i);

  if (!match) {
    return null;
  }

  return "Not enough balance to initate transaction";
}

function getFirstFailedPlanError(plan: unknown): unknown {
  if (!plan || typeof plan !== "object") {
    return null;
  }

  const typedPlan = plan as PlanFailureLike;

  if (typedPlan.kind === "single" && typedPlan.status === "failed" && typedPlan.error) {
    return typedPlan.error;
  }

  if (Array.isArray(typedPlan.plans)) {
    for (const nestedPlan of typedPlan.plans) {
      const nestedError = getFirstFailedPlanError(nestedPlan);
      if (nestedError) {
        return nestedError;
      }
    }
  }

  return null;
}

function getDetailedErrorMessage(error: unknown, fallback: string) {
  const insufficientLamportsMessage = getInsufficientLamportsMessage(error);
  if (insufficientLamportsMessage) {
    return insufficientLamportsMessage;
  }

  if (error && typeof error === "object" && "transactionPlanResult" in error) {
    const failedPlanError = getFirstFailedPlanError(error.transactionPlanResult);
    const failedMessage = getMessageFromUnknownError(failedPlanError);
    const lastLogLine = getLastLogLine(failedPlanError);

    if (failedMessage && lastLogLine && lastLogLine !== failedMessage) {
      return `${failedMessage} (${lastLogLine})`;
    }

    if (failedMessage) {
      return failedMessage;
    }
  }

  return getMessageFromUnknownError(error) || fallback;
}

function isSpuriousTransactionPlanError(error: unknown) {
  if (!error || typeof error !== "object" || !("transactionPlanResult" in error)) {
    return false;
  }

  return getFirstFailedPlanError((error as { transactionPlanResult: unknown }).transactionPlanResult) === null;
}

function parseAnswerIndex(value: string) {
  const normalized = value.trim().toLowerCase();

  if (/^[1-4]$/.test(normalized)) {
    return Number(normalized) - 1;
  }

  if (/^[a-d]$/.test(normalized)) {
    return normalized.charCodeAt(0) - 97;
  }

  const optionMatch = normalized.match(/^option\s*([1-4]|[a-d])$/i);

  if (optionMatch) {
    return parseAnswerIndex(optionMatch[1]);
  }

  throw new Error("Answer must be 1-4 or A-D.");
}

function parseExamImportText(raw: string): ParsedExamImport {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));

  let title = "";
  let activeSection: { optionIndex?: number; type: "option" | "prompt" } | null = null;
  let currentAnswer: string | null = null;
  let currentQuestion: DraftQuestion | null = null;
  const parsedQuestions: DraftQuestion[] = [];

  function ensureCurrentQuestion() {
    if (!currentQuestion) {
      currentQuestion = createEmptyQuestion();
    }

    return currentQuestion;
  }

  function pushCurrentQuestion() {
    if (!currentQuestion) {
      return;
    }

    if (!currentQuestion.prompt.trim()) {
      throw new Error(`Question ${parsedQuestions.length + 1} is missing a prompt.`);
    }

    if (currentQuestion.options.some((option) => !option.trim())) {
      throw new Error(`Question ${parsedQuestions.length + 1} must include 4 options.`);
    }

    if (currentAnswer === null) {
      throw new Error(`Question ${parsedQuestions.length + 1} is missing an answer.`);
    }

    currentQuestion.correctAnswer = parseAnswerIndex(currentAnswer);
    parsedQuestions.push({
      correctAnswer: currentQuestion.correctAnswer,
      options: [...currentQuestion.options],
      prompt: currentQuestion.prompt,
    });
    currentQuestion = null;
    currentAnswer = null;
    activeSection = null;
  }

  for (const line of lines) {
    const titleMatch = line.match(/^Exam Title\s*:\s*(.+)$/i);

    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    if (/^Question(?:\s+\d+)?\s*:?$/i.test(line)) {
      pushCurrentQuestion();
      currentQuestion = createEmptyQuestion();
      activeSection = null;
      continue;
    }

    const promptMatch = line.match(/^Prompt\s*:\s*(.*)$/i);

    if (promptMatch) {
      ensureCurrentQuestion().prompt = promptMatch[1].trim();
      activeSection = { type: "prompt" };
      continue;
    }

    const optionMatch = line.match(/^Option\s*([1-4]|[A-D])\s*:\s*(.*)$/i);

    if (optionMatch) {
      const optionIndex = parseAnswerIndex(optionMatch[1]);
      ensureCurrentQuestion().options[optionIndex] = optionMatch[2].trim();
      activeSection = { optionIndex, type: "option" };
      continue;
    }

    const answerMatch = line.match(/^(?:Answer|Correct Answer)\s*:\s*(.+)$/i);

    if (answerMatch) {
      ensureCurrentQuestion();
      currentAnswer = answerMatch[1].trim();
      activeSection = null;
      continue;
    }

    if (activeSection?.type === "prompt") {
      ensureCurrentQuestion().prompt = `${ensureCurrentQuestion().prompt}\n${line}`.trim();
      continue;
    }

    if (activeSection?.type === "option" && typeof activeSection.optionIndex === "number") {
      const existingOption = ensureCurrentQuestion().options[activeSection.optionIndex];
      ensureCurrentQuestion().options[activeSection.optionIndex] = `${existingOption} ${line}`.trim();
    }
  }

  pushCurrentQuestion();

  if (parsedQuestions.length === 0) {
    throw new Error("No questions were found in the uploaded file.");
  }

  return {
    questions: parsedQuestions,
    title: title.trim(),
  };
}

export function AddExamDrawer({
  course,
  nextExamId,
  onClose,
  open,
  tutorDisplayName,
}: AddExamDrawerProps) {
  const proofArcium = useProofArcium();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [isImportingFile, setIsImportingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [questions, setQuestions] = useState<DraftQuestion[]>([createEmptyQuestion()]);

  useEffect(() => {
    if (!open) {
      return;
    }

    queueMicrotask(() => {
      setExamTitle(course ? `${course.title} Assessment` : "");
      setQuestions([createEmptyQuestion()]);
    });
  }, [course, open]);

  function updateQuestion(index: number, updater: (question: DraftQuestion) => DraftQuestion) {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index ? updater(question) : question,
      ),
    );
  }

  function handleDownloadTemplate() {
    const templateBlob = new Blob([EXAM_TEMPLATE_TEXT], { type: "text/plain;charset=utf-8" });
    const downloadUrl = window.URL.createObjectURL(templateBlob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = "proof-frontier-exam-template.txt";
    link.click();
    window.URL.revokeObjectURL(downloadUrl);
  }

  async function readImportedFile(file: File) {
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".txt")) {
      return file.text();
    }

    if (lowerName.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value;
    }

    throw new Error("Upload a .txt or .docx file.");
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsImportingFile(true);

    try {
      const importedText = await readImportedFile(file);
      const parsedExam = parseExamImportText(importedText);

      setExamTitle(parsedExam.title || (course ? `${course.title} Assessment` : examTitle));
      setQuestions(parsedExam.questions);
      toast.success(
        `Imported ${parsedExam.questions.length} question${parsedExam.questions.length === 1 ? "" : "s"} from ${file.name}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import exam file.");
    } finally {
      setIsImportingFile(false);
    }
  }

  async function handleSave() {
    if (!course) {
      return;
    }

    if (!nextExamId) {
      toast.error("Program configuration is still loading. Try again in a moment.");
      return;
    }

    if (isSaving) {
      return;
    }

    const trimmedTitle = examTitle.trim();
    if (!trimmedTitle) {
      toast.error("Enter an exam title.");
      return;
    }

    if (questions.length === 0) {
      toast.error("Add at least one question.");
      return;
    }

    for (const [index, question] of questions.entries()) {
      if (!question.prompt.trim()) {
        toast.error(`Question ${index + 1} needs a prompt.`);
        return;
      }

      if (question.options.some((option) => !option.trim())) {
        toast.error(`Question ${index + 1} needs all answer options filled.`);
        return;
      }

      if (question.correctAnswer === null) {
        toast.error(`Select the correct answer for question ${index + 1}.`);
        return;
      }
    }

    if (questions.length > 255) {
      toast.error("Exams can include at most 255 questions.");
      return;
    }

    const normalizedQuestions = questions.map((question) => ({
      correctAnswer: question.correctAnswer ?? 0,
      options: question.options.map((option) => option.trim()),
      prompt: question.prompt.trim(),
    }));

    const contentPayload = {
      courseId: course.courseId.toString(),
      courseTitle: course.title,
      questions: normalizedQuestions.map(({ options, prompt }) => ({ options, prompt })),
      title: trimmedTitle,
      tutor: tutorDisplayName || course.tutorName || course.tutor,
      tutorWallet: course.tutor,
    };

    const answerKeyPayload = {
      answers: normalizedQuestions.map((question) => question.correctAnswer),
      examTitle: trimmedTitle,
    };

    proofArcium.reset();
    setIsSaving(true);

    try {
      // The Arcium circuit decrypts a fixed 16-slot AnswerKey struct.
      // Pad unused slots with valid encrypted zeros so `to_arcis()` never
      // tries to decrypt zero-filled placeholder ciphertexts.
      const answerBytes = Array.from(
        { length: 16 },
        (_, index) => normalizedQuestions[index]?.correctAnswer ?? 0,
      );
      const answerKeyEncryption = await encryptValues(answerBytes);

      // Store questions + correct answers in MongoDB — server Arcium-encrypts them.
      // Questions are decrypted and returned to students with a valid on-chain ExamAccess.
      // Correct answers are decrypted and returned only after session.completed on-chain.
      const storeResponse = await fetch("/api/exam/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: nextExamId,
          title: trimmedTitle,
          questions: normalizedQuestions.map(({ options, prompt }) => ({ options, prompt })),
          correctAnswers: normalizedQuestions.map((q) => q.correctAnswer),
        }),
      });
      if (!storeResponse.ok) {
        const err = (await storeResponse.json()) as { error?: string };
        throw new Error(err.error || "Failed to store exam content.");
      }

      const instruction = await proofArcium.getCreateExamInstruction({
        courseId: course.courseId.toString(),
        encryptedExam: {
          // One ciphertext per answer byte — matches the circuit's AnswerKey struct.
          answerKeyCiphertexts: answerKeyEncryption.ciphertext.map((chunk) => toFixedBytes32(chunk)),
          answerKeyNonce: bytesToLittleEndianBigInt(parseHexBytes(answerKeyEncryption.nonceHex)).toString(),
          // Content is stored off-chain in MongoDB. The on-chain pubkey is used
          // by the Arcium Shared owner for decrypting the answer-key ciphertexts.
          contentCiphertexts: [],
          contentNonce: 0,
          contentPubkey: parseHexBytes(answerKeyEncryption.clientPublicKeyHex),
        },
        examId: nextExamId,
        questionCount: normalizedQuestions.length,
        title: trimmedTitle,
      });

      await proofArcium.send({ instructions: [instruction] });
      toast.success(`Created ${trimmedTitle}.`);
      onClose();
      refreshPageAfterSuccessTransaction();
    } catch (error) {
      if (isAlreadyProcessedError(error) || isSpuriousTransactionPlanError(error)) {
        console.warn("Create exam transaction reported a non-fatal transaction plan error", {
          examId: nextExamId,
          transactionPlanResult:
            error && typeof error === "object" && "transactionPlanResult" in error
              ? error.transactionPlanResult
              : null,
        });
        toast.success(`Created ${trimmedTitle}.`);
        onClose();
        refreshPageAfterSuccessTransaction();
        return;
      }

      toast.error(getDetailedErrorMessage(error, "Failed to create exam."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Drawer
      destroyOnHidden
      onClose={onClose}
      open={open}
      placement="right"
      title={course ? `Add Exam • ${course.title}` : "Add Exam"}
      width={760}
      styles={{
        body: {
          background: "#f7efe6",
          padding: "1.1rem 1rem 1.5rem",
        },
        header: {
          background: "#fff8f0",
          borderBottom: "1px solid #d7c8b6",
        },
      }}
    >
      {course ? (
        <ConfigProvider
          theme={{
            token: {
              colorPrimary: DRAWER_THEME_COLOR,
              colorPrimaryActive: DRAWER_THEME_COLOR,
              colorPrimaryBorder: DRAWER_THEME_COLOR,
              colorPrimaryHover: DRAWER_THEME_COLOR,
            },
            components: {
              Button: {
                colorPrimary: DRAWER_THEME_COLOR,
                colorPrimaryActive: DRAWER_THEME_COLOR,
                colorPrimaryHover: DRAWER_THEME_COLOR,
              },
              Input: {
                activeBorderColor: DRAWER_THEME_COLOR,
                activeShadow: "0 0 0 2px rgba(37, 53, 51, 0.16)",
                colorText: "#102320",
                hoverBorderColor: DRAWER_THEME_COLOR,
              },
              Select: {
                activeBorderColor: DRAWER_THEME_COLOR,
                activeOutlineColor: "rgba(37, 53, 51, 0.16)",
                colorText: "#102320",
                hoverBorderColor: DRAWER_THEME_COLOR,
              },
            },
          }}
        >
          <div style={{ display: "grid", gap: "1rem" }}>
            <div
              style={{
                background: "#fff8f0",
                border: "1px solid #ddcfbf",
                borderRadius: "0.8rem",
                padding: "0.95rem 1rem",
              }}
            >
              <Title level={5} style={{ color: "#223425", margin: 0 }}>
                {course.title}
              </Title>
              <Paragraph style={{ color: "#4b5b4a", margin: "0.45rem 0 0" }}>
                Tutor: {course.tutorName || tutorDisplayName || course.tutor}
              </Paragraph>
              <Text style={{ color: "#6b7868" }}>
                Wallet: {course.tutor}
              </Text>
            </div>

            <div style={{ display: "grid", gap: "0.45rem" }}>
              <Text strong style={{ color: "#213424" }}>
                Exam title
              </Text>
              <Input
                placeholder="Enter exam title"
                size="large"
                value={examTitle}
                onChange={(event) => setExamTitle(event.target.value)}
              />
            </div>

            <div
              style={{
                background: "#fff8f0",
                border: "1px solid #ddcfbf",
                borderRadius: "0.8rem",
                display: "grid",
                gap: "0.7rem",
                padding: "0.95rem 1rem",
              }}
            >
              <div style={{ display: "grid", gap: "0.3rem" }}>
                <Text strong style={{ color: "#213424" }}>
                  Import questions from file
                </Text>
                <Paragraph style={{ color: "#5c685d", margin: 0 }}>
                  Upload a `.txt` or `.docx` file that follows the template, or download the template first and edit your own questions offline.
                </Paragraph>
              </div>

              <Space size="middle" wrap>
                <Button
                  loading={isImportingFile}
                  onClick={() => fileInputRef.current?.click()}
                  size="large"
                  type="default"
                >
                  Upload TXT / DOCX
                </Button>
                <Button onClick={handleDownloadTemplate} size="large" type="default">
                  Download Template
                </Button>
              </Space>

              <input
                accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                hidden
                onChange={(event) => {
                  void handleFileImport(event);
                }}
                ref={fileInputRef}
                type="file"
              />
            </div>

            <Divider style={{ borderColor: "#d8cab9", margin: "0.25rem 0" }} />

            <div style={{ display: "grid", gap: "1rem" }}>
              <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                <Text strong style={{ color: "#213424", fontSize: "1rem" }}>
                  Questions
                </Text>
                <Button
                  onClick={() => setQuestions((current) => [...current, createEmptyQuestion()])}
                  type="default"
                >
                  Add Question
                </Button>
              </Space>

              {questions.map((question, index) => (
                <div
                  key={`question-${index}`}
                  style={{
                    background: "#fffaf3",
                    border: "1px solid #ddcfbf",
                    borderRadius: "0.8rem",
                    display: "grid",
                    gap: "0.8rem",
                    padding: "0.95rem 1rem",
                  }}
                >
                  <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
                    <Text strong style={{ color: "#213424" }}>
                      Question {index + 1}
                    </Text>
                    {questions.length > 1 ? (
                      <Button
                        danger
                        onClick={() =>
                          setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))
                        }
                        type="text"
                      >
                        Remove
                      </Button>
                    ) : null}
                  </Space>

                  <Input.TextArea
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder="Write the question prompt"
                    value={question.prompt}
                    onChange={(event) =>
                      updateQuestion(index, (current) => ({
                        ...current,
                        prompt: event.target.value,
                      }))
                    }
                  />

                  <div style={{ display: "grid", gap: "0.6rem" }}>
                    {question.options.map((option, optionIndex) => (
                      <Input
                        key={`option-${index}-${optionIndex}`}
                        placeholder={`Answer option ${optionIndex + 1}`}
                        value={option}
                        onChange={(event) =>
                          updateQuestion(index, (current) => ({
                            ...current,
                            options: current.options.map((existingOption, existingIndex) =>
                              existingIndex === optionIndex ? event.target.value : existingOption,
                            ),
                          }))
                        }
                      />
                    ))}
                  </div>

                  <div style={{ display: "grid", gap: "0.45rem" }}>
                    <Text strong style={{ color: "#213424" }}>
                      Correct answer
                    </Text>
                    <Select
                      options={question.options.map((_, optionIndex) => ({
                        label: `Option ${optionIndex + 1}`,
                        value: optionIndex,
                      }))}
                      placeholder="Select the correct answer"
                      value={question.correctAnswer}
                      onChange={(value) =>
                        updateQuestion(index, (current) => ({
                          ...current,
                          correctAnswer: value,
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <Space style={{ justifyContent: "flex-end", width: "100%" }}>
              <Button onClick={onClose} size="large">
                Cancel
              </Button>
              <Button
                disabled={!nextExamId || isSaving}
                loading={isSaving}
                onClick={() => {
                  void handleSave();
                }}
                size="large"
                type="primary"
              >
                {isSaving ? "Creating…" : "Create Exam"}
              </Button>
            </Space>
          </div>
        </ConfigProvider>
      ) : null}
    </Drawer>
  );
}
