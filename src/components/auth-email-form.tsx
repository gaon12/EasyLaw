"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

type AuthEmailFormProps = {
  mode: "login" | "signup";
  nextPath?: string;
};

export function AuthEmailForm({ mode, nextPath }: AuthEmailFormProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const isSubmittingRef = useRef(false);

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
      const data = await response.json();
      if (!response.ok) {
        setStatus("error");
        setMessage(
          data.reason === "rate_limited"
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
      {status !== "idle" && (
        <output
          className={
            status === "success"
              ? styles.settingsNoticeSuccess
              : status === "error"
                ? styles.settingsNoticeError
                : styles.settingsNotice
          }
        >
          {message}
        </output>
      )}
    </form>
  );
}
