export type AssessmentQuestion = {
  prompt: string;
  options: string[];
};

export type Assessment = {
  id: number;
  title: string;
  tutor: string;
  level: string;
  lessons: number;
  questions?: AssessmentQuestion[];
};

export const DUMMY_ASSESSMENTS: Assessment[] = [
  {
    id: 1,
    title: "Solana Smart Contract Fundamentals",
    tutor: "A. Collins",
    level: "Beginner",
    lessons: 12,
  },
  {
    id: 2,
    title: "Rust for On-chain Assessments",
    tutor: "M. Jordan",
    level: "Intermediate",
    lessons: 18,
  },
  {
    id: 3,
    title: "Tamper-proof Exam Architecture",
    tutor: "S. Kemi",
    level: "Advanced",
    lessons: 10,
  },
  {
    id: 4,
    title: "Wallet UX for Learning Platforms",
    tutor: "J. Reece",
    level: "Intermediate",
    lessons: 9,
  },
  {
    id: 5,
    title: "Proof Records and Verification",
    tutor: "L. Evans",
    level: "Beginner",
    lessons: 14,
  },
  {
    id: 6,
    title: "Designing MCQ Engines on Solana",
    tutor: "R. Nori",
    level: "Advanced",
    lessons: 15,
  },
];
