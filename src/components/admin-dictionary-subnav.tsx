import Link from "next/link";
import styles from "@/app/page.module.css";

const adminDictionaryNavItems = [
  {
    href: "/admin/dictionary#dictionary-update",
    key: "update",
    label: "공개 사전 데이터 업데이트",
  },
  {
    href: "/admin/dictionary#legal-terms",
    key: "legal",
    label: "자체 법률 용어 사전",
  },
  {
    href: "/admin/dictionary#dictionary-latest",
    key: "latest",
    label: "최근 업데이트",
  },
  {
    href: "/admin/dictionary#dictionary-events",
    key: "events",
    label: "최근 작업 기록",
  },
] as const;

type AdminDictionaryNavKey = (typeof adminDictionaryNavItems)[number]["key"];

export function AdminDictionarySubnav({
  active = "update",
}: {
  active?: AdminDictionaryNavKey;
}) {
  return (
    <nav className={styles.subNav} aria-label="용어 사전 하위 메뉴">
      {adminDictionaryNavItems.map((item) => (
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
