"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./AppNav.module.css";

export function AppNav({ displayName, role }) {
  const router = useRouter();
  const roleLabel = role === "tutor" ? "Tutor" : "Student";

  const sessionQuery = useMemo(() => {
    const params = new URLSearchParams({
      role: role || "student",
      name: displayName || "Learner",
    });
    return params.toString();
  }, [role, displayName]);

  return (
    <header className={styles.navWrap}>
      <nav className={styles.nav}>
        <div className={styles.leftGroup}>
          <Link href={`/courses?${sessionQuery}`} className={styles.brand}>
            Proof
          </Link>
          <span className={styles.userName}>Hi, {displayName}</span>
          <span className={styles.roleBadge}>{roleLabel}</span>
        </div>

        <div className={styles.rightGroup}>
          <button
            type="button"
            className={styles.disconnectButton}
            onClick={() => router.push("/")}
          >
            Disconnect
          </button>
        </div>
      </nav>
    </header>
  );
}
