import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    // e2e เป็น Playwright (`test.describe`/`page`) ไม่ใช่ vitest — `npx vitest run` เปล่า ๆ
    // เคยดูดไฟล์พวกนี้เข้ามาแล้วพังด้วยเหตุผลที่ไม่เกี่ยวกับโค้ดเลย
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // ดู src/test/server-only-stub.ts — guard ของ Next ไม่ใช่ของ vitest
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
