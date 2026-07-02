"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "@/app/page.module.css";
import type { AccountSecurityState } from "@/lib/auth";

type TotpEnrollment = {
  otpauthUrl: string;
  qrDataUrl: string;
};

type SecurityStatus = "idle" | "loading" | "success" | "error";
type MessageContext = "totp" | "recovery";

type AccountSecurityCenterProps = {
  initialState: AccountSecurityState;
  nextPath?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnrollment(value: unknown): value is TotpEnrollment {
  return (
    isRecord(value) &&
    typeof value.otpauthUrl === "string" &&
    typeof value.qrDataUrl === "string"
  );
}

function isSecurityState(value: unknown): value is AccountSecurityState {
  return (
    isRecord(value) &&
    isRecord(value.user) &&
    isRecord(value.authentication) &&
    isRecord(value.recoveryCodes)
  );
}

function recoveryCodesFrom(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.recoveryCodes)) {
    return null;
  }
  if (!value.recoveryCodes.every((code) => typeof code === "string")) {
    return null;
  }
  return value.recoveryCodes;
}

function directSecret(otpauthUrl: string) {
  try {
    return new URL(otpauthUrl).searchParams.get("secret") ?? "";
  } catch (_error) {
    return "";
  }
}

function statusLabel(enabled: boolean, required: boolean) {
  if (enabled && required) {
    return "필수 사용 중";
  }
  if (enabled) {
    return "사용 중";
  }
  if (required) {
    return "설정 필요";
  }
  return "꺼짐";
}

