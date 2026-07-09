// MOCK_DB 모드에서 인메모리 사진을 서빙 (Supabase 모드에선 public URL 사용)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const auth = await getAuthed();
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });

  const { path } = await ctx.params;
  const key = path.join("/");
  // 같은 그룹의 사진만 접근 가능
  if (!key.startsWith(`${auth.group.id}/`)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const d = await db();
  const photo = await d.getPhoto(key);
  if (!photo) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=3600" },
  });
}
