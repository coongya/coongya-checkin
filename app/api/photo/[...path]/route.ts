// 비공개 사진 프록시 — 사진 주인과 같은 그룹에 속한 사용자만 열람 가능
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  // 세션 쿠키만 검증 (DB 왕복 없음) — 아래 조회들을 병렬로 돌리기 위함
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { path } = await ctx.params;
  const key = path.join("/");

  // 경로 형식: u/{ownerUserId}/{date}/{file}
  const parts = key.split("/");
  if (parts[0] !== "u" || parts.length < 3) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const ownerUserId = parts[1];

  const d = await db();
  let photo: Awaited<ReturnType<typeof d.getPhoto>>;
  if (ownerUserId === session.userId) {
    // 본인 사진 — 바로 다운로드
    photo = await d.getPhoto(key);
  } else {
    // 사진 주인과 공유하는 그룹이 있는지 확인하면서 다운로드도 병렬로 시작
    const [myMemberships, ownerMemberships, downloaded] = await Promise.all([
      d.listMembershipsByUser(session.userId),
      d.listMembershipsByUser(ownerUserId),
      d.getPhoto(key),
    ]);
    const myGroupIds = new Set(myMemberships.map((m) => m.group.id));
    const shared = ownerMemberships.some((m) => myGroupIds.has(m.group.id));
    if (!shared) {
      console.error(`[photo] 접근 거부(공유 그룹 없음): viewer=${session.userId} path=${key}`);
      return new NextResponse("Forbidden", { status: 403 });
    }
    photo = downloaded;
  }

  if (!photo) {
    // Vercel 로그에서 원인 확인용 — Storage에 파일이 없거나 다운로드 실패
    console.error(`[photo] 파일을 찾을 수 없음: path=${key}`);
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
