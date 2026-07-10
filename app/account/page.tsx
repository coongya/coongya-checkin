import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { TopBar, TabBar } from "@/components/Nav";
import { AccountSettings, PinChange } from "@/components/SettingsForms";

export const dynamic = "force-dynamic";

// 내 정보 수정 — 햄버거 메뉴에서 진입. 계정 전체(모든 그룹)에 적용되는 설정.
export default async function Account() {
  const auth = await getAuthed();
  if (!auth) redirect("/");

  return (
    <>
      <TopBar groupName="" />
      <main className="container">
        <div className="backrow">
          <Link href="/dashboard" className="back-btn" aria-label="홈으로">
            ←
          </Link>
          <h1>내 정보 수정</h1>
        </div>
        <p className="muted" style={{ margin: "0 0 10px" }}>
          로그인 이메일: <b>{auth.user.email}</b> · 여기서 바꾼 내용은 모든 그룹에
          적용돼요.
        </p>
        <AccountSettings username={auth.user.username} avatar={auth.user.avatar} />
        <PinChange />
      </main>
      <TabBar hasGroup={auth.memberships.length > 0} />
    </>
  );
}
