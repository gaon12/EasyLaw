import Image from "next/image";
import type { ReactNode } from "react";
import styles from "@/app/page.module.css";
import {
  BellIcon,
  BuildingIcon,
  FileTextIcon,
  LoginIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  UserPlusIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

const mainNav = [
  { href: "/catalog", label: "판결문 찾기" },
  { href: "/guide", label: "쉬운 판결문" },
  { href: "/notice", label: "공지사항" },
  { href: "/me", label: "내 문서함" },
  { href: "/org", label: "조직" },
  { href: "/support", label: "고객센터" },
];

export function AppHeader() {
  return (
    <header className={styles.govHeader}>
      <div className={styles.utilityBar}>
        <div className={styles.utilityInner}>
          <a href="/guide">쉬운말 안내</a>
          <a href="/security">보안</a>
          <a href="/support">지원</a>
          <a href="/admin">관리센터</a>
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
          <a href="/search">
            <SearchIcon size={18} />
            통합검색
          </a>
          <a href="/login">
            <LoginIcon size={18} />
            로그인
          </a>
          <a href="/signup">
            <UserPlusIcon size={18} />
            회원가입
          </a>
          <ThemeToggle />
        </div>
      </div>
      <nav className={styles.mainNav} aria-label="주요 서비스">
        {mainNav.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
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
          <a href="/support">고객센터</a>
          <a href="/security">보안 안내</a>
          <a href="/guide">쉬운말 작성 원칙</a>
        </div>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <AppHeader />
      {children}
      <AppFooter />
    </div>
  );
}

export const serviceShortcuts = [
  {
    href: "/catalog",
    icon: FileTextIcon,
    label: "판결문 찾기",
    description: "사건번호와 법원명으로 판결문을 찾아요",
  },
  {
    href: "/guide",
    icon: ShieldIcon,
    label: "쉬운 설명 보기",
    description: "핵심 판단과 어려운 용어를 나눠서 읽어요",
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
    label: "2차 인증 설정",
    description: "중요 계정의 보안을 한 단계 높여요",
  },
  {
    href: "/admin",
    icon: SettingsIcon,
    label: "운영 관리",
    description: "큐와 오류, 감사 로그를 확인해요",
  },
];
