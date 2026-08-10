import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveFile } from "@/lib/storage";

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
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const fileId = await saveFile(file);
  return NextResponse.json({ fileId }, { status: 201 });
}
