import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp의 네이티브 모듈(.node)은 같은 @img 패키지들의 libvips 공유 라이브러리를
  // 런타임에 불러오는데, 빌드 추적이 .node만 담고 이 라이브러리를 빠뜨린다.
  // 빠지면 /api/checkin이 모듈 로드 단계에서 500으로 죽으므로 직접 포함시킨다.
  outputFileTracingIncludes: {
    "/api/checkin": [
      "./node_modules/@img/sharp-libvips-*/**/*",
      "./node_modules/@img/sharp-*/lib/*",
    ],
  },
};

export default nextConfig;
