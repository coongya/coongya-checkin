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
        <Link href="/dashboard" className="brand">
          <span className="mascot">
            <KungyaFace avatar="onion" size={26} />
          </span>
          쿵야출근단
          <span className="grp">· {groupName}</span>
        </Link>
        <button className="btn small plain" onClick={logout}>
          로그아웃
        </button>
      </div>
    </header>
  );
}

export function TabBar() {
  const path = usePathname();
  const tabs = [
    { href: "/dashboard", label: "오늘", ico: "🏠" },
    { href: "/stats", label: "통계", ico: "📊" },
    { href: "/settings", label: "설정", ico: "⚙️" },
  ];
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={path?.startsWith(t.href) ? "active" : ""}>
          <span className="ico">{t.ico}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
