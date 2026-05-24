import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SMS_UNLOCK_COOKIE, verifySmsUnlock } from "@/lib/sms-unlock-cookie";
import { maskPhone } from "@/lib/phone-mask";

// GET /api/orders/[token]/buyer-phone
//
// ใช้สำหรับ SMS-unlock account prompt: เมื่อ buyer ถือ HMAC SMS-unlock cookie ที่ valid
// สำหรับ order นี้ → คืน buyerContact phone เพื่อให้ client pre-fill ขั้นตอน OTP
//
// RC-8: ไม่ log phone/cookie value เด็ดขาด
//
// Security note: full phone เปิดเฉพาะผู้ที่ถือ HMAC cookie ที่ผูกกับ orderId นี้เท่านั้น
// (signed ด้วย NEXTAUTH_SECRET ณ ตอน consumeSmsCode — client ไม่สามารถ forge ได้)
// safepay-security ตรวจสอบ tradeoff นี้แล้ว (Phase 4 audit)
// full phone จำเป็นสำหรับ client เพื่อ call signIn / /api/otp/send — masked ใช้แสดงบน UI เท่านั้น

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // โหลด order ก่อนเพื่อรู้ order.id สำหรับ verify cookie (pattern เดียวกับ confirm/route.ts Path A)
  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, buyerContact: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // อ่าน cookie ฝั่ง server เท่านั้น — httpOnly cookie client ไม่มีทาง set เอง
  const cookieVal = (await cookies()).get(SMS_UNLOCK_COOKIE)?.value;

  if (!cookieVal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ตรวจ HMAC signature + orderId binding + expiry (fail-closed — verifySmsUnlock ไม่ throw)
  if (!verifySmsUnlock(cookieVal, order.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // buyerContact อาจว่างถ้า consumeSmsCode ยังไม่ set (ไม่ควรเกิดใน flow ปกติ)
  if (!order.buyerContact) {
    return NextResponse.json({ error: "No phone" }, { status: 404 });
  }

  return NextResponse.json({
    phone: order.buyerContact,
    masked: maskPhone(order.buyerContact),
  });
}
