// feature 00022 — รับแจ้งสถานะจาก iShip (FR-ISHIP-041)
//
// ความปลอดภัย: ผู้ให้บริการไม่ได้ประกาศว่ามีลายเซ็นยืนยันตัวตนหรือไม่ (OQ-1 ค้างอยู่)
// ระหว่างนี้ใช้ secret ที่เดาไม่ได้ฝังอยู่ใน path เป็นตัวยืนยัน — ร้านนำ URL นี้ไปตั้งที่ iShip
//
// secret ไม่ตรง → ตอบ 404 ไม่ใช่ 403 เพราะ 403 เป็นการยืนยันกลับไปว่า "มี endpoint นี้อยู่จริง
// แค่ secret ผิด" ซึ่งช่วยคนที่กำลังเดาสุ่ม
//
// ข้อควรระวัง: ต้องตอบ 200 ให้เร็ว แม้ประมวลผลไม่สำเร็จ — ผู้ให้บริการส่วนใหญ่ยิงซ้ำรัว
// เมื่อไม่ได้ 200 ซึ่งจะกลายเป็นการถล่มตัวเองโดยไม่ได้อะไรกลับมา

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { handlePickupWebhook, handleStatusWebhook } from "@/services/iship.service";

export const dynamic = "force-dynamic";

/**
 * เทียบ secret แบบไม่รั่วเวลา
 *
 * `!==` ปกติจะหยุดเทียบทันทีที่เจอตัวอักษรต่างตัวแรก ทำให้เวลาที่ใช้บอกใบ้ได้ว่า
 * เดาถูกกี่ตัว — ในทางปฏิบัติกับ secret สุ่มยาวผ่านเครือข่ายจริงแทบทำไม่ได้
 * แต่การเทียบแบบคงที่ไม่มีข้อเสียอะไรเลย จึงไม่มีเหตุผลที่จะไม่ทำ
 *
 * ต้องเช็คความยาวก่อน เพราะ timingSafeEqual โยน error เมื่อ buffer ยาวไม่เท่ากัน
 * (ตัวความยาวเองรั่วอยู่แล้วจาก URL จึงไม่ใช่ข้อมูลที่ต้องปกป้อง)
 */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const expected = process.env.ISHIP_WEBHOOK_SECRET;

  // ไม่ได้ตั้ง secret ไว้ = ฟีเจอร์นี้ยังไม่เปิด — ปฏิเสธทุกคำขอ ไม่ใช่ปล่อยผ่าน
  if (!expected || !secretMatches(secret, expected)) {
    return new NextResponse(null, { status: 404 });
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    // body ไม่ใช่ JSON — ตอบ 200 แล้วจบ ไม่ให้ยิงซ้ำ
    return NextResponse.json({ ok: true });
  }

  try {
    const p = payload as Record<string, unknown> | null;
    // แยกชนิดจากรูปของ payload: ของรถเข้ารับมี ticketPickupId ส่วนของพัสดุมี tracking/ref_code
    if (p && "ticketPickupId" in p) {
      await handlePickupWebhook(payload);
    } else {
      await handleStatusWebhook(payload);
    }
  } catch (err) {
    // กลืน error โดยเจตนา — ตอบ 200 เสมอ (ดูหมายเหตุหัวไฟล์)
    console.error("[iship] webhook processing failed", err);
  }

  return NextResponse.json({ ok: true });
}
