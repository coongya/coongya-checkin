import type { MetadataRoute } from "next";

// 웹앱 매니페스트 — 홈 화면에 추가하면 어느 화면에서 추가했든 항상 홈(/)에서 열린다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "쿵야출근단",
    short_name: "쿵야출근단",
    description: "사진 한 장으로 출근 도장 쿵! 지각 벌금과 출근 통계를 함께 기록해요.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f9",
    theme_color: "#12d492",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
