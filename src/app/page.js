"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const [walletConnected, setWalletConnected] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [formData, setFormData] = useState({ fullName: "", role: "student" });
  const [isRegistered, setIsRegistered] = useState(false);

  const openRegister = () => {
    if (!walletConnected) return;
    setIsRegisterOpen(true);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!formData.fullName.trim()) return;
    setIsRegistered(true);
    setIsRegisterOpen(false);
  };

  const goToCourses = () => {
    if (!isRegistered) return;
    const fullName = encodeURIComponent(formData.fullName.trim());
    router.push(`/courses?role=${formData.role}&name=${fullName}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.navWrap}>
        <nav className={styles.nav}>
          <div className={styles.brand}>
            <span className={styles.techFont}>Proof</span>
          </div>
          <div className={styles.navActions}>
            <button
              type="button"
              className={`${styles.primaryButton} ${styles.techFont}`}
              onClick={() => setWalletConnected(true)}
              disabled={walletConnected}
            >
              {walletConnected ? "Wallet Connected" : "Connect Wallet"}
            </button>
          </div>
        </nav>
      </div>

      <main className={styles.main}>
        <section className={styles.heroCopy}>
          <p className={styles.tag}>Decentralized Learning Management System</p>
          <h1>Proof secures every assessment record on Solana.</h1>
          <p className={styles.description}>
            Tutors create courses and multiple-choice exams, students enroll and
            take assessments, and every score is permanently recorded on-chain
            to keep learning interactions tamper-proof.
          </p>

          <div className={styles.ctaRow}>
            <button
              type="button"
              className={`${styles.primaryButton} ${styles.techFont}`}
              onClick={() => setWalletConnected(true)}
              disabled={walletConnected}
            >
              {walletConnected ? "Connected to Solana" : "Connect Wallet"}
            </button>
            <button
              type="button"
              className={`${styles.ghostButton} ${styles.techFont}`}
              onClick={openRegister}
              disabled={!walletConnected}
            >
              Register
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={!isRegistered}
              onClick={goToCourses}
            >
              {isRegistered ? "Access Courses" : "Complete Registration"}
            </button>
          </div>
        </section>

        <section className={styles.heroVisual}>
          <Image
            src="/proof-hero.svg"
            alt="Abstract learning and blockchain illustration"
            width={560}
            height={420}
            priority
            className={styles.heroImage}
          />
        </section>
      </main>

      {isRegisterOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsRegisterOpen(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <h2 className={styles.techFont}>Register Your Account</h2>
            <p>Set up your profile to start learning or publishing courses.</p>
            <form onSubmit={handleSubmit} className={styles.form}>
              <label htmlFor="fullName">Full name</label>
              <input
                id="fullName"
                type="text"
                value={formData.fullName}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, fullName: event.target.value }))
                }
                placeholder="Enter your full name"
                required
              />

              <label htmlFor="role">Role</label>
              <select
                id="role"
                value={formData.role}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, role: event.target.value }))
                }
              >
                <option value="student">Student</option>
                <option value="tutor">Tutor</option>
              </select>

              <button type="submit" className={`${styles.primaryButton} ${styles.techFont}`}>
                Register Now
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
