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
  // 접근 검증 — 본인이 아니면 사진 주인과 공유하는 그룹이 있는지 확인
  if (ownerUserId !== session.userId) {
    const [myMemberships, ownerMemberships] = await Promise.all([
      d.listMembershipsByUser(session.userId),
      d.listMembershipsByUser(ownerUserId),
    ]);
    const myGroupIds = new Set(myMemberships.map((m) => m.group.id));
    const shared = ownerMemberships.some((m) => myGroupIds.has(m.group.id));
    if (!shared) {
      console.error(`[photo] 접근 거부(공유 그룹 없음): viewer=${session.userId} path=${key}`);
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  // Supabase Storage면 시간제한 서명 URL로 리다이렉트 — 브라우저가 CDN에서 직접
  // 받아 함수를 통한 바이트 중계가 없어지고 훨씬 빠르다.
  const signed = await d.getPhotoSignedUrl(key);
  if (signed) {
    return NextResponse.redirect(signed, {
      status: 302,
      headers: { "Cache-Control": "private, max-age=300" }, // 서명 유효(10분)보다 짧게
    });
  }

  // 서명 URL 미지원(로컬 mock) — 기존처럼 직접 서빙
  const photo = await d.getPhoto(key);
  if (!photo) {
    // Vercel 로그에서 원인 확인용 — Storage에 파일이 없거나 다운로드 실패
    console.error(`[photo] 파일을 찾을 수 없음: path=${key}`);
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
