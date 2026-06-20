import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { VerifyOtpSchema } from "@/lib/validations";
import { verifyOtp } from "@/lib/otp";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = v.safeParse(VerifyOtpSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { contact, type, otp } = parsed.output;
  const valid = await verifyOtp(contact, otp);

  if (!valid) {
    return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 401 });
  }

  return NextResponse.json({ verified: true, contact, type });
}
