"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import styles from "@/app/page.module.css";

export function AuthRequiredLink({
  children,
  className,
  nextPath,
}: {
  children: ReactNode;
  className?: string;
  nextPath: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <a
        className={className}
        href={`/login?next=${encodeURIComponent(nextPath)}&reason=login_required`}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </a>
      <LoginRequiredModal
        nextPath={nextPath}
        onClose={() => setOpen(false)}
        open={open}
      />
    </>
  );
}

export function LoginRequiredModal({
  description = "이 기능은 로그인한 뒤 사용할 수 있어요. 잠시 후 로그인 페이지로 이동합니다.",
  nextPath,
  onClose,
  open,
  title = "로그인이 필요해요",
}: {
  description?: string;
  nextPath: string;
  onClose: () => void;
  open: boolean;
  title?: string;
}) {
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}&reason=login_required`;

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.location.assign(loginHref);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [loginHref, open]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        aria-labelledby="login-required-title"
        aria-modal="true"
        className={styles.authModal}
        role="dialog"
      >
        <span className={styles.badge}>로그인 안내</span>
        <h2 id="login-required-title">{title}</h2>
        <p>{description}</p>
        <div className={styles.authModalActions}>
          <a className={styles.primaryButton} href={loginHref}>
            로그인 페이지로 이동
          </a>
          <button
            className={styles.secondaryButton}
            onClick={onClose}
            type="button"
          >
            취소
          </button>
        </div>
      </section>
    </div>
  );
}
