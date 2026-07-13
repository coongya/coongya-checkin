// 임시 진단 스크립트 — 빌드 로그에서 인증샷 파이프라인 상태 확인 후 삭제 예정
import { createClient } from "@supabase/supabase-js";

const BUCKET = "checkin-photos";
const hex = (ab, n = 8) =>
  [...new Uint8Array(ab.slice(0, n))].map((b) => b.toString(16).padStart(2, "0")).join(" ");
const out = (label, v) => console.log(`[diagnose-photo] ${label}: ${JSON.stringify(v)}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
out("env", { hasUrl: !!url, hasKey: !!key, keyPrefix: key ? key.slice(0, 10) : null });
if (!url || !key) process.exit(0);

try {
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error: qErr } = await sb
    .from("checkins")
    .select("photo_path, checked_at")
    .not("photo_path", "is", null)
    .order("checked_at", { ascending: false })
    .limit(3);
  if (qErr) out("checkinsError", qErr.message);
  const paths = (rows ?? []).map((r) => r.photo_path);
  out("recentPathCount", paths.length);

  for (const p of paths) {
    const masked = p.replace(/u\/[^/]+/, "u/***");
    const { data: dl, error: dlErr } = await sb.storage.from(BUCKET).download(p);
    if (dlErr) out(`download ${masked}`, { error: dlErr.message });
    else {
      const ab = await dl.arrayBuffer();
      out(`download ${masked}`, { size: ab.byteLength, type: dl.type, magic: hex(ab) });
    }
    const { data: s, error: sErr } = await sb.storage.from(BUCKET).createSignedUrl(p, 600);
    if (sErr) out(`sign ${masked}`, { error: sErr.message });
    else if (s?.signedUrl) {
      out(`signShape ${masked}`, s.signedUrl.replace(/token=.*$/, "token=***"));
      try {
        const res = await fetch(s.signedUrl);
        const body = await res.arrayBuffer();
        out(`signedFetch ${masked}`, {
          status: res.status,
          contentType: res.headers.get("content-type"),
          size: body.byteLength,
          magic: hex(body),
          bodyIfSmall: body.byteLength < 500 ? new TextDecoder().decode(body) : undefined,
        });
      } catch (e) {
        out(`signedFetchError ${masked}`, String(e));
      }
    }
  }

  // 새 업로드 → 서명 → fetch 라운드트립 (1x1 JPEG)
  const tiny = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  );
  const testPath = `debug/${Date.now()}.jpg`;
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(testPath, tiny, { contentType: "image/jpeg", upsert: true });
  if (upErr) out("roundtripUploadError", upErr.message);
  else {
    const { data: s2, error: s2Err } = await sb.storage.from(BUCKET).createSignedUrl(testPath, 600);
    if (s2Err) out("roundtripSignError", s2Err.message);
    else {
      const res2 = await fetch(s2.signedUrl);
      const body2 = await res2.arrayBuffer();
      out("roundtripSignedFetch", {
        status: res2.status,
        contentType: res2.headers.get("content-type"),
        size: body2.byteLength,
        magic: hex(body2),
        bodyIfSmall: body2.byteLength < 500 ? new TextDecoder().decode(body2) : undefined,
      });
    }
    await sb.storage.from(BUCKET).remove([testPath]);
  }

  // Blob(FormData 경로) 업로드 라운드트립 — 수정된 uploadPhoto와 동일한 경로
  const blobPath = `debug/${Date.now()}-blob.jpg`;
  const blob = new Blob([new Uint8Array(tiny)], { type: "image/jpeg" });
  const { error: upErr2 } = await sb.storage
    .from(BUCKET)
    .upload(blobPath, blob, { contentType: "image/jpeg", upsert: true });
  if (upErr2) out("blobUploadError", upErr2.message);
  else {
    const { data: dl2, error: dl2Err } = await sb.storage.from(BUCKET).download(blobPath);
    if (dl2Err) out("blobDownloadError", dl2Err.message);
    else {
      const ab2 = await dl2.arrayBuffer();
      out("blobRoundtrip", {
        uploadedSize: tiny.byteLength,
        storedSize: ab2.byteLength,
        type: dl2.type,
        magic: hex(ab2),
        intact: Buffer.from(ab2).equals(tiny),
      });
    }
    await sb.storage.from(BUCKET).remove([blobPath]);
  }
} catch (e) {
  out("fatal", String(e));
}
