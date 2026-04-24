"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";

type AppLayoutShellProps = {
  children: ReactNode;
};

export function AppLayoutShell({ children }: AppLayoutShellProps) {
  const pathname = usePathname();
  const showNavbar = pathname === "/";

  return (
    <>
      {showNavbar ? <Navbar /> : null}
      {children}
    </>
  );
}