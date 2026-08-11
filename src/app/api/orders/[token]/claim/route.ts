import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { ClaimOrderSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { verifyOtp } from "@/lib/otp";
import { guaranteeOrderLink } from "@/services/order-access.service";
import { sessionUserId } from "@/lib/session-user";

// POST /api/orders/[token]/claim — feature 00015 (Order Claim & Forced Login)
// API.md §4.3, SDS §4.5 — endpoint ใหม่สำหรับ decision OTP_CLAIM_REQUIRED
//
// ยืนยัน OTP ที่ผูกกับเบอร์ของ "บัญชีที่ login อยู่เท่านั้น" — server resolve
// เบอร์เอง จาก DB (ไม่รับจาก client) กัน spoofing ทั้งหมด
//
// mutation ใต้ /api/orders/** → guardApi() ใน proxy.ts คุม CSRF/rate-limit ให้แล้ว
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const actorUserId = sessionUserId(session);
  if (!session?.user || !actorUserId) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = v.safeParse(ClaimOrderSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { otp } = parsed.output;

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, buyerUserId: true, buyerContact: true },
  });
  if (!order) {
    return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
  }

  // idempotent-hit — claim ไปแล้วโดยบัญชีเดียวกัน (เช่น double-submit) → ข้าม verify OTP ซ้ำ
  if (order.buyerUserId === actorUserId) {
    return NextResponse.json({ ok: true });
  }

  // order ถูก claim โดยบัญชีอื่นไปแล้ว (race)
  if (order.buyerUserId != null) {
    return NextResponse.json({ error: "คำสั่งซื้อนี้ถูกผูกกับบัญชีอื่นแล้ว" }, { status: 409 });
  }

  // resolve เบอร์ของ session user จาก DB เอง — ไม่รับจาก body (กัน spoofing)
  const sessionUser = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { phone: true },
  });
  const sessionPhone = sessionUser?.phone ? normalizePhone(sessionUser.phone) : null;
  if (!sessionPhone) {
    return NextResponse.json({ error: "บัญชีนี้ยังไม่มีเบอร์โทรที่ยืนยันแล้ว" }, { status: 400 });
  }

  // defense-in-depth — หน้า UI ไม่ควรพา user มาถึงจุดนี้ถ้าเบอร์ไม่ตรงอยู่แล้ว
  const contactPhone = order.buyerContact ? normalizePhone(order.buyerContact) : null;
  if (contactPhone !== sessionPhone) {
    return NextResponse.json({ error: "เบอร์ของบัญชีนี้ไม่ตรงกับคำสั่งซื้อ" }, { status: 403 });
  }

  const otpOk = await verifyOtp(sessionPhone, otp);
  if (!otpOk) {
    return NextResponse.json({ error: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" }, { status: 401 });
  }

  await guaranteeOrderLink({ orderId: order.id, userId: actorUserId, phone: sessionPhone });
  return NextResponse.json({ ok: true });
}
