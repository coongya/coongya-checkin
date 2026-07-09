import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { TopBar, TabBar } from "@/components/Nav";
import GroupsClient from "@/components/GroupsClient";

export const dynamic = "force-dynamic";

// 그룹 탭 — 참여하기 + 만들기만. 참여 중인 그룹 목록은 "오늘" 화면에서 본다.
export default async function GroupsPage() {
  const auth = await getAuthed();
  if (!auth) redirect("/");

  return (
    <>
      <TopBar groupName="" />
      <main className="container">
        {auth.memberships.length === 0 && (
          <p className="muted" style={{ margin: "0 0 10px" }}>
            아직 참여한 그룹이 없어요. 그룹을 만들거나 초대코드로 참여해 보세요!
          </p>
        )}
        <GroupsClient />
      </main>
      <TabBar hasGroup={auth.memberships.length > 0} />
    </>
  );
}
