import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppLayoutShell } from "../components/AppLayoutShell";
import { AppProviders } from "../components/providers/AppProviders";

export const metadata: Metadata = {
  title: "Proof | Decentralized LMS on Solana",
  description:
    "Proof is a decentralized learning management system that secures educational assessments records on Solana.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <AppLayoutShell>{children}</AppLayoutShell>
        </AppProviders>
      </body>
    </html>
  );
}
