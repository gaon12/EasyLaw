"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/page.module.css";

type AuthEmailFormProps = {
  mode: "login" | "signup";
  nextPath?: string;
};

type AuthStatus = "idle" | "loading" | "success" | "error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAuthenticatedSession(
  value: unknown,
): value is { authenticated: boolean } {
  return isRecord(value) && typeof value.authenticated === "boolean";
}

function rateLimited(value: unknown) {
  return isRecord(value) && value.reason === "rate_limited";
}

export function AuthEmailForm({ mode, nextPath }: AuthEmailFormProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (status !== "success") {
      return;
    }

    let disposed = false;
    async function redirectIfSignedIn() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const data: unknown = await response.json();
        if (!disposed && isAuthenticatedSession(data) && data.authenticated) {
          window.location.assign(safeNextPath(nextPath));
        }
      } catch (_error) {
        return;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void redirectIfSignedIn();
      }
    }

    window.addEventListener("focus", redirectIfSignedIn);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void redirectIfSignedIn();
    return () => {
      disposed = true;
      window.removeEventListener("focus", redirectIfSignedIn);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [nextPath, status]);

  async function submit() {
    if (isSubmittingRef.current) {
      return;
    }
    if (!email.includes("@")) {
      setStatus("error");
      setMessage("올바른 이메일 주소를 입력해 주세요.");
      return;
    }
    if (mode === "signup" && displayName.trim().length < 1) {
      setStatus("error");
      setMessage("회원가입에 사용할 이름을 입력해 주세요.");
      return;
    }

    isSubmittingRef.current = true;
    setStatus("loading");
    setMessage("인증 링크를 준비하고 있어요.");
    try {
      const response = await fetch("/api/auth/magic-link", {
        body: JSON.stringify({
          displayName: mode === "signup" ? displayName : undefined,
          email,
          next: nextPath,
          purpose: mode,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setStatus("error");
        setMessage(
          rateLimited(data)
            ? "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요."
            : "인증 링크를 만들지 못했어요. 입력값을 확인해 주세요.",
        );
        return;
      }
      setStatus("success");
      setMessage("인증 링크를 이메일로 보냈어요. 메일함을 확인해 주세요.");
    } catch (_error) {
      setStatus("error");
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  return (
    <>
      <form
        className={styles.authForm}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className={styles.label} htmlFor="email">
          이메일
        </label>
        <input
          autoComplete="email"
          className={styles.input}
          id="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
        {mode === "signup" && (
          <>
            <label className={styles.label} htmlFor="signup-name">
              이름
            </label>
            <input
              autoComplete="name"
              className={styles.input}
              id="signup-name"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="홍길동"
              type="text"
              value={displayName}
            />
          </>
        )}
        <button
          className={styles.primaryButton}
          disabled={status === "loading"}
          type="submit"
        >
          {status === "loading"
            ? "보내는 중"
            : mode === "login"
              ? "이메일로 인증하기"
              : "이메일 인증하고 가입하기"}
        </button>
        {mode === "login" && (
          <a className={styles.secondaryButton} href="/signup">
            회원가입하기
          </a>
        )}
      </form>
      <AuthStatusModal
        message={message}
        onClose={() => setStatus("idle")}
        status={status}
      />
    </>
  );
}

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function AuthStatusModal({
  message,
  onClose,
  status,
}: {
  message: string;
  onClose: () => void;
  status: AuthStatus;
}) {
  if (status !== "success" && status !== "error") {
    return null;
  }

  const isSuccess = status === "success";
  const title = isSuccess ? "메일을 보냈어요" : "다시 확인해 주세요";

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        aria-labelledby="auth-status-title"
        aria-modal="true"
        className={styles.authModal}
        role="dialog"
      >
        <span className={isSuccess ? styles.statusReady : styles.statusReview}>
          {isSuccess ? "인증 안내" : "확인 필요"}
        </span>
        <h2 id="auth-status-title">{title}</h2>
        <p>{message}</p>
        <div className={styles.authModalActions}>
          <button
            className={styles.primaryButton}
            onClick={onClose}
            type="button"
          >
            확인
          </button>
        </div>
      </section>
    </div>
  );
}
