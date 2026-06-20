// set-phone — เพิ่มเบอร์ให้ user ปัจจุบัน (เช่น FB user ที่ยังไม่มีเบอร์) ผ่าน OTP.
// ใช้แทน signIn('phone-otp') ที่จะสร้าง user ใหม่ (FB user มี user อยู่แล้ว).
// กฎ: เบอร์ตั้งครั้งเดียว เปลี่ยนไม่ได้ (immutable — มีผลต่อ Trust Score). ห้ามซ้ำ user อื่น.
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/otp";

const Body = v.object({
  phone: v.pipe(v.string(), v.regex(/^0[0-9]{9}$/)),
  otp: v.pipe(v.string(), v.length(6)),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = v.safeParse(Body, await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const { phone, otp } = parsed.output;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!me) return NextResponse.json({ error: "ไม่พบบัญชี" }, { status: 404 });
  // immutable — ตั้งเบอร์แล้วเปลี่ยนไม่ได้
  if (me.phone) return NextResponse.json({ error: "บัญชีนี้ตั้งเบอร์แล้ว ไม่สามารถเปลี่ยนได้" }, { status: 409 });

  // ห้ามซ้ำเบอร์ user อื่น
  const dup = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (dup) return NextResponse.json({ error: "เบอร์นี้มีบัญชีแล้ว" }, { status: 409 });

  // verifyOtp ท้ายสุด (consume single-use เฉพาะเมื่อ checks ผ่าน)
  if (!(await verifyOtp(phone, otp))) {
    return NextResponse.json({ error: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" }, { status: 401 });
  }

  // set phone + สร้าง L1 PHONE_OTP verification (เหมือน phone-otp authorize) atomic
  await prisma.user.update({
    where: { id: userId },
    data: {
      phone,
      verifications: {
        create: { type: "PHONE_OTP", level: 1, status: "APPROVED", reviewedAt: new Date() },
      },
    },
  });

  // auto-link guest history by phone (PRD FR-8) — best-effort
  try {
    const { linkBuyerHistory } = await import("@/services/user.service");
    await linkBuyerHistory(userId, phone);
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
