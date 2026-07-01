"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/page.module.css";

type AccountMenuProps = {
  canSeeAdmin: boolean;
  displayName: string;
  email: string;
};

export function AccountMenu({
  canSeeAdmin,
  displayName,
  email,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  return (
    <div className={styles.accountMenu} ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={styles.accountButton}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true" className={styles.accountAvatar}>
          {displayName.slice(0, 1)}
        </span>
        <span>{displayName}</span>
      </button>
      {open && (
        <div className={styles.accountPanel} role="menu">
          <div className={styles.accountSummary}>
            <strong>{displayName}</strong>
            <span>{email}</span>
          </div>
          <a href="/me" role="menuitem">
            내 문서함
          </a>
          <a href="/security" role="menuitem">
            계정 보안 설정
          </a>
          {canSeeAdmin && (
            <a href="/admin" role="menuitem">
              관리센터
            </a>
          )}
          <button onClick={() => void logout()} role="menuitem" type="button">
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
