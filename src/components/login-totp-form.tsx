"use client";

import { useState } from "react";
import styles from "@/app/page.module.css";
import { safeNextPath } from "@/lib/safe-next-path";

type LoginTotpFormProps = {
  nextPath?: string;
};

type SubmitStatus = "idle" | "loading" | "error";

export function LoginTotpForm({ nextPath }: LoginTotpFormProps) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");

  async function submit() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/auth/login/totp", {
        body: JSON.stringify({ code }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setStatus("error");
        setMessage(loginErrorMessage(response.status, data));
        return;
      }
      window.location.assign(safeNextPath(nextPath));
    } catch {
      setStatus("error");
      setMessage("인증 요청에 실패했어요. 잠시 후 다시 시도해 주세요.");
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
      <label className={styles.label} htmlFor="login-totp-code">
        인증 앱 코드
      </label>
      <input
        autoComplete="one-time-code"
        className={styles.input}
        id="login-totp-code"
        inputMode="numeric"
        maxLength={6}
        onChange={(event) =>
          setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
        pattern="[0-9]{6}"
        placeholder="6자리 코드"
        required
        type="text"
        value={code}
      />
      <button
        className={styles.primaryButton}
        disabled={status === "loading" || code.length !== 6}
        type="submit"
      >
        {status === "loading" ? "확인 중" : "2FA 인증하고 로그인"}
      </button>
      {message && (
        <output className={styles.authError} role="alert">
          {message}
        </output>
      )}
      <a className={styles.secondaryButton} href="/login">
        이메일부터 다시 인증
      </a>
    </form>
  );
}

function loginErrorMessage(status: number, data: unknown) {
  const reason =
    typeof data === "object" &&
    data !== null &&
    "reason" in data &&
    typeof data.reason === "string"
      ? data.reason
      : "";
  if (status === 401) {
    return "인증 시간이 만료됐어요. 이메일부터 다시 인증해 주세요.";
  }
  if (status === 429 || reason === "rate_limited") {
    return "인증 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.";
  }
  if (reason === "totp_not_enrolled") {
    return "필수 2FA가 설정되지 않은 계정이에요. 관리자에게 문의해 주세요.";
  }
  return "인증 앱 코드가 올바르지 않아요.";
}
