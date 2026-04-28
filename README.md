# Proof Frontier Frontend

Proof Frontier is a learning and assessment frontend built on Solana and Arcium. It lets tutors create courses and exams, lets students enroll and take exams, and uses encrypted computation so grading can happen without exposing private exam answers in plain text.

The frontend connects to the Proof Arcium program:

https://github.com/bellobambo/proof_arcium

Program id:

```text
Ch5KUtPipgBTnjCVX1du7keV7pd6cdxJDLovRErFuSh
```

## What The Project Does

Proof Frontier supports a basic course and exam flow:

- tutors register and create courses
- tutors create encrypted exams for their courses
- students register and enroll in courses
- students request access to exam content
- tutors grant access by encrypting the content key for the student
- students submit answers
- Arcium handles private grading computation
- the frontend shows the student exam result once grading is complete

The goal is to keep the learning workflow familiar while moving the sensitive parts of assessment, especially answer keys and grading, into encrypted infrastructure.

## How The Frontend Uses The IDL

The Solana program is written in Anchor, so the program repo produces an IDL that describes the program instructions, accounts, data types, and account layout.

In this frontend, that IDL is reflected in `src/lib/proofArcium.ts`. This file acts as the typed program client for the app. It defines the program id, account shapes, instruction discriminators, PDA helpers, and instruction builders used by the UI.

The frontend uses that generated program knowledge to build transactions for actions like:

- registering a user
- creating a course
- creating an exam
- enrolling in a course
- requesting and granting exam access
- taking an exam
- handling the Arcium grading callback

So the frontend does not treat the program as a black box. It uses the IDL-derived client code to know how each instruction should be encoded, which accounts are required, and how program-derived addresses should be calculated.

When the on-chain program changes, the frontend client must stay in sync with the latest IDL from the program repo. Otherwise, instruction data, account order, or PDA derivation can drift from what the deployed program expects.

## How The Frontend Uses Arcium

Arcium is used for the privacy-preserving part of the exam flow.

When a tutor creates an exam, sensitive exam material and answer data are encrypted before being stored or sent through the app. When a student takes an exam, their submitted answers are prepared for Arcium's encrypted computation flow instead of being graded openly by the frontend.

The frontend coordinates this flow by:

- encrypting exam content and answer material
- managing student access to encrypted content
- preparing the accounts needed for an Arcium computation
- sending the transaction that starts private grading
- checking for the grading result
- displaying the final score once the computation completes

The on-chain Proof Arcium program owns the Solana-side workflow, while Arcium provides the encrypted computation layer used to grade the exam privately.

## Relationship Between The Frontend And Program

The frontend is the user-facing app. The `proof_arcium` program is the source of truth for course, exam, enrollment, access, and grading state.

The frontend uses the program IDL to speak the program's language, and it uses Arcium to keep private exam data protected while still allowing grading to happen.
