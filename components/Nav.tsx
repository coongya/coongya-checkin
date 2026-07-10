"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import KungyaFace from "@/components/KungyaFace";

export function TopBar({ groupName }: { groupName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 메뉴 밖을 누르면 닫기
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

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
        <div className="menu-wrap" ref={menuRef}>
          <button
            className="btn small plain"
            aria-label="메뉴"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            ☰
          </button>
          {open && (
            <div className="menu-drop" role="menu">
              <Link href="/account" role="menuitem" onClick={() => setOpen(false)}>
                내 정보 수정
              </Link>
              <Link href="/groups" role="menuitem" onClick={() => setOpen(false)}>
                그룹 관리
              </Link>
              <button role="menuitem" onClick={logout}>
                로그아웃
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function TabBar({ hasGroup = true }: { hasGroup?: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/dashboard", label: "홈", ico: "🏠", needsGroup: false },
    { href: "/today", label: "오늘", ico: "📸", needsGroup: true },
    { href: "/stats", label: "통계", ico: "📊", needsGroup: true },
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
