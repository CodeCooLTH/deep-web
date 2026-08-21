// POST /api/orders/[token]/verify-phone — feature 00015 S-2 (Phone Verify)
//
// ใช้กับ decision PHONE_VERIFY_REQUIRED: ผู้ซื้อล็อกอินแล้ว (ส่วนใหญ่ผ่าน Facebook) แต่บัญชี
// ยังไม่มีเบอร์ หรือมีเบอร์คนละตัวกับที่ร้านคีย์ไว้ จึงยังพิสูจน์ไม่ได้ว่าเป็นเจ้าของออเดอร์
//
// ต่างจาก /claim ตรงที่ /claim ใช้เบอร์ของบัญชีที่ resolve จาก DB เอง (บัญชีมีเบอร์อยู่แล้วและ
// ตรงกับออเดอร์) ส่วน endpoint นี้รับเบอร์ "ที่ผู้ใช้กรอก" มาพิสูจน์ด้วย OTP แล้วค่อยผูกให้
//
// ลำดับการตรวจสำคัญมาก — verifyOtp ต้องมาก่อนการเทียบกับ order.buyerContact เสมอ
// ถ้าเทียบก่อนแล้วตอบต่างกันระหว่าง "ตรง/ไม่ตรง" endpoint นี้จะกลายเป็นเครื่องมือให้คนที่ถือ
// ลิงก์เดาเบอร์ผู้ซื้อทีละเบอร์ได้ (oracle) การบังคับให้พิสูจน์ก่อนว่าคุมเบอร์นั้นจริง ทำให้
// ผู้ถามได้คำตอบเฉพาะเบอร์ของตัวเองเท่านั้น
//
// mutation ใต้ /api/orders/** → guardApi() ใน proxy.ts คุม CSRF/rate-limit ให้แล้ว
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone, MOBILE_PHONE_RE } from "@/lib/phone";
import { verifyOtp } from "@/lib/otp";
import { guaranteeOrderLink } from "@/services/order-access.service";
import { signAccountMergeTicket } from "@/lib/account-merge-ticket";

