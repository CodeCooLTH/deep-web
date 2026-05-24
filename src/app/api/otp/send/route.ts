import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { SendOtpSchema } from "@/lib/validations";
import { consumeOtpRequestQuota, isTestAccount, sendOtpViaSms, storeOtp } from "@/lib/otp";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = v.safeParse(SendOtpSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { contact, type } = parsed.output;

  // normalize type เพื่อรองรับทั้ง lowercase และ uppercase จาก client
  const normalizedType = type.toLowerCase();

  // phone format guard — ต้องเป็น ^0[0-9]{9}$ เท่านั้น (email ปล่อยผ่าน)
  if (normalizedType === "phone" && !/^0[0-9]{9}$/.test(contact)) {
    return NextResponse.json({ error: "เบอร์โทรไม่ถูกต้อง" }, { status: 400 });
  }

  // PRD NFR-2.7: "OTP rate limit: 3 ครั้ง / 10 นาที ต่อเบอร์โทร"
  // ทุกเบอร์ติด rate-limit เท่ากัน รวม TEST_ACCOUNTS — เพราะส่ง SMS จริงทุก env
  if (!consumeOtpRequestQuota(contact)) {
    return NextResponse.json(
      { error: "ขอ OTP บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429 },
    );
  }

  // ตรวจว่าเบอร์นี้มี User อยู่แล้วหรือไม่ เพื่อบอก client ว่าต้องแสดงฟอร์มชื่อหรือเปล่า
  // ⚠️ ต้องอยู่ "หลัง" consumeOtpRequestQuota (review/security must-fix): isNewUser =
  //    phone-existence oracle → ต้องถูก gate ด้วย rate-limit ไม่งั้น enumerate ได้ฟรี
  // — ใช้ phone raw "08xxxxxxxx" ตรงกับที่ phone-otp provider เก็บใน User.phone
  // — best-effort: DB error → omit isNewUser (client แสดงฟอร์มชื่อ defensive); ไม่ fail OTP send
  let isNewUser: boolean | undefined;
  try {
    const existing = await prisma.user.findUnique({
      where: { phone: contact },
      select: { id: true },
    });
    isNewUser = !existing;
  } catch {
    // ไม่ log contact เพราะ contact อาจเป็นเบอร์โทร (PII)
    isNewUser = undefined;
  }

  // TEST_ACCOUNTS bypass: ถ้าเบอร์นี้อยู่ใน TEST_ACCOUNTS ใน lib/otp.ts
  // ให้ข้ามการส่ง SMS จริงทั้งหมด (APITEL จะ 503 เพราะเบอร์ทดสอบรับ SMS ไม่ได้)
  // verifyOtp สำหรับ test account ตรวจ fixed-code โดยตรง — ไม่ต้องการ otpStore
  // ดังนั้นไม่ต้อง storeOtp ด้วย (แต่ไม่ผิดถ้า store — ไม่ถูก read อยู่ดี)
  // กฎเดียวกับ verifyOtp: unconditional (ไม่มี env-guard) — ดู security note ล่างนี้
  // ⚠️ SECURITY NOTE สำหรับ safepay-security: bypass นี้ไม่ได้ gate ด้วย NODE_ENV
  // เพราะ verifyOtp เองก็ไม่มี env-guard — เราต้อง mirror model เดิม ไม่ใช่คิดเอง
  // ความเสี่ยง: ถ้า TEST_ACCOUNTS รั่วไปสู่ prod → attacker ใช้ '0000000001'/'123456' login ได้
  // แนะนำ: ให้ safepay-security พิจารณาเพิ่ม NODE_ENV !== 'production' guard ทั้งใน
  // verifyOtp และ isTestAccount พร้อมกัน (ไม่ใช่หน้าที่ developer task นี้)
  if (isTestAccount(contact)) {
    // isNewUser รวมอยู่ใน response เฉพาะเมื่อ lookup สำเร็จ (ไม่ undefined)
    const testPayload: Record<string, unknown> = { message: "OTP sent", contact };
    if (isNewUser !== undefined) testPayload.isNewUser = isNewUser;
    return NextResponse.json(testPayload);
  }

  const otp = storeOtp(contact);

  // ส่ง SMS จริง — เฉพาะเบอร์ที่ไม่ใช่ TEST_ACCOUNTS
  try {
    await sendOtpViaSms(contact, otp);
  } catch {
    // ไม่ expose error detail ให้ client — log เฉพาะ status ใน sendOtpViaSms แล้ว
    return NextResponse.json(
      { error: "ไม่สามารถส่ง SMS ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" },
      { status: 503 },
    );
  }

  // isNewUser รวมอยู่ใน response เฉพาะเมื่อ lookup สำเร็จ (ไม่ undefined)
  const payload: Record<string, unknown> = { message: "OTP sent", contact };
  if (isNewUser !== undefined) payload.isNewUser = isNewUser;
  return NextResponse.json(payload);
}
