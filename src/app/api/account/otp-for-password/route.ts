/**
 * POST /api/account/otp-for-password — ส่ง OTP ไปที่เบอร์ของ "บัญชีที่ล็อกอินอยู่" เพื่อตั้ง/เปลี่ยนรหัสผ่าน
 * (feature 00026)
 *
 * ทำไมไม่ใช้ /api/otp/send เดิม: endpoint นั้นรับ `contact` (เบอร์) จาก client ซึ่งแปลว่าหน้า
 * /account ต้องรู้เบอร์ตัวเองก่อน = ต้องส่งเบอร์จริงลงไปใน RSC flight payload ทั้งที่หน้านั้น
 * ตั้งใจส่งลง client แค่ boolean (memory feedback_rsc_pii_neutralize_at_source) เส้นทางนี้จึง
 * resolve เบอร์จาก session ฝั่ง server แล้วคืนกลับแค่รูปแบบที่ปิดบังแล้ว (081xxxx678)
 *
 * ไม่เป็น phone-existence oracle: ต้องมี session ถึงเรียกได้ จึงไม่บอกอะไรเกี่ยวกับบัญชีคนอื่น
 * rate-limit ใช้ตัวเดียวกับ /api/otp/send (consumeOtpRequestQuota ต่อเบอร์ 3 ครั้ง/10 นาที)
 * เพื่อไม่ให้เส้นทางนี้กลายเป็นช่องเลี่ยงโควตาของเส้นทางนั้น
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeOtpRequestQuota, isTestAccount, sendOtpViaSms, storeOtp } from "@/lib/otp";

/** 0812345678 → 081xxxx678 — พอให้เจ้าของจำได้ว่าเบอร์ไหน แต่ไม่พอให้คนอื่นเอาไปใช้ */
function maskPhone(phone: string): string {
  if (phone.length < 10) return phone;
  return `${phone.slice(0, 3)}xxxx${phone.slice(-3)}`;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user?.phone) {
    return NextResponse.json({ error: "บัญชีนี้ยังไม่มีเบอร์โทร กรุณาเพิ่มเบอร์ก่อน" }, { status: 409 });
  }
  const phone = user.phone;

  if (!consumeOtpRequestQuota(phone)) {
    return NextResponse.json({ error: "ขอ OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" }, { status: 429 });
  }

  // test account — ข้ามการส่ง SMS จริง (mirror /api/otp/send; verifyOtp ตรวจ fixed-code เอง)
  if (isTestAccount(phone)) {
    return NextResponse.json({ phoneMasked: maskPhone(phone) });
  }

  const otp = await storeOtp(phone);
  try {
    await sendOtpViaSms(phone, otp);
  } catch {
    // ไม่ expose รายละเอียด error (sendOtpViaSms log status ไว้แล้ว)
    return NextResponse.json(
      { error: "ไม่สามารถส่ง SMS ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" },
      { status: 503 },
    );
  }

  return NextResponse.json({ phoneMasked: maskPhone(phone) });
}
