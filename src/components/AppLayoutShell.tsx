"use client";

import type { ReactNode } from "react";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "./Navbar";

type AppLayoutShellProps = {
  children: ReactNode;
};

function SearchAwareNavbar() {
  const searchParams = useSearchParams();

  const navbarProps = useMemo(() => {
    const name = searchParams.get("name");
    const role = searchParams.get("role");

    if (!name || !role) {
      return {};
    }

    return {
      displayName: decodeURIComponent(name),
      role,
    };
  }, [searchParams]);

  return <Navbar {...navbarProps} />;
}

export function AppLayoutShell({ children }: AppLayoutShellProps) {
  return (
    <>
      <Suspense fallback={<Navbar />}>
        <SearchAwareNavbar />
      </Suspense>
      {children}
    </>
  );
}