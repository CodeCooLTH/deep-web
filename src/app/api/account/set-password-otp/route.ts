/**
 * POST /api/account/set-password-otp — ตั้ง/เปลี่ยนรหัสผ่านของบัญชีที่ล็อกอินอยู่ (feature 00026)
 *
 * ต่างจาก /api/account/set-password เดิมตรงที่ **ไม่รับ `phone` จาก client**:
 * เส้นทางเดิมออกแบบมาสำหรับหน้า "ลืมรหัสผ่าน" ที่ยังไม่ล็อกอิน จึงต้องให้ client บอกเบอร์มา
 * เส้นทางนี้ใช้จากหน้า /account ที่ล็อกอินอยู่แล้ว — resolve เบอร์จาก session แทน เพื่อไม่ต้อง
 * ส่งเบอร์จริงลง client (RSC PII rule) และตัดความเสี่ยงที่ client ส่งเบอร์ของคนอื่นมา
 *
 * ยังบังคับ OTP เหมือนเดิม (มติ D3): session อย่างเดียวไม่พอสำหรับการตั้งรหัสผ่าน เพราะถ้าเครื่อง
 * ถูกเปิดทิ้งไว้ คนที่นั่งลงต่อจะตั้งรหัสผ่านแล้วยึดบัญชีได้ทันที — OTP บังคับให้ต้องถือเบอร์ด้วย
 */
import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/otp";
import { hashPassword } from "@/lib/password";
import { PasswordSchema } from "@/lib/validations";

const Body = v.object({
  otp: v.pipe(v.string(), v.length(6)),
  password: PasswordSchema,
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = v.safeParse(Body, await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "รหัสผ่านต้องยาว 8 ตัวขึ้นไป มีตัวอักษร ตัวเลข และอักขระพิเศษ" },
      { status: 400 },
    );
  }
  const { otp, password } = parsed.output;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user?.phone) {
    return NextResponse.json({ error: "บัญชีนี้ยังไม่มีเบอร์โทร กรุณาเพิ่มเบอร์ก่อน" }, { status: 409 });
  }

  // verifyOtp consume แบบ single-use — ต้องอยู่ท้ายสุดเท่าที่ทำได้ (กันเผา OTP ทิ้งเพราะ input ผิด)
  if (!(await verifyOtp(user.phone, otp))) {
    return NextResponse.json({ error: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ" }, { status: 401 });
  }

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });

  return NextResponse.json({ ok: true });
}
