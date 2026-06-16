// ตั้ง/รีเซ็ตรหัสผ่าน seller via phone OTP — ครอบ migration บัญชี OTP-only เดิม + ลืมรหัส.
// verifyOtp consume OTP (single-use). ต้องผ่าน OTP จริงเท่านั้น (กันยึดบัญชีด้วยเบอร์คนอื่น).
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/otp";
import { hashPassword } from "@/lib/password";
import { SetPasswordSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const parsed = v.safeParse(SetPasswordSchema, await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const { phone, otp, password } = parsed.output;

  if (!(await verifyOtp(phone, otp))) {
    return NextResponse.json({ error: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return NextResponse.json({ error: "ไม่พบบัญชีสำหรับเบอร์นี้" }, { status: 404 });
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