const Body = v.object({
  phone: v.pipe(v.string(), v.regex(MOBILE_PHONE_RE)),
  otp: v.pipe(v.string(), v.length(6)),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string } | undefined)?.id;
  if (!sessionUserId) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  const parsed = v.safeParse(Body, await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const { phone, otp } = parsed.output;
  const enteredPhone = normalizePhone(phone);
  if (!enteredPhone) {
    return NextResponse.json({ error: "รูปแบบเบอร์ไม่ถูกต้อง" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { id: true, buyerUserId: true, buyerContact: true },
  });
  if (!order) {
    return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
  }

  // idempotent — ผูกกับบัญชีนี้ไปแล้ว (double-submit) → ไม่ต้อง verify OTP ซ้ำ
  if (order.buyerUserId === sessionUserId) {
    return NextResponse.json({ ok: true });
  }
  if (order.buyerUserId != null) {
    return NextResponse.json({ error: "คำสั่งซื้อนี้ถูกผูกกับบัญชีอื่นแล้ว" }, { status: 409 });
  }

  // ── พิสูจน์ก่อนว่าผู้ใช้คุมเบอร์ที่กรอกจริง (ดูเหตุผลเรื่อง oracle ด้านบน) ──
  if (!(await verifyOtp(enteredPhone, otp))) {
    return NextResponse.json({ error: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" }, { status: 401 });
  }

  // ── ถึงตรงนี้ผู้ใช้เป็นเจ้าของเบอร์ที่กรอกแน่นอนแล้ว จึงบอกผลการเทียบได้อย่างปลอดภัย ──
  const contactPhone = order.buyerContact ? normalizePhone(order.buyerContact) : null;
  if (!contactPhone || contactPhone !== enteredPhone) {
    return NextResponse.json(
      { error: "เบอร์นี้ไม่ตรงกับเบอร์ที่ร้านบันทึกไว้ในคำสั่งซื้อ", code: "PHONE_MISMATCH" },
      { status: 403 },
    );
  }

  // ── ผูกเบอร์เข้ากับตัวตน — "เบอร์ = single source of truth" จึงต้องจัดการ 3 กรณี ──
  const phoneOwner = await prisma.user.findUnique({
    where: { phone: enteredPhone },
    select: { id: true },
  });

  if (phoneOwner && phoneOwner.id !== sessionUserId) {
    // เบอร์นี้เป็นของบัญชีอื่นที่มีอยู่แล้ว — ผู้ซื้อเคยสมัครด้วย OTP มาก่อน แล้วรอบนี้ล็อกอิน
    // ด้วย Facebook จึงได้บัญชีใหม่คนละใบ ตามหลัก "เบอร์ = single source of truth" บัญชีที่
    // ถือเบอร์คือเจ้าของตัวจริง จึงเสนอให้ย้าย Facebook ไปผูกกับบัญชีเดิม (S-5)
    //
    // ผู้ใช้เพิ่งพิสูจน์ด้วย OTP ไปแล้วว่าคุมเบอร์นี้จริง จึงส่งผลการพิสูจน์นั้นต่อเป็น ticket
    // ที่ลงลายเซ็น แทนที่จะบังคับขอ OTP ใหม่อีกรอบเพื่อพิสูจน์สิ่งเดิมซ้ำสอง
    return NextResponse.json(
      {
        error: "เบอร์นี้มีบัญชีอยู่แล้ว",
        code: "ACCOUNT_EXISTS",
        linkTicket: signAccountMergeTicket({
          fromUserId: sessionUserId,
          toUserId: phoneOwner.id,
          orderId: order.id,
        }),
      },
      { status: 409 },
    );
  }

  if (!phoneOwner) {
    const me = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { phone: true },
    });
    if (!me) {
      return NextResponse.json({ error: "ไม่พบบัญชี" }, { status: 404 });
    }
    // บัญชีนี้ตั้งเบอร์อื่นไว้แล้ว — เบอร์เป็น immutable (ตั้งครั้งเดียว เปลี่ยนไม่ได้)
    // จึงผูกเบอร์ของออเดอร์เข้ากับบัญชีนี้ไม่ได้ ต้องไปใช้บัญชีที่ถือเบอร์นั้นแทน
    if (me.phone) {
      return NextResponse.json(
        { error: "บัญชีนี้ผูกกับเบอร์อื่นไว้แล้ว", code: "ACCOUNT_HAS_OTHER_PHONE" },
        { status: 409 },
      );
    }

    // set เบอร์ + สร้าง L1 PHONE_OTP verification — pattern เดียวกับ /api/account/set-phone
    try {
      await prisma.user.update({
        where: { id: sessionUserId },
        data: {
          phone: enteredPhone,
          verifications: {
            create: { type: "PHONE_OTP", level: 1, status: "APPROVED", reviewedAt: new Date() },
          },
        },
      });
    } catch (e) {
      // TOCTOU: เบอร์ถูกจองโดย request อื่นระหว่าง check → update (User.phone @unique)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json(
          { error: "เบอร์นี้มีบัญชีอยู่แล้ว", code: "ACCOUNT_EXISTS" },
          { status: 409 },
        );
      }
      throw e;
    }

    // auto-link guest history by phone (PRD FR-8) — best-effort เหมือน set-phone
    try {
      const { linkBuyerHistory } = await import("@/services/user.service");
      await linkBuyerHistory(sessionUserId, enteredPhone);
    } catch {
      /* best-effort — ไม่ให้ล้มการเข้าถึงออเดอร์ */
    }
  }

  await guaranteeOrderLink({ orderId: order.id, userId: sessionUserId, phone: enteredPhone });
  return NextResponse.json({ ok: true });
}
