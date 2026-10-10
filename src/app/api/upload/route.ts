import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/upload — **legacy (2026-08-10): ห้ามใช้กับงานใหม่**
 *
 * route นี้รับไฟล์ผ่าน body ของ function ซึ่ง **Vercel จำกัดที่ 4.5MB** และตอบ
 * `413 FUNCTION_PAYLOAD_TOO_LARGE` ก่อนถึงบรรทัดแรกของโค้ดนี้ ด้วย body ที่ไม่ใช่ JSON —
 * client จึงอ่านเหตุผลไม่ได้และขึ้นข้อความกลาง ๆ ทั้งที่ `validateUpload` เขียนเพดานไว้ 5MB
 * (ทุก surface ของโปรเจกต์ใช้ route นี้มาตลอดและล้มจริงตั้งแต่ 4.5MB โดยไม่มีใครรู้ตัว)
 *
 * ของใหม่ให้ใช้ `uploadToStorage`/`uploadFileId` จาก `@/lib/upload-client`
 * (ticket → PUT ตรงเข้า storage → commit) — ดู `src/lib/upload-policy.ts`
 *
 * ยังเปิดไว้เพราะ client ที่แคชไว้อาจยิงเข้ามาระหว่างเปลี่ยนผ่าน; ไม่มีหน้าไหนในรีโปเรียกแล้ว
 * (มีเทส `[blocker]` `upload-no-multipart-callers.test.ts` กันการกลับไปใช้)
 */
export async function POST() {
  // 00071 S-13 — ปิดแล้ว (410): route นี้รับไฟล์ทุก purpose โดยไม่ผูกบทบาท และไม่มีหน้าไหนเรียกแล้ว
  // ของใหม่ = /api/uploads/ticket|commit (CHAT → H2 · purpose อื่นตรวจ cap ที่ route ปลายทางซึ่งแนบ fileId)
  // 410 ไม่ใช่ 404: บอก client เก่าที่แคชไว้ให้ชัดว่า "ถูกถอดแล้ว" ไม่ใช่ path ผิด
  return NextResponse.json({ error: "เส้นทางอัปโหลดนี้ปิดแล้ว กรุณารีเฟรชหน้าแล้วลองใหม่" }, { status: 410 });
}
