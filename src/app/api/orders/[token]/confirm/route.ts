import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { ConfirmOrderSchema } from "@/lib/validations";
import { confirmOrder } from "@/services/order.service";
import { prisma } from "@/lib/prisma";
import {
  SMS_UNLOCK_COOKIE,
  verifySmsUnlock,
} from "@/lib/sms-unlock-cookie";

// POST /api/orders/[token]/confirm
//
// 2 paths:
//
// Path A — SMS unlock (cookie-proven):
//   body: {} หรือ { smsUnlock: true }
//   server อ่าน HMAC signed cookie + ตรวจว่า orderId ตรงกัน
//   ถ้า proven → ใช้ order.buyerContact จาก DB (RC-6 lock แล้ว) เรียก confirmOrder
//   client ไม่ต้องส่ง / ไม่ได้รู้ phone (RC-8)
//
// Path B — UUID PhoneUnlock flow (เดิม):
//   body: { contact: string }
//   ต้อง parse ConfirmOrderSchema ตามปกติ
//   ไม่อ่าน cookie; ไม่อ่อน logic เดิม
//
// RC-8: ห้าม log phone/cookie value

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const buyerUserId = session?.user
    ? (session.user as { id: string }).id
    : undefined;

  // อ่าน cookie (server-side เท่านั้น — client ไม่มีทาง set httpOnly cookie เอง)
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(SMS_UNLOCK_COOKIE)?.value;

  // ── Path A: ตรวจ cookie ก่อน ────────────────────────────────────────────────
  // โหลด order เบื้องต้นเพื่อ verify cookie (ต้องรู้ order.id ก่อน)
  if (cookieVal) {
    const orderRow = await prisma.order.findUnique({
      where: { publicToken: token },
      select: { id: true, buyerContact: true },
    });

    if (orderRow && verifySmsUnlock(cookieVal, orderRow.id)) {
      // Cookie valid — ตรวจว่า order.buyerContact มีค่า (RC-6 set ตอน consumeSmsCode)
      if (!orderRow.buyerContact) {
        // buyerContact ยังว่าง หมายความว่า consumeSmsCode ไม่ได้ set → reject
        // (ไม่ควรเกิดถ้า flow ถูก แต่ fail-safe)
        return NextResponse.json(
          { error: "ไม่สามารถยืนยันคำสั่งซื้อได้" },
          { status: 400 },
        );
      }

      try {
        // RC-8: ใช้ buyerContact จาก DB โดยตรง — client ไม่ได้ส่งมา
        const order = await confirmOrder(token, orderRow.buyerContact, buyerUserId);
        return NextResponse.json(order);
      } catch (err: unknown) {
        // F2 security fix: ห้าม echo err.message ดิบ — confirmOrder throw ข้อความที่เปิด oracle
        // (เช่น "Order not found" / "Phone ไม่ตรง" / "Invalid transition") → ตอบ generic เดียว
        console.error('[confirm/Path-A]', err);
        return NextResponse.json(
          { error: "ยืนยันคำสั่งซื้อไม่สำเร็จ กรุณาตรวจสอบและลองใหม่" },
          { status: 400 },
        );
      }
    }
    // cookie มีแต่ verify ไม่ผ่าน (expired / wrong order) → fall-through Path B
    // ไม่บอก client ว่าเพราะ cookie fail (ไม่เปิด oracle)
  }

  // ── Path B: UUID flow เดิม — contact required ───────────────────────────────
  const body = await request.json();
  const parsed = v.safeParse(ConfirmOrderSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { contact } = parsed.output;

  try {
    const order = await confirmOrder(token, contact, buyerUserId);
    return NextResponse.json(order);
  } catch (err: unknown) {
    // F2 security fix: ห้าม echo err.message ดิบ — เหตุผลเดียวกับ Path A
    console.error('[confirm/Path-B]', err);
    return NextResponse.json(
      { error: "ยืนยันคำสั่งซื้อไม่สำเร็จ กรุณาตรวจสอบและลองใหม่" },
      { status: 400 },
    );
  }
}
