import { avatarInfo } from "@/lib/types";

/** 쿵야 캐릭터 얼굴 — 이미지가 있으면 이미지, 없으면 이모지 */
export default function KungyaFace({
  avatar,
  size,
}: {
  avatar: string;
  size?: number;
}) {
  const info = avatarInfo(avatar);
  return (
    <span className="kungya-face" title={info.label}>
      {info.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={info.img}
          alt={info.label}
          style={size ? { width: size, height: size } : undefined}
        />
      ) : (
        <span style={size ? { fontSize: size * 0.8 } : undefined}>{info.emoji}</span>
      )}
    </span>
  );
}
