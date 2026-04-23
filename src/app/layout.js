import { Geist, Orbitron } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});

export const metadata = {
  title: "Proof | Decentralized LMS on Solana",
  description:
    "Proof is a decentralized learning management system that secures educational assessments records on Solana.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${orbitron.variable}`}>
      <body>{children}</body>
    </html>
  );
}
