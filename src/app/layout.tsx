import type { Metadata } from "next";
import type { ReactNode } from "react";
import "antd/dist/reset.css";
import "./globals.css";
import { AppLayoutShell } from "../components/AppLayoutShell";
import { AppProviders } from "../components/providers/AppProviders";

export const metadata: Metadata = {
  title: "Proof Arcium",
  description:
    "Proof is a Solana-based learning platform where tutors publish courses and encrypted exams, and students take assessments with verifiable results recorded on-chain.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AppProviders>
          <AppLayoutShell>{children}</AppLayoutShell>
        </AppProviders>
      </body>
    </html>
  );
}
