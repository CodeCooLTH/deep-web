import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { SendOtpSchema } from "@/lib/validations";
import { consumeOtpRequestQuota, sendOtpViaSms, storeOtp } from "@/lib/otp";

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

  const otp = storeOtp(contact);

  // ส่ง SMS จริงทุก env — ไม่มี bypass แม้แต่ TEST_ACCOUNTS (ยืนยันจาก Controller แล้ว)
  try {
    await sendOtpViaSms(contact, otp);
  } catch {
    // ไม่ expose error detail ให้ client — log เฉพาะ status ใน sendOtpViaSms แล้ว
    return NextResponse.json(
      { error: "ไม่สามารถส่ง SMS ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" },
      { status: 503 },
    );
  }

  return NextResponse.json({ message: "OTP sent", contact });
}
