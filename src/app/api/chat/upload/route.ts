import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { saveFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { canAccessShop } from "@/lib/shop-context";
import {
  ATTACHMENT_MAX_SIZE,
  attachmentKind,
  checkChannelSupport,
  extFromName,
  sanitizeAttachmentName,
} from "@/lib/chat-attachment";

/**
 * POST /api/chat/upload — อัปโหลดไฟล์แนบของแชท (feature 00018 ext, 2026-08-02)
 *
 * ทำไมไม่ใช้ POST /api/upload เดิม: route นั้นเรียก validateUpload() ที่มี allow-list 12 MIME
 * + cap 5MB และถูกใช้ร่วมกันโดย verification L2/L3 (บัตรประชาชน/selfie/ทะเบียนธุรกิจ),
 * รูปสินค้า, สลิปเติมเงิน และ badge ของ admin — การไปคลายกฎที่นั่นเพื่อให้แชทแนบไฟล์ได้
 * แปลว่าทุก surface ข้างต้นรับไฟล์ทุกชนิด 25MB ตามไปด้วยโดยไม่มีใครขอ
 *
 * route นี้จึงทำ validation ของตัวเองครบ (deny-list + เพดาน + capability ต่อช่องทาง)
 * แล้วค่อยเรียก saveFile ด้วย skipValidation — pattern เดียวกับ media mirror ของ
 * channel-chat.service.ts ที่ validate เองแล้วข้าม validateUpload
 *
 * conversationId เป็น optional โดยตั้งใจ: ส่งมา = ตรวจกฎเฉพาะช่องทางให้ด้วย (ผู้ใช้เห็นปัญหา
 * ตั้งแต่ตอนแนบ ไม่ใช่ตอนกดส่ง) ไม่ส่ง = ตรวจแค่กฎกลาง. client ส่งเสมอ
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ไม่พบไฟล์ที่จะอัปโหลด" }, { status: 400 });
  }

  // เพดานขนาดตัวจริง — ตรวจที่นี่เพราะเป็นจุดเดียวที่เห็น "ไฟล์จริง" (ฝั่ง route ส่งข้อความ
  // เห็นแค่ตัวเลข attachmentSize ที่ client ส่งมาซึ่งปลอมได้)
  if (file.size > ATTACHMENT_MAX_SIZE) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 25MB" }, { status: 413 });
  }

  const name = sanitizeAttachmentName(file.name);
  const ext = extFromName(name);
  const mime = file.type || "";
  const kind = attachmentKind(mime, ext);

  // resolve ช่องทางของเธรด — พร้อมเช็คสิทธิ์ว่า user นี้แตะเธรดนี้ได้จริง ไม่ใช่แค่มี session
  // (ถ้าไม่เช็ค ใครก็ได้ที่ล็อกอินจะ probe ได้ว่า conversationId ไหนมีอยู่จริง)
  let channel = "DEEP";
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { channel: true, shopId: true, buyerUserId: true },
    });
    if (!conv) {
      return NextResponse.json({ error: "ไม่พบห้องแชทนี้" }, { status: 404 });
    }
    const allowed =
      conv.buyerUserId === userId || (await canAccessShop(conv.shopId, userId));
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    channel = conv.channel;
  }

  const check = checkChannelSupport(channel, { kind, mime, ext, size: file.size });
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  // skipValidation: validation ทั้งหมดทำข้างบนแล้ว (ชนิด/ขนาด/ช่องทาง) — ปล่อยให้ validateUpload
  // ของ storage ตรวจซ้ำจะตกทันทีเพราะ allow-list ของมันมีแค่ 12 MIME ซึ่งคนละเจตนากับ route นี้
  let fileId: string;
  try {
    fileId = await saveFile(file, { skipValidation: true });
  } catch {
    // ไม่ log ชื่อไฟล์/fileId (RC-8 — ชื่อไฟล์ของลูกค้าอาจมี PII)
    console.error("[chat-upload] saveFile failed", { kind, ext, size: file.size });
    return NextResponse.json({ error: "อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }

  return NextResponse.json({ fileId, name, size: file.size, mime, kind }, { status: 201 });
}
