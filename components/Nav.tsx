"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import KungyaFace from "@/components/KungyaFace";

export function TopBar({ groupName }: { groupName: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <Link
            href="/dashboard"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <span className="mascot">
              <KungyaFace avatar="onion" size={26} />
            </span>
            쿵야출근단
          </Link>
          {groupName && <span className="grp">· {groupName}</span>}
        </div>
        <button className="btn small plain" onClick={logout}>
          로그아웃
        </button>
      </div>
    </header>
  );
}

export function TabBar({ hasGroup = true }: { hasGroup?: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/dashboard", label: "오늘", ico: "🏠", needsGroup: true },
    { href: "/stats", label: "통계", ico: "📊", needsGroup: true },
    { href: "/groups", label: "그룹", ico: "👥", needsGroup: false },
    { href: "/settings", label: "설정", ico: "⚙️", needsGroup: true },
  ];
  return (
    <nav className="tabbar">
      {tabs
        .filter((t) => hasGroup || !t.needsGroup)
        .map((t) => (
          <Link key={t.href} href={t.href} className={path?.startsWith(t.href) ? "active" : ""}>
            <span className="ico">{t.ico}</span>
            {t.label}
          </Link>
        ))}
    </nav>
  );
}
