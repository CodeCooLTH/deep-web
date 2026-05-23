import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateUpload, saveFile, deleteFile } from "@/lib/storage";
import { attachSlip } from "@/services/order.service";
import {
  SMS_UNLOCK_COOKIE,
  verifySmsUnlock,
} from "@/lib/sms-unlock-cookie";

// POST /api/orders/[token]/slip
//
// multipart/form-data fields:
//   file    — รูปสลิปโอนเงิน (File)
//   contact — เบอร์โทร/อีเมล (string, optional — ส่งใน UUID/PhoneUnlock flow)
//
// 2 paths (mirror confirm route):
//
// Path A — SMS unlock (cookie-proven):
//   อ่าน o_smsunlock httpOnly cookie → verify HMAC → ใช้ order.buyerContact จาก DB
//   client ไม่ต้องส่ง contact (RC-8: ห้าม leak phone ไปยัง client)
//
// Path B — UUID PhoneUnlock flow:
//   require contact จาก formData → ส่งต่อ attachSlip (ทำ parity check เอง)
//
// RC-8: ห้าม log phone/cookie value/fileId

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // ── parse multipart ──────────────────────────────────────────────────────────
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const contact = formData.get("contact") as string | null;

  if (!file) {
    return NextResponse.json(
      { error: "กรุณาแนบไฟล์สลิป" },
      { status: 400 },
    );
  }

  // ── validate file type + size ────────────────────────────────────────────────
  try {
    validateUpload(file);
  } catch {
    // validateUpload throw เมื่อ type ไม่รองรับหรือ size เกิน 5MB
    // ไม่ echo err.message — ข้อความ generic ป้องกัน oracle leak
    return NextResponse.json(
      { error: "ไฟล์ไม่ถูกต้อง (รองรับรูปภาพ/PDF ≤ 5MB)" },
      { status: 400 },
    );
  }

  // ── determine effectiveContact (Path A / Path B) ─────────────────────────────
  let effectiveContact: string | undefined;

  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(SMS_UNLOCK_COOKIE)?.value;

  if (cookieVal) {
    // Path A: ตรวจ cookie ก่อน — โหลด order เพื่อ verify HMAC bind orderId
    const orderRow = await prisma.order.findUnique({
      where: { publicToken: token },
      select: { id: true, buyerContact: true },
    });

    if (orderRow && verifySmsUnlock(cookieVal, orderRow.id)) {
      if (!orderRow.buyerContact) {
        // buyerContact ว่าง: consumeSmsCode ไม่ได้ set ไว้ → fail-safe reject
        // (ไม่ควรเกิดใน flow ปกติ แต่ต้อง handle ไว้)
        return NextResponse.json(
          { error: "แนบสลิปไม่สำเร็จ กรุณาตรวจสอบและลองใหม่" },
          { status: 400 },
        );
      }
      // RC-8: ใช้ buyerContact จาก DB โดยตรง — client ไม่ได้ส่งมา
      effectiveContact = orderRow.buyerContact;
    }
    // cookie มีแต่ verify ไม่ผ่าน → fall-through Path B ต่อ
  }

  if (effectiveContact === undefined) {
    // Path B: UUID flow — ต้องการ contact จาก formData
    if (!contact) {
      return NextResponse.json(
        { error: "แนบสลิปไม่สำเร็จ กรุณาตรวจสอบและลองใหม่" },
        { status: 400 },
      );
    }
    effectiveContact = contact;
  }

  // ── save file → attach to order ──────────────────────────────────────────────
  const fileId = await saveFile(file);

  try {
    const order = await attachSlip(token, fileId, effectiveContact);
    return NextResponse.json({ slipFileId: order.slipFileId });
  } catch (err: unknown) {
    // attachSlip throw เมื่อ: order ไม่พบ / contact parity ไม่ตรง / status ไม่ใช่ PENDING
    // ลบไฟล์ที่ upload ไปแล้วเพื่อป้องกัน orphan file ค้างใน storage
    await deleteFile(fileId);
    // RC-8 + F2: ห้าม log phone/cookie/fileId — ห้าม echo err.message (oracle leak)
    console.error("[slip]", err);
    return NextResponse.json(
      { error: "แนบสลิปไม่สำเร็จ กรุณาตรวจสอบและลองใหม่" },
      { status: 400 },
    );
  }
}
