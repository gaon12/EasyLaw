"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

type TestKind = "llm" | "mcp";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describeLlmResult(data: unknown) {
  if (!isRecord(data)) {
    return { detail: "", message: "응답 형식을 확인하지 못했어요." };
  }
  if (data.ok === true) {
    const latency =
      typeof data.latencyMs === "number"
        ? `${(data.latencyMs / 1000).toFixed(1)}초`
        : "";
    return {
      detail:
        typeof data.sample === "string" ? `모델 응답: ${data.sample}` : "",
      message: `연결 성공 (${String(data.model ?? "")}, ${latency})`,
    };
  }
  return {
    detail: "",
    message:
      typeof data.message === "string"
        ? data.message
        : "LLM 연결 테스트에 실패했어요.",
  };
}

function describeMcpResult(data: unknown) {
  if (!isRecord(data) || !Array.isArray(data.servers)) {
    return { detail: "", message: "응답 형식을 확인하지 못했어요." };
  }
  if (data.servers.length === 0) {
    return {
      detail: "",
      message:
        "설정된 MCP 엔드포인트가 없어요. 내부 법률 데이터 검색 도구만 사용됩니다.",
    };
  }
  const lines = data.servers.map((server) => {
    if (!isRecord(server)) {
      return "";
    }
    if (server.ok === true) {
      const tools = Array.isArray(server.tools) ? server.tools.length : 0;
      return `✓ ${String(server.label)}: 도구 ${tools}개`;
    }
    return `✕ ${String(server.label)}: ${String(server.error ?? "연결 실패")}`;
  });
  return {
    detail: lines.filter(Boolean).join("\n"),
    message:
      data.ok === true
        ? "모든 MCP 서버에 연결했어요."
        : "일부 MCP 서버에 연결하지 못했어요.",
  };
}

export function ConnectionTestButton({ kind }: { kind: TestKind }) {
  const [state, setState] = useState<"idle" | "testing" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const runningRef = useRef(false);

  async function runTest() {
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;
    setState("testing");
    setMessage(
      kind === "llm"
        ? "저장된 설정으로 모델에 짧은 질문을 보내고 있어요. 로컬 모델은 수 분 걸릴 수 있어요."
        : "설정된 MCP 서버에 연결해 도구 목록을 확인하고 있어요.",
    );
    setDetail("");
    try {
      const response = await fetch(`/api/admin/${kind}/test`, {
        method: "POST",
      });
      const data: unknown = await response.json().catch(() => null);
      const described =
        kind === "llm" ? describeLlmResult(data) : describeMcpResult(data);
      setMessage(described.message);
      setDetail(described.detail);
      setState(
        response.ok && isRecord(data) && data.ok === true ? "success" : "error",
      );
    } catch {
      setState("error");
      setMessage("테스트 요청이 끊겼어요. 서버 로그를 확인해 주세요.");
    } finally {
      runningRef.current = false;
    }
  }

  return (
    <div className={styles.connectionTest}>
      <button
        className={styles.secondaryButton}
        disabled={state === "testing"}
        onClick={() => void runTest()}
        type="button"
      >
        {state === "testing"
          ? "확인 중"
          : kind === "llm"
            ? "저장된 설정으로 연결 테스트"
            : "MCP 서버 연결 테스트"}
      </button>
      {message && (
        <output
          className={
            state === "error"
              ? styles.settingsNoticeError
              : state === "success"
                ? styles.settingsNoticeSuccess
                : styles.settingsNotice
          }
        >
          {message}
          {detail && (
            <span className={styles.connectionTestDetail}>{detail}</span>
          )}
        </output>
      )}
    </div>
  );
}
