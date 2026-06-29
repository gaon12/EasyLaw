"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";
import {
  ChevronRightIcon,
  FileTextIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/components/icons";
import type { InstallationStatus } from "@/lib/setup";
import styles from "./setup.module.css";

type Enrollment = {
  otpauthUrl: string;
  qrDataUrl: string;
};

type SetupStatus = {
  status: InstallationStatus;
  sessionAuthenticated: boolean;
};

type Stage =
  | "unlock"
  | "configure"
  | "email_pending"
  | "totp_pending"
  | "complete";

const stageNumber: Record<Stage, number> = {
  unlock: 1,
  configure: 2,
  email_pending: 3,
  totp_pending: 4,
  complete: 4,
};

const progressSteps = ["service", "admin", "email", "security"];

function initialStage(status: SetupStatus): Stage {
  if (!status.sessionAuthenticated) {
    return "unlock";
  }
  if (status.status === "email_pending") {
    return "email_pending";
  }
  if (status.status === "totp_pending") {
    return "totp_pending";
  }
  return "configure";
}

function errorMessage(error: string | undefined) {
  const messages: Record<string, string> = {
    email_delivery_failed:
      "인증 이메일을 보내지 못했어요. 발송 설정을 확인해 주세요.",
    email_test_failed:
      "테스트 메일을 보내지 못했어요. API 키와 발신 정보를 확인해 주세요.",
    api_test_required: "API 키 테스트를 먼저 통과해 주세요.",
    invalid_code: "코드가 올바르지 않거나 유효 시간이 지났어요.",
    invalid_request: "입력한 내용을 다시 확인해 주세요.",
    rate_limited: "시도 횟수가 많아요. 잠시 후 다시 시도해 주세요.",
    unauthorized: "설치 세션이 만료되었어요. 설치 코드를 다시 입력해 주세요.",
  };
  return messages[error ?? ""] ?? "요청을 처리하지 못했어요.";
}

async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "request_failed");
  }
  return data;
}

