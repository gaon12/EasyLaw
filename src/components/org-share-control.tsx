"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

type Organization = {
  id: string;
  name: string;
};

export function OrgShareControl({
  judgmentId,
  organizations,
  sharedOrganizationId,
}: {
  judgmentId: string;
  organizations: Organization[];
  sharedOrganizationId: string | null;
}) {
  const [selected, setSelected] = useState(sharedOrganizationId ?? "");
  const [message, setMessage] = useState(
    sharedOrganizationId
      ? "이 문서는 조직에 공유되어 있어요. 조직 구성원이 열람할 수 있습니다."
      : "조직을 선택해 공유하면 구성원이 이 문서를 열람할 수 있어요.",
  );
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const busyRef = useRef(false);

  async function apply(organizationId: string | null) {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/custom-judgments/${encodeURIComponent(judgmentId)}/share`,
        {
          body: JSON.stringify({ organizationId }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setStatus("error");
        setMessage(data?.message ?? "공유 설정을 저장하지 못했어요.");
        return;
      }
      setStatus("success");
      setMessage(
        organizationId
          ? "조직에 공유했어요. 구성원이 이 문서를 열람할 수 있습니다."
          : "공유를 해제했어요. 이제 본인만 볼 수 있습니다.",
      );
    } catch {
      setStatus("error");
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
  }

  if (organizations.length === 0) {
    return null;
  }

  return (
    <section className={styles.orgShareControl}>
      <div>
        <h2>조직 공유</h2>
        <output
          className={
            status === "error"
              ? styles.settingsNoticeError
              : status === "success"
                ? styles.settingsNoticeSuccess
                : styles.settingsNotice
          }
        >
          {message}
        </output>
      </div>
      <div className={styles.orgShareActions}>
        <label className={styles.visuallyHidden} htmlFor="org-share-select">
          공유할 조직
        </label>
        <select
          className={styles.input}
          id="org-share-select"
          onChange={(event) => setSelected(event.target.value)}
          value={selected}
        >
          <option value="">공유 안 함 (비공개)</option>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
        <button
          className={styles.secondaryButton}
          disabled={isSaving}
          onClick={() => void apply(selected || null)}
          type="button"
        >
          {isSaving ? "저장 중" : "공유 설정 저장"}
        </button>
      </div>
    </section>
  );
}
