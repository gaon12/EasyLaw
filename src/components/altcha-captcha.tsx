"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/page.module.css";

type AltchaEvent = CustomEvent<{ payload?: string; state?: string }>;

export function AltchaCaptcha({
  onVerified,
  resetKey,
}: {
  onVerified: (payload: string) => void;
  resetKey?: string | number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState(
    "체크박스를 누르면 브라우저에서 조용히 확인해요.",
  );

  useEffect(() => {
    let widget: HTMLElement | null = null;
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    if (resetKey !== undefined) {
      mount.dataset.resetKey = String(resetKey);
    }
    mount.replaceChildren();
    setStatus("체크박스를 누르면 브라우저에서 조용히 확인해요.");

    void import("altcha/i18n").then(() => {
      if (disposed) {
        return;
      }

      widget = document.createElement("altcha-widget");
      widget.setAttribute("auto", "off");
      widget.setAttribute("challenge", "/api/captcha/challenge");
      widget.setAttribute(
        "configuration",
        JSON.stringify({
          hideFooter: true,
          hideLogo: true,
          minDuration: 650,
        }),
      );
      widget.setAttribute("display", "standard");
      widget.setAttribute("language", browserLanguage());
      widget.setAttribute("name", "altcha");
      widget.setAttribute("type", "checkbox");

      widget.addEventListener("statechange", handleStateChange);
      widget.addEventListener("verified", handleVerified);
      mount.append(widget);
    });

    return () => {
      disposed = true;
      if (widget) {
        widget.removeEventListener("statechange", handleStateChange);
        widget.removeEventListener("verified", handleVerified);
      }
      mount.replaceChildren();
    };

    function handleStateChange(event: Event) {
      const state = (event as AltchaEvent).detail?.state;
      if (state === "verifying") {
        setStatus("방패 도장이 찍히는 중이에요.");
      }
      if (state === "verified") {
        setStatus("확인됐어요. 요청을 이어갈게요.");
      }
      if (state === "error" || state === "expired") {
        setStatus("확인 시간이 지났어요. 새로고침 후 다시 시도해 주세요.");
      }
    }

    function handleVerified(event: Event) {
      const payload = (event as AltchaEvent).detail?.payload;
      if (payload) {
        onVerified(payload);
      }
    }
  }, [onVerified, resetKey]);

  return (
    <section className={styles.captchaCard} aria-label="보안 확인">
      <div>
        <span aria-hidden="true">🛡️</span>
        <div>
          <strong>잠깐만요, 꼬마 방패가 확인 중이에요</strong>
          <p>ALTCHA로 개인정보 없는 작업 증명만 확인합니다.</p>
        </div>
      </div>
      <div ref={mountRef} className={styles.altchaMount} />
      <small>{status}</small>
    </section>
  );
}

function browserLanguage() {
  const language = navigator.language.toLowerCase();
  if (language.startsWith("zh-hans") || language.startsWith("zh-cn")) {
    return "zh-cn";
  }
  if (language.startsWith("zh-hant") || language.startsWith("zh-tw")) {
    return "zh-tw";
  }
  return language.split("-")[0] || "ko";
}
