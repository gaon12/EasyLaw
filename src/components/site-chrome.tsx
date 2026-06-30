import { cookies } from "next/headers";
import Image from "next/image";
import type { ReactNode } from "react";
import styles from "@/app/page.module.css";
import {
  BellIcon,
  BuildingIcon,
  FileTextIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
} from "@/components/icons";
import { ReadingPreferences } from "@/components/reading-preferences";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDatabase } from "@/lib/db";
import { getSessionUser, SESSION_COOKIE } from "@/lib/session";

type ShellVariant = "service" | "admin";

const publicNav = [
  { href: "/", key: "nav.service", label: "서비스 소개" },
  { href: "/guide", key: "nav.guide", label: "쉬운 판결문" },
  { href: "/notice", key: "nav.notice", label: "공지사항" },
  { href: "/support", key: "nav.support", label: "고객센터" },
];

const signedInNav = [
  { href: "/", key: "nav.home", label: "홈" },
  { href: "/catalog", key: "nav.catalog", label: "판결문 검색" },
  { href: "/research", key: "nav.research", label: "AI 질문" },
  { href: "/me", key: "nav.me", label: "내 문서함" },
  { href: "/org", key: "nav.org", label: "조직" },
];

const adminNav = [
  { href: "/admin", key: "admin.home", label: "관리 개요" },
  { href: "/admin/llm", key: "admin.llm", label: "LLM API" },
  { href: "/admin/mcp", key: "admin.mcp", label: "MCP 설정" },
  { href: "/admin/captcha", key: "admin.captcha", label: "CAPTCHA" },
  { href: "/admin/dictionary", key: "admin.dictionary", label: "용어 사전" },
  { href: "/admin#jobs", key: "admin.jobs", label: "사용자·작업" },
];

export async function AppHeader({
  variant = "service",
}: {
  variant?: ShellVariant;
}) {
  const sessionUser = getSessionUser(
    getDatabase(),
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  const canSeeAdmin = sessionUser?.role === "super_admin";
  const navItems =
    variant === "admin" ? adminNav : sessionUser ? signedInNav : publicNav;

  return (
    <header className={styles.govHeader}>
      <div className={styles.utilityBar}>
        <div className={styles.utilityInner}>
          <a href="/privacy" data-i18n="nav.privacy">
            개인정보처리방침
          </a>
          <a href="/terms" data-i18n="nav.terms">
            이용약관
          </a>
          <a href="/support" data-i18n="nav.support">
            지원
          </a>
          {canSeeAdmin && (
            <a href="/admin" data-i18n="nav.admin">
              관리센터
            </a>
          )}
        </div>
      </div>
      <div className={styles.brandRow}>
        <a className={styles.brand} href="/" aria-label="EasyLaw 홈">
          <Image
            alt=""
            aria-hidden="true"
            className={styles.brandCharacter}
            height={48}
            src="/brand-character.svg"
            width={46}
          />
          <span className={styles.brandText}>EasyLaw</span>
        </a>
        <div className={styles.headerActions}>
          <a href="/research">
            <SearchIcon size={18} />
            <span data-i18n="nav.research">AI 질문</span>
          </a>
          {sessionUser ? (
            <a className={styles.accountLink} href="/me">
              <span aria-hidden="true">
                {sessionUser.displayName.slice(0, 1)}
              </span>
              {sessionUser.displayName}
            </a>
          ) : (
            <>
              <a href="/login" data-i18n="nav.login">
                로그인
              </a>
              <a href="/signup" data-i18n="nav.signup">
                회원가입
              </a>
            </>
          )}
          <ReadingPreferences />
          <ThemeToggle />
        </div>
      </div>
      <nav
        className={styles.mainNav}
        aria-label={variant === "admin" ? "관리센터 메뉴" : "주요 서비스"}
      >
        {navItems.map((item) => (
          <a href={item.href} key={item.href}>
            <span data-i18n={item.key}>{item.label}</span>
          </a>
        ))}
        {canSeeAdmin && variant !== "admin" && (
          <a href="/admin" data-i18n="nav.admin">
            관리센터
          </a>
        )}
      </nav>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <a className={styles.footerBrand} href="/">
          <Image
            alt=""
            aria-hidden="true"
            className={styles.footerCharacter}
            height={42}
            src="/brand-character.svg"
            width={40}
          />
          <span>EasyLaw</span>
        </a>
        <p>
          EasyLaw는 판결문 이해를 돕는 서비스예요. 법률 자문을 대체하지 않으며,
          중요한 판단은 변호사 등 전문가와 확인해 주세요.
        </p>
        <div className={styles.footerLinks}>
          <a href="/support" data-i18n="nav.support">
            고객센터
          </a>
          <a href="/privacy" data-i18n="nav.privacy">
            개인정보처리방침
          </a>
          <a href="/terms" data-i18n="nav.terms">
            이용약관
          </a>
        </div>
      </div>
    </footer>
  );
}

export function AppShell({
  children,
  variant = "service",
}: {
  children: ReactNode;
  variant?: ShellVariant;
}) {
  return (
    <div className={styles.shell}>
      <AppHeader variant={variant} />
      {children}
      <AppFooter />
    </div>
  );
}

export const serviceShortcuts = [
  {
    href: "/catalog",
    icon: FileTextIcon,
    label: "판결문 검색",
    description: "사건번호와 법원명으로 판결문을 찾아요",
  },
  {
    href: "/research",
    icon: ShieldIcon,
    label: "AI 질문",
    description: "상황을 자연어로 쓰고 근거 후보를 함께 확인해요",
  },
  {
    href: "/me",
    icon: BellIcon,
    label: "알림 확인",
    description: "생성 중인 판결문 알림을 관리해요",
  },
  {
    href: "/org",
    icon: BuildingIcon,
    label: "조직 문서함",
    description: "팀과 공유한 문서를 한곳에서 봐요",
  },
  {
    href: "/security",
    icon: ShieldIcon,
    label: "계정 보호 설정",
    description: "로그인 확인과 복구 코드를 관리해요",
  },
  {
    href: "/admin",
    icon: SettingsIcon,
    label: "운영 관리",
    description: "큐와 오류, 감사 로그를 확인해요",
  },
];