export function SetupWizard({ initialStatus }: { initialStatus: SetupStatus }) {
  const [stage, setStage] = useState<Stage>(() => initialStage(initialStatus));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [apiTestPassed, setApiTestPassed] = useState(false);
  const [config, setConfig] = useState({
    serviceName: "EasyLaw",
    adminName: "",
    adminEmail: "",
    resendApiKey: "",
    fromName: "EasyLaw",
    fromAddress: "",
  });

  useEffect(() => {
    if (stage !== "totp_pending" || enrollment) {
      return;
    }
    fetch("/api/setup/enrollment")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error);
        }
        setEnrollment(data.enrollment);
      })
      .catch((error: Error) => setMessage(errorMessage(error.message)));
  }, [stage, enrollment]);

  async function submit(action: () => Promise<void>, pendingMessage = "") {
    setBusy(true);
    setMessage(pendingMessage);
    try {
      await action();
    } catch (error) {
      setMessage(errorMessage(error instanceof Error ? error.message : ""));
    } finally {
      setBusy(false);
    }
  }

  function unlock(event: FormEvent) {
    event.preventDefault();
    void submit(async () => {
      const data = await postJson("/api/setup/unlock", { code: setupCode });
      setMessage("");
      setStage(
        initialStage({
          status: data.status,
          sessionAuthenticated: true,
        }),
      );
    });
  }

  function configure(event: FormEvent) {
    event.preventDefault();
    void submit(async () => {
      await postJson("/api/setup/configure", config);
      setMessage("인증 코드를 이메일로 보냈어요.");
      setStage("email_pending");
    }, "메일 발송 설정을 확인하고 있어요.");
  }

  function testEmailConfiguration() {
    void submit(async () => {
      await postJson("/api/setup/test-email", {
        adminEmail: config.adminEmail,
        resendApiKey: config.resendApiKey,
        fromName: config.fromName,
        fromAddress: config.fromAddress,
      });
      setApiTestPassed(true);
      setMessage("테스트 메일을 보냈어요. API 키와 발신 정보를 확인했습니다.");
    }, "테스트 메일을 보내고 있어요.");
  }

  function verifyEmail(event: FormEvent) {
    event.preventDefault();
    void submit(async () => {
      const data = await postJson("/api/setup/verify-email", {
        code: emailCode,
      });
      setEnrollment(data.enrollment);
      setMessage("");
      setStage("totp_pending");
    });
  }

  function verifyAuthenticator(event: FormEvent) {
    event.preventDefault();
    void submit(async () => {
      const data = await postJson("/api/setup/complete", { code: authCode });
      setRecoveryCodes(data.recoveryCodes);
      setMessage("");
      setStage("complete");
    });
  }

  const manualKey = enrollment
    ? new URL(enrollment.otpauthUrl).searchParams.get("secret")
    : null;

  return (
    <main className={styles.setupShell}>
      <div className={styles.setupWindow}>
        <header className={styles.setupHeader}>
          <a className={styles.setupBrand} href="/setup">
            <span className={styles.setupSymbol} aria-hidden="true" />
            <span>EasyLaw</span>
          </a>
          <span className={styles.stepLabel}>
            {stage === "complete" ? "설치 완료" : `${stageNumber[stage]} / 4`}
          </span>
        </header>

        <div className={styles.progress} aria-hidden="true">
          {progressSteps.map((step, index) => (
            <span
              className={
                index < stageNumber[stage] ? styles.progressActive : undefined
              }
              key={step}
            />
          ))}
        </div>

        <section className={styles.setupContent}>
          {stage === "unlock" && (
            <>
              <div className={styles.heroIcon}>
                <SparklesIcon size={30} />
              </div>
              <p className={styles.eyebrow}>처음 만나서 반가워요</p>
              <h1>EasyLaw를 설정해 볼까요?</h1>
              <p className={styles.lead}>
                이 과정에서 서비스 정보와 최고 관리자 계정을 안전하게
                준비합니다. 서버 로그에 표시된 설치 코드를 입력해 주세요.
              </p>
              <form className={styles.setupForm} onSubmit={unlock}>
                <label htmlFor="setup-code">설치 코드</label>
                <input
                  autoComplete="one-time-code"
                  id="setup-code"
                  onChange={(event) => setSetupCode(event.target.value)}
                  placeholder="XXXX-XXXX-XXXX"
                  required
                  value={setupCode}
                />
                <p className={styles.fieldHelp}>
                  설치 코드는 서버를 실행한 터미널에서만 확인할 수 있어요.
                </p>
                <button
                  className={styles.nextButton}
                  disabled={busy}
                  type="submit"
                >
                  계속
                  <ChevronRightIcon size={19} />
                </button>
              </form>
            </>
          )}

          {stage === "configure" && (
            <>
              <p className={styles.eyebrow}>기본 설정</p>
              <h1>서비스와 관리자 정보를 입력하세요</h1>
              <p className={styles.lead}>
                입력한 정보는 이 서버의 암호화된 데이터베이스에 저장됩니다.
              </p>
              <form className={styles.setupForm} onSubmit={configure}>
                <div className={styles.formGrid}>
                  <label>
                    서비스 이름
                    <input
                      onChange={(event) =>
                        setConfig({
                          ...config,
                          serviceName: event.target.value,
                        })
                      }
                      required
                      value={config.serviceName}
                    />
                  </label>
                  <label>
                    관리자 이름
                    <input
                      autoComplete="name"
                      onChange={(event) =>
                        setConfig({ ...config, adminName: event.target.value })
                      }
                      required
                      value={config.adminName}
                    />
                  </label>
                  <label>
                    관리자 이메일
                    <input
                      autoComplete="email"
                      onChange={(event) => {
                        setConfig({
                          ...config,
                          adminEmail: event.target.value,
                        });
                        setApiTestPassed(false);
                      }}
                      required
                      type="email"
                      value={config.adminEmail}
                    />
                  </label>
                  <label className={styles.fullField}>
                    Resend API 키
                    <input
                      autoComplete="off"
                      onChange={(event) => {
                        setConfig({
                          ...config,
                          resendApiKey: event.target.value,
                        });
                        setApiTestPassed(false);
                      }}
                      placeholder="re_..."
                      required
                      type="password"
                      value={config.resendApiKey}
                    />
                  </label>
                  <label>
                    보내는 이름
                    <input
                      onChange={(event) => {
                        setConfig({
                          ...config,
                          fromName: event.target.value,
                        });
                        setApiTestPassed(false);
                      }}
                      required
                      value={config.fromName}
                    />
                  </label>
                  <label>
                    보내는 이메일
                    <input
                      onChange={(event) => {
                        setConfig({
                          ...config,
                          fromAddress: event.target.value,
                        });
                        setApiTestPassed(false);
                      }}
                      placeholder="hello@example.com"
                      required
                      type="email"
                      value={config.fromAddress}
                    />
                  </label>
                </div>
                <div className={styles.apiTestPanel}>
                  <div>
                    <strong>이메일 발송 테스트</strong>
                    <p>
                      위 발신 정보로 관리자 이메일에 테스트 메일을 보냅니다.
                    </p>
                  </div>
                  <button
                    className={styles.testButton}
                    disabled={
                      busy ||
                      !config.adminEmail ||
                      !config.resendApiKey ||
                      !config.fromName ||
                      !config.fromAddress
                    }
                    onClick={testEmailConfiguration}
                    type="button"
                  >
                    {apiTestPassed ? "테스트 통과" : "API 키 테스트"}
                  </button>
                </div>
                <button
                  className={styles.nextButton}
                  disabled={busy || !apiTestPassed}
                  type="submit"
                >
                  {busy ? "확인 중..." : "저장하고 인증 메일 보내기"}
                  {!busy && <ChevronRightIcon size={19} />}
                </button>
              </form>
            </>
          )}

          {stage === "email_pending" && (
            <>
              <div className={styles.heroIcon}>
                <FileTextIcon size={29} />
              </div>
              <p className={styles.eyebrow}>이메일 확인</p>
              <h1>받은 편지함을 확인해 주세요</h1>
              <p className={styles.lead}>
                최고 관리자 계정에 사용할 이메일로 6자리 코드를 보냈어요.
              </p>
              <form className={styles.setupForm} onSubmit={verifyEmail}>
                <label htmlFor="email-code">이메일 인증 코드</label>
                <input
                  autoComplete="one-time-code"
                  className={styles.codeInput}
                  id="email-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    setEmailCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="000000"
                  required
                  value={emailCode}
                />
                <button
                  className={styles.nextButton}
                  disabled={busy}
                  type="submit"
                >
                  이메일 확인
                  <ChevronRightIcon size={19} />
                </button>
                <button
                  className={styles.textButton}
                  disabled={busy}
                  onClick={() =>
                    void submit(async () => {
                      await postJson("/api/setup/resend-email");
                      setMessage("새 인증 코드를 보냈어요.");
                    })
                  }
                  type="button"
                >
                  인증 코드 다시 보내기
                </button>
              </form>
            </>
          )}

          {stage === "totp_pending" && (
            <>
              <div className={styles.heroIcon}>
                <ShieldIcon size={30} />
              </div>
              <p className={styles.eyebrow}>계정 보호</p>
              <h1>2차 인증을 설정하세요</h1>
              <p className={styles.lead}>
                인증 앱으로 QR 코드를 스캔한 뒤 표시되는 6자리 코드를 입력해
                주세요.
              </p>
              {enrollment ? (
                <div className={styles.authenticatorLayout}>
                  <div className={styles.qrWrap}>
                    <Image
                      alt="2차 인증 QR 코드"
                      height={196}
                      src={enrollment.qrDataUrl}
                      unoptimized
                      width={196}
                    />
                  </div>
                  <form
                    className={styles.setupForm}
                    onSubmit={verifyAuthenticator}
                  >
                    <label htmlFor="auth-code">인증 앱 코드</label>
                    <input
                      autoComplete="one-time-code"
                      className={styles.codeInput}
                      id="auth-code"
                      inputMode="numeric"
                      maxLength={8}
                      onChange={(event) =>
                        setAuthCode(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder="000000"
                      required
                      value={authCode}
                    />
                    {manualKey && (
                      <details className={styles.manualKey}>
                        <summary>직접 입력 키 보기</summary>
                        <code>{manualKey}</code>
                      </details>
                    )}
                    <button
                      className={styles.nextButton}
                      disabled={busy}
                      type="submit"
                    >
                      설치 완료
                      <ChevronRightIcon size={19} />
                    </button>
                  </form>
                </div>
              ) : (
                <p className={styles.loading}>QR 코드를 준비하고 있어요...</p>
              )}
            </>
          )}

          {stage === "complete" && (
            <>
              <div className={`${styles.heroIcon} ${styles.successIcon}`}>
                <ShieldIcon size={30} />
              </div>
              <p className={styles.eyebrow}>준비 완료</p>
              <h1>EasyLaw를 사용할 준비가 됐어요</h1>
              <p className={styles.lead}>
                이 복구 코드는 인증 앱을 사용할 수 없을 때 필요합니다. 지금
                안전한 곳에 보관해 주세요.
              </p>
              <div className={styles.recoveryCodes}>
                {recoveryCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
              <a className={styles.nextButton} href="/">
                EasyLaw 시작하기
                <ChevronRightIcon size={19} />
              </a>
            </>
          )}

          {message && (
            <output className={styles.setupMessage}>{message}</output>
          )}
        </section>
      </div>
    </main>
  );
}
