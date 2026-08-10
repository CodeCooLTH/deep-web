import { NextRequest, NextResponse } from "next/server";
import { writeLocalFile } from "@/lib/storage/local";
import { verifyUploadTicket } from "@/lib/upload-ticket";

/**
 * PUT /api/uploads/local/<fileId>?t=<claim> — ปลายทางอัปโหลดของ dev (STORAGE_DRIVER=local)
 *
 * ทำไมมี: prod ยิง presigned PUT เข้า Supabase ตรง ๆ ส่วน dev ไม่มี presigned URL ให้ยิง
 * ถ้าปล่อยให้ dev ตกไปใช้ multipart เดิม เส้นทาง direct upload จะ **ไม่เคยถูกทดสอบเลย**
 * จนกว่าจะขึ้น prod (บทเรียนซ้ำของโปรเจกต์: canvas ที่คุยข้าม context ตายสนิทตั้งแต่ deploy แรก
 * โดย tsc/build เขียวหมด) — route นี้จึงทำให้ทั้งสอง environment เดิน flow เดียวกัน
 *
 * ไม่มีเพดาน body เท่ากับ Vercel เพราะไม่ได้รันบน Vercel — dev server รับเท่าที่ Node รับ
 * และเพดานจริงยังถูกบังคับ 2 ชั้นเหมือน prod: `claim.maxSize` ที่นี่ + commit ที่อ่านขนาดจริง
 */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  // fail-closed: บน prod (s3) route นี้ต้องไม่มีตัวตน — ไฟล์ที่เขียนลง FS ของ serverless instance
  // จะหายไปพร้อม instance และไม่มีใครอ่านเจอ ซึ่งอ่านเหมือน "อัปโหลดสำเร็จแต่ไฟล์หาย"
  if ((process.env.STORAGE_DRIVER ?? "local") === "s3") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const claim = verifyUploadTicket(request.nextUrl.searchParams.get("t") ?? "");
  if (!claim) {
    return NextResponse.json({ error: "ใบอนุญาตอัปโหลดไม่ถูกต้องหรือหมดอายุ" }, { status: 403 });
  }

  // key ที่จะเขียนต้องเป็นตัวที่อยู่ใน claim เท่านั้น ไม่ใช่ที่อ่านจาก URL — path จาก URL ใช้แค่
  // เทียบว่าตรงกัน (ถ้าเชื่อ URL จะกลายเป็น path traversal ที่มี claim ของจริงเป็นตั๋วผ่าน)
  const { path } = await ctx.params;
  if (path.join("/") !== claim.fileId) {
    return NextResponse.json({ error: "ใบอนุญาตไม่ตรงกับไฟล์" }, { status: 403 });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "ไฟล์ว่างเปล่า" }, { status: 400 });
  }
  if (buffer.byteLength > claim.maxSize) {
    // เลียนแบบสิ่งที่ Supabase ทำบน prod: ปฏิเสธก่อนเขียน ไม่เขียนแล้วค่อยลบ
    return NextResponse.json({ error: "ไฟล์ใหญ่เกินที่อนุญาต" }, { status: 413 });
  }

  const written = await writeLocalFile(claim.fileId, buffer);
  if (!written) {
    return NextResponse.json({ error: "เขียนไฟล์ไม่สำเร็จ" }, { status: 500 });
  }

  return new NextResponse(null, { status: 200 });
}