export function AccountSecurityCenter({
  initialState,
  nextPath,
}: AccountSecurityCenterProps) {
  const [securityState, setSecurityState] = useState(initialState);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [isDisableFormOpen, setIsDisableFormOpen] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [messageContext, setMessageContext] = useState<MessageContext>("totp");
  const [status, setStatus] = useState<SecurityStatus>("idle");

  const isTotpEnabled = securityState.authentication.totpEnabled;
  const isBusy = status === "loading";
  const secret = enrollment ? directSecret(enrollment.otpauthUrl) : "";

  async function refreshSecurityState() {
    const response = await fetch("/api/auth/security", { cache: "no-store" });
    const data: unknown = await response.json();
    if (response.ok && isSecurityState(data)) {
      setSecurityState(data);
    }
  }

  async function startEnrollment() {
    setMessageContext("totp");
    setStatus("loading");
    setMessage("인증 앱 등록 정보를 만들고 있어요.");
    setRecoveryCodes([]);
    try {
      const response = await fetch("/api/auth/totp/setup", { method: "POST" });
      const data: unknown = await response.json();
      if (!response.ok || !isEnrollment(data)) {
        setStatus("error");
        setMessage(
          response.status === 409
            ? "이미 2차 인증이 켜져 있어요. 복구 코드 재발급을 사용할 수 있습니다."
            : "등록 정보를 만들지 못했어요. 다시 시도해 주세요.",
        );
        return;
      }
      setEnrollment(data);
      setStatus("success");
      setMessage("인증 앱에서 QR을 스캔한 뒤 6자리 코드를 입력해 주세요.");
    } catch (_error) {
      setStatus("error");
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    }
  }

  async function verifyEnrollment() {
    setMessageContext("totp");
    if (code.replace(/\s/g, "").length < 6) {
      setStatus("error");
      setMessage("인증 앱에 표시된 6자리 코드를 입력해 주세요.");
      return;
    }

    setStatus("loading");
    setMessage("인증 코드를 확인하고 있어요.");
    try {
      const response = await fetch("/api/auth/totp/verify", {
        body: JSON.stringify({ code }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data: unknown = await response.json();
      const nextRecoveryCodes = recoveryCodesFrom(data);
      if (!response.ok || !nextRecoveryCodes) {
        setStatus("error");
        setMessage(
          isRecord(data) && data.reason === "rate_limited"
            ? "시도가 너무 많아요. 잠시 뒤 다시 확인해 주세요."
            : "코드가 맞지 않아요. 인증 앱의 최신 코드를 입력해 주세요.",
        );
        return;
      }
      setRecoveryCodes(nextRecoveryCodes);
      setEnrollment(null);
      setCode("");
      await refreshSecurityState();
      setStatus("success");
      setMessage("2차 인증을 켰어요. 복구 코드는 지금 한 번만 보여드려요.");
    } catch (_error) {
      setStatus("error");
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    }
  }

  async function regenerateCodes() {
    setMessageContext("recovery");
    setStatus("loading");
    setMessage("새 복구 코드를 만들고 있어요.");
    try {
      const response = await fetch("/api/auth/totp/recovery-codes", {
        method: "POST",
      });
      const data: unknown = await response.json();
      const nextRecoveryCodes = recoveryCodesFrom(data);
      if (!response.ok || !nextRecoveryCodes) {
        setStatus("error");
        setMessage(
          "복구 코드를 재발급하지 못했어요. 2차 인증 상태를 확인해 주세요.",
        );
        return;
      }
      setRecoveryCodes(nextRecoveryCodes);
      await refreshSecurityState();
      setStatus("success");
      setMessage(
        "복구 코드를 새로 만들었어요. 이전 코드는 더 이상 사용할 수 없어요.",
      );
    } catch (_error) {
      setStatus("error");
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    }
  }

  async function disableSecondFactor() {
    setMessageContext("totp");
    if (disableCode.replace(/\s/g, "").length < 6) {
      setStatus("error");
      setMessage("현재 인증 앱에 표시된 6자리 코드를 입력해 주세요.");
      return;
    }

    setStatus("loading");
    setMessage("2FA를 끄기 전에 인증 코드를 확인하고 있어요.");
    try {
      const response = await fetch("/api/auth/totp", {
        body: JSON.stringify({ code: disableCode }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        setStatus("error");
        setMessage(
          isRecord(data) && data.reason === "totp_required"
            ? "현재 권한에서는 2FA를 끌 수 없어요."
            : isRecord(data) && data.reason === "rate_limited"
              ? "시도가 너무 많아요. 잠시 뒤 다시 확인해 주세요."
              : "인증 코드가 맞지 않아요. 최신 코드를 입력해 주세요.",
        );
        return;
      }

      setDisableCode("");
      setIsDisableFormOpen(false);
      setRecoveryCodes([]);
      await refreshSecurityState();
      setStatus("success");
      setMessage("2FA를 껐어요. 기존 복구 코드도 모두 폐기했습니다.");
    } catch (_error) {
      setStatus("error");
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    }
  }

  return (
    <div className={styles.securityCenterGrid}>
      <article className={styles.contentCard}>
        <div className={styles.securityCardHeader}>
          <h2 className={styles.panelTitle}>로그인 확인</h2>
          <span className={styles.statusReady}>이메일</span>
        </div>
        <dl className={styles.securityMeta}>
          <div>
            <dt>계정</dt>
            <dd>{securityState.user.email}</dd>
          </div>
          <div>
            <dt>이름</dt>
            <dd>{securityState.user.displayName}</dd>
          </div>
          <div>
            <dt>권한</dt>
            <dd>{securityState.user.role}</dd>
          </div>
        </dl>
      </article>

      <article className={styles.contentCard}>
        <div className={styles.securityCardHeader}>
          <h2 className={styles.panelTitle}>2차 인증(2FA)</h2>
          <span
            className={
              isTotpEnabled ? styles.statusReady : styles.statusPending
            }
          >
            {statusLabel(
              isTotpEnabled,
              securityState.authentication.totpRequired,
            )}
          </span>
        </div>
        <p>
          인증 앱의 일회용 코드로 계정 접근을 한 번 더 확인합니다. 복구 코드는
          2FA 자체가 아니라 인증 앱을 사용할 수 없을 때만 쓰는 비상 수단입니다.
        </p>
        {securityState.authentication.totpRequired && (
          <p className={styles.mutedText}>
            현재 권한은 2FA가 필수이므로 끌 수 없습니다.
          </p>
        )}
        <div className={styles.securityActions}>
          {!isTotpEnabled && (
            <button
              className={styles.primaryButton}
              disabled={isBusy}
              onClick={startEnrollment}
              type="button"
            >
              2차 인증 설정
            </button>
          )}
          {securityState.authentication.totpCanDisable && (
            <button
              className={styles.dangerButton}
              disabled={isBusy}
              onClick={() => setIsDisableFormOpen((current) => !current)}
              type="button"
            >
              2FA 끄기
            </button>
          )}
          {nextPath && isTotpEnabled && (
            <a className={styles.primaryButton} href={nextPath}>
              원래 화면으로 이동
            </a>
          )}
        </div>
        {isDisableFormOpen && (
          <div className={styles.securityDisableForm}>
            <label className={styles.label} htmlFor="disable-totp-code">
              현재 인증 앱 코드
            </label>
            <input
              autoComplete="one-time-code"
              className={styles.input}
              id="disable-totp-code"
              inputMode="numeric"
              onChange={(event) => setDisableCode(event.target.value)}
              placeholder="123456"
              value={disableCode}
            />
            <button
              className={styles.dangerButton}
              disabled={isBusy}
              onClick={disableSecondFactor}
              type="button"
            >
              코드 확인하고 2FA 끄기
            </button>
          </div>
        )}
        {message && messageContext === "totp" && (
          <output
            className={
              status === "error" ? styles.securityError : styles.securityNotice
            }
          >
            {message}
          </output>
        )}
      </article>

      {enrollment && (
        <article className={styles.contentCard}>
          <h2 className={styles.panelTitle}>인증 앱 등록</h2>
          <div className={styles.securityEnrollment}>
            <Image
              alt="인증 앱 등록 QR 코드"
              className={styles.securityQr}
              height={184}
              unoptimized
              src={enrollment.qrDataUrl}
              width={184}
            />
            <div>
              <p>
                휴대폰의 인증 앱에서 QR 코드를 스캔한 뒤 표시되는 코드를
                입력하세요.
              </p>
              {secret && (
                <details className={styles.securityDetails}>
                  <summary>직접 입력 키 보기</summary>
                  <code>{secret}</code>
                </details>
              )}
              <label className={styles.label} htmlFor="totp-code">
                인증 앱 코드
              </label>
              <input
                autoComplete="one-time-code"
                className={styles.input}
                id="totp-code"
                inputMode="numeric"
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                value={code}
              />
              <button
                className={styles.primaryButton}
                disabled={isBusy}
                onClick={verifyEnrollment}
                type="button"
              >
                코드 확인하고 켜기
              </button>
            </div>
          </div>
        </article>
      )}

      <article className={styles.contentCard}>
        <div className={styles.securityCardHeader}>
          <h2 className={styles.panelTitle}>복구 코드</h2>
          <span className={styles.badge}>
            {securityState.recoveryCodes.unused}개 사용 가능
          </span>
        </div>
        <p>
          휴대폰을 잃어버렸을 때 계정 접근을 되찾는 일회용 코드입니다. 새로
          만들면 기존 복구 코드는 모두 폐기됩니다.
        </p>
        {isTotpEnabled && (
          <div className={styles.securityActions}>
            <button
              className={styles.warningButton}
              disabled={isBusy}
              onClick={regenerateCodes}
              type="button"
            >
              복구 코드 재발급
            </button>
          </div>
        )}
        {message && messageContext === "recovery" && (
          <output
            className={
              status === "error" ? styles.securityError : styles.securityNotice
            }
          >
            {message}
          </output>
        )}
        {recoveryCodes.length > 0 && (
          <ol className={styles.recoveryCodeList}>
            {recoveryCodes.map((recoveryCode) => (
              <li key={recoveryCode}>
                <code>{recoveryCode}</code>
              </li>
            ))}
          </ol>
        )}
      </article>
    </div>
  );
}
