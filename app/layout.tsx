import type { Metadata, Viewport } from "next";
import { isMock } from "@/lib/db";
import "./globals.css";

export const metadata: Metadata = {
  title: "쿵야출근단",
  description: "사진 한 장으로 출근 도장 쿵! 지각 벌금과 출근 통계를 함께 기록해요.",
  // iOS 홈 화면 추가 시 앱처럼 열리고, 시작 화면이 항상 홈(/)이 되게 한다
  appleWebApp: { capable: true, title: "쿵야출근단", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7fb95c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {isMock() && (
          <div className="demo-banner">
            🚧 데모 모드예요 — 데이터가 영구 저장되지 않아요. (Supabase 연결 시 해제)
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
