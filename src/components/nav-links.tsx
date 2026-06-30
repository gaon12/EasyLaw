"use client";

import { usePathname } from "next/navigation";
import styles from "@/app/page.module.css";

type NavItem = {
  href: string;
  key: string;
  label: string;
};

export function NavLinks({
  items,
  label,
}: {
  items: NavItem[];
  label: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={styles.mainNav} aria-label={label}>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <a
            aria-current={active ? "page" : undefined}
            className={active ? styles.navActive : undefined}
            href={item.href}
            key={item.href}
          >
            <span data-i18n={item.key}>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href.includes("#")) {
    return false;
  }
  const [path] = href.split("#");
  if (!path) {
    return false;
  }
  if (path === "/") {
    return pathname === "/";
  }
  if (path === "/admin") {
    return pathname === "/admin";
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
