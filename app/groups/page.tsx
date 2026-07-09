import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import { TopBar, TabBar } from "@/components/Nav";
import GroupsClient from "@/components/GroupsClient";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const auth = await getAuthed();
  if (!auth) redirect("/");

  const groups = auth.memberships.map(({ member, group }) => ({
    groupId: group.id,
    name: group.name,
    inviteCode: group.invite_code,
    scheduledTime: member.scheduled_time,
    isAdmin: member.is_admin,
    isCurrent: auth.current?.group.id === group.id,
  }));

  return (
    <>
      <TopBar groupName={auth.current?.group.name ?? ""} />
      <main className="container">
        <GroupsClient groups={groups} />
      </main>
      <TabBar hasGroup={!!auth.current} />
    </>
  );
}
