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
      /**
       * 🛑 ต้องมีครบทุกตัวที่ `tsconfig.json` ประกาศ และ **ตัวที่เจาะจงกว่าต้องมาก่อน `@`**
       *
       * Vite แทน alias แบบ "ขึ้นต้นตรงกัน" ⇒ ถ้า `@` อยู่บนสุด `@core/x` จะถูกแปลงเป็น
       * `src/core/x` ซึ่งไม่มีอยู่จริง
       *
       * เดิมมีแค่ `@` กับ `server-only` ขณะที่ tsconfig มี 9 ตัว ⇒ เทสที่ import โมดูลซึ่ง
       * ใช้ `@core`/`@layouts`/... **ล้มทั้งไฟล์** ด้วย "Cannot find package" ซึ่งอ่านเหมือน
       * แพ็กเกจหาย ไม่เหมือนปัญหา config — เจอตอนเพิ่ม `CustomAvatar` เข้า `PaymentSummaryCard`
       * แล้ว `paid-percent.test.ts` (ที่ import ฟังก์ชันบริสุทธิ์จากไฟล์นั้น) ล้มทั้งไฟล์
       */
      "@core": path.resolve(__dirname, "./src/@core"),
      "@layouts": path.resolve(__dirname, "./src/@layouts"),
      "@menu": path.resolve(__dirname, "./src/@menu"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@views": path.resolve(__dirname, "./src/views"),
      "@configs": path.resolve(__dirname, "./src/configs"),
      "@contexts": path.resolve(__dirname, "./src/contexts"),
      "@assets": path.resolve(__dirname, "./src/assets"),
      "@": path.resolve(__dirname, "./src"),
      // ดู src/test/server-only-stub.ts — guard ของ Next ไม่ใช่ของ vitest
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
