// 임시 진단용 — 인증샷 미표시 원인 조사 후 삭제 예정.
// Storage에 실제로 저장된 최근 사진의 크기/매직바이트와, 서명 URL을 서버에서
// 직접 fetch했을 때의 응답(브라우저가 받는 것과 동일)을 리포트한다.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = "de3ee69fe7d2471577e1995f860ebd29";
const BUCKET = "checkin-photos";

function hex(buf: ArrayBuffer, n = 8): string {
  return [...new Uint8Array(buf.slice(0, n))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("t") !== TOKEN) {
    return new NextResponse("Not found", { status: 404 });
  }
  const report: Record<string, unknown> = {
    env: {
      hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      urlHost: (() => {
        try {
          return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host.replace(
            /^[^.]+/,
            "***"
          );
        } catch {
          return "invalid";
        }
      })(),
    },
  };
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 1) 최근 체크인 사진 경로
    const { data: rows, error: qErr } = await sb
      .from("checkins")
      .select("photo_path, checked_at")
      .not("photo_path", "is", null)
      .order("checked_at", { ascending: false })
      .limit(3);
    if (qErr) report.checkinsError = qErr.message;
    const paths = (rows ?? []).map((r) => r.photo_path as string);
    report.recentPaths = paths.map((p) => p.replace(/u\/[^/]+/, "u/***"));

    // 2) 각 사진: 서버 download + 서명 URL 발급 + 서명 URL을 fetch(브라우저와 동일 경로)
    const checks = [];
    for (const p of paths) {
      const entry: Record<string, unknown> = {};
      const { data: dl, error: dlErr } = await sb.storage.from(BUCKET).download(p);
      if (dlErr) entry.downloadError = dlErr.message;
      else if (dl) {
        const ab = await dl.arrayBuffer();
        entry.download = { size: ab.byteLength, type: dl.type, magic: hex(ab) };
      }
      const { data: s, error: sErr } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(p, 600);
      if (sErr) entry.signError = sErr.message;
      else if (s?.signedUrl) {
        entry.signedUrlShape = s.signedUrl.replace(/token=.*$/, "token=***");
        try {
          const res = await fetch(s.signedUrl, { redirect: "follow" });
          const body = await res.arrayBuffer();
          entry.signedFetch = {
            status: res.status,
            contentType: res.headers.get("content-type"),
            contentLength: res.headers.get("content-length"),
            cacheControl: res.headers.get("cache-control"),
            size: body.byteLength,
            magic: hex(body),
            bodyTextIfSmall:
              body.byteLength < 500 ? new TextDecoder().decode(body) : undefined,
          };
        } catch (e) {
          entry.signedFetchError = e instanceof Error ? e.message : String(e);
        }
      }
      checks.push(entry);
    }
    report.checks = checks;

    // 3) 새 업로드 → 서명 → fetch 라운드트립 (1x1 JPEG)
    const tiny = Buffer.from(
      "/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
      "base64"
    );
    const testPath = `debug/${Date.now()}.jpg`;
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(testPath, tiny, { contentType: "image/jpeg", upsert: true });
    if (upErr) report.roundtripUploadError = upErr.message;
    else {
      const rt: Record<string, unknown> = { uploadedSize: tiny.byteLength };
      const { data: s2, error: s2Err } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(testPath, 600);
      if (s2Err) rt.signError = s2Err.message;
      else if (s2?.signedUrl) {
        const res2 = await fetch(s2.signedUrl);
        const body2 = await res2.arrayBuffer();
        rt.signedFetch = {
          status: res2.status,
          contentType: res2.headers.get("content-type"),
          size: body2.byteLength,
          magic: hex(body2),
          bodyTextIfSmall:
            body2.byteLength < 500 ? new TextDecoder().decode(body2) : undefined,
        };
      }
      await sb.storage.from(BUCKET).remove([testPath]);
      report.roundtrip = rt;
    }
  } catch (e) {
    report.fatal = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  return NextResponse.json(report);
}
