import type { NextConfig } from "next";

// DEMO_EXPORT=1: build bản demo tĩnh cho GitHub Pages (https://minhnghia0897-arch.github.io/DAIVIETCRM/).
// Chỉ các file *.demo.tsx được coi là route: giao diện dùng chung components/views, dữ liệu mô phỏng,
// đăng nhập bằng cách chọn vai trò. Bản thật (Supabase, Vercel) không bị ảnh hưởng.
const demoExport = process.env.DEMO_EXPORT === "1";

const nextConfig: NextConfig = demoExport
  ? {
      output: "export",
      basePath: "/DAIVIETCRM",
      trailingSlash: true,
      images: { unoptimized: true },
      pageExtensions: ["demo.tsx", "demo.ts"],
      env: { NEXT_PUBLIC_DEMO: "1" },
      // Route type của Next chỉ biết route bản thật; CI đã typecheck toàn bộ mã ở chế độ thường.
      typescript: { ignoreBuildErrors: true },
    }
  : {};

export default nextConfig;
