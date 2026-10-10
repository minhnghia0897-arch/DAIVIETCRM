import { defineConfig, devices } from "@playwright/test";

// Kiểm thử bản demo tĩnh (dữ liệu mô phỏng, chạy trong trình duyệt). Chạy `pnpm test:demo`: build bản xuất rồi phục vụ out/.
export default defineConfig({
  testDir: "tests/demo",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173/DAIVIETCRM/",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "node scripts/serve-demo.mjs",
    url: "http://127.0.0.1:4173/DAIVIETCRM/",
    reuseExistingServer: !process.env.CI,
  },
});
