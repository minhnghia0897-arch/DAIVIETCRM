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
  : {
      // Giữ trang vừa xem trong bộ nhớ trình duyệt 30 giây: quay lại màn vừa mở thì hiện ngay, không chờ server.
      // Lệnh ghi (server action có revalidatePath, router.refresh) vẫn làm mới ngay.
      // Ảnh sản phẩm, chứng từ gửi qua server action: mặc định chỉ nhận 1MB. Trình duyệt đã thu nhỏ ảnh trước khi gửi
      // (lib/images/shrink.ts); 4MB để dư cho PDF, HTML landing, vẫn dưới giới hạn 4,5MB mỗi lần gửi của Vercel.
      experimental: { staleTimes: { dynamic: 30 }, serverActions: { bodySizeLimit: "4mb" } },
      // Font tiếng Việt vẽ ảnh báo giá (đọc bằng readFile nên phải khai báo để có trong gói chạy trên Vercel).
      // Mẫu landing page có sẵn (trang chưa tải HTML riêng thì dùng mẫu này).
      outputFileTracingIncludes: {
        "/api/quotes/[id]/image": ["./assets/fonts/*.ttf"],
        "/lp/[slug]": ["./lib/landing/templates/*.html"],
      },
    };

export default nextConfig;
