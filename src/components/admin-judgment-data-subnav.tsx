import Link from "next/link";
import styles from "@/app/page.module.css";

const adminJudgmentDataNavItems = [
  { href: "/admin/judgments/open-law", key: "openLaw", label: "API 설정" },
  {
    href: "/admin/judgments/collection",
    key: "collection",
    label: "자동 수집",
  },
] as const;

type AdminJudgmentDataNavKey =
  (typeof adminJudgmentDataNavItems)[number]["key"];

export function AdminJudgmentDataSubnav({
  active,
}: {
  active: AdminJudgmentDataNavKey;
}) {
  return (
    <nav className={styles.subNav} aria-label="판결문 데이터 하위 메뉴">
      {adminJudgmentDataNavItems.map((item) => (
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
