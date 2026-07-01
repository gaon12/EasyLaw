import Link from "next/link";
import styles from "@/app/page.module.css";

const adminAiNavItems = [
  { href: "/admin/ai", key: "overview", label: "개요" },
  { href: "/admin/ai/llm", key: "llm", label: "모델 API" },
  { href: "/admin/ai/mcp", key: "mcp", label: "도구 연결" },
] as const;

type AdminAiNavKey = (typeof adminAiNavItems)[number]["key"];

export function AdminAiSubnav({ active }: { active: AdminAiNavKey }) {
  return (
    <nav className={styles.subNav} aria-label="AI 설정 하위 메뉴">
      {adminAiNavItems.map((item) => (
        <Link
          aria-current={active === item.key ? "page" : undefined}
          className={active === item.key ? styles.subNavActive : undefined}
          href={item.href}
          key={item.key}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
