"use client";

import { useRef, useState } from "react";
import styles from "@/app/page.module.css";

type OwnedOrganization = {
  id: string;
  name: string;
};

type Member = {
  organizationId: string;
  organizationName: string;
  userId: string;
  email: string;
  role: string;
  isOwner: boolean;
};

function useOrgRequest() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const busyRef = useRef(false);

  async function request(body: Record<string, string>, doneMessage: string) {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    try {
      const response = await fetch("/api/org", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setStatus("error");
        setMessage(data?.message ?? "요청을 처리하지 못했어요.");
        return;
      }
      setStatus("success");
      setMessage(doneMessage);
      window.location.reload();
    } catch {
      setStatus("error");
      setMessage("요청이 끊겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      busyRef.current = false;
    }
  }

  return { message, request, status };
}

function StatusOutput({
  message,
  status,
}: {
  message: string;
  status: "idle" | "success" | "error";
}) {
  if (!message) {
    return null;
  }
  return (
    <output
      className={
        status === "error"
          ? styles.settingsNoticeError
          : styles.settingsNoticeSuccess
      }
    >
      {message}
    </output>
  );
}

export function OrgCreateForm() {
  const [name, setName] = useState("");
  const { message, request, status } = useOrgRequest();

  return (
    <form
      className={styles.orgInlineForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim().length >= 2) {
          void request(
            { action: "create", name: name.trim() },
            "조직을 만들었어요.",
          );
        }
      }}
    >
      <label className={styles.visuallyHidden} htmlFor="org-create-name">
        조직 이름
      </label>
      <input
        className={styles.input}
        id="org-create-name"
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
        placeholder="예: 우리동네 법률구조팀"
        value={name}
      />
      <button
        className={styles.primaryButton}
        disabled={name.trim().length < 2}
        type="submit"
      >
        조직 만들기
      </button>
      <StatusOutput message={message} status={status} />
    </form>
  );
}

export function OrgInviteForm({
  organizations,
}: {
  organizations: OwnedOrganization[];
}) {
  const [organizationId, setOrganizationId] = useState(
    organizations[0]?.id ?? "",
  );
  const [email, setEmail] = useState("");
  const { message, request, status } = useOrgRequest();

  if (organizations.length === 0) {
    return null;
  }

  return (
    <form
      className={styles.orgInlineForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (organizationId && email.trim()) {
          void request(
            { action: "invite", email: email.trim(), organizationId },
            "구성원을 초대했어요. 초대된 이메일로 로그인하면 바로 문서를 볼 수 있어요.",
          );
        }
      }}
    >
      {organizations.length > 1 && (
        <>
          <label className={styles.visuallyHidden} htmlFor="org-invite-org">
            초대할 조직
          </label>
          <select
            className={styles.input}
            id="org-invite-org"
            onChange={(event) => setOrganizationId(event.target.value)}
            value={organizationId}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </>
      )}
      <label className={styles.visuallyHidden} htmlFor="org-invite-email">
        초대할 이메일
      </label>
      <input
        className={styles.input}
        id="org-invite-email"
        maxLength={254}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="초대할 이메일 주소"
        type="email"
        value={email}
      />
      <button
        className={styles.secondaryButton}
        disabled={!email.trim()}
        type="submit"
      >
        초대하기
      </button>
      <StatusOutput message={message} status={status} />
    </form>
  );
}

export function OrgMembersTable({
  canManageOrgIds,
  members,
}: {
  canManageOrgIds: string[];
  members: Member[];
}) {
  const { message, request, status } = useOrgRequest();
  const manageable = new Set(canManageOrgIds);

  return (
    <div className={styles.tableWrap}>
      <StatusOutput message={message} status={status} />
      <table>
        <thead>
          <tr>
            <th>조직</th>
            <th>이메일</th>
            <th>역할</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={`${member.organizationId}-${member.userId}`}>
              <td>{member.organizationName}</td>
              <td>{member.email}</td>
              <td>{member.isOwner ? "소유자" : member.role}</td>
              <td>
                {manageable.has(member.organizationId) && !member.isOwner ? (
                  <button
                    className={styles.ghostButton}
                    onClick={() =>
                      void request(
                        {
                          action: "remove",
                          memberUserId: member.userId,
                          organizationId: member.organizationId,
                        },
                        "구성원을 내보냈어요.",
                      )
                    }
                    type="button"
                  >
                    내보내기
                  </button>
                ) : (
                  <span className={styles.meta}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
