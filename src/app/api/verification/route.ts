import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { submitVerification, getVerifications } from "@/services/verification.service";
import { requireShopCapability } from "@/lib/shop-capability";

export async function GET() {
  const session = await getServerSession(authOptions);
  // 00071 T1: ยืนยันตัวตนร้าน = เจ้าของ/ผู้ดูแล
  const gate = await requireShopCapability(session, "T1");
  if (!gate.ok) return gate.response;
  const userId = gate.userId;
  // active shop context (P5-1): Personal → shopId null (เดิม), Business → แยกต่อร้าน
  const active = gate.active;
  const records = await getVerifications({
    userId,
    shopId: active.kind === "BUSINESS" ? active.shop.id : null,
  });
  return NextResponse.json(records);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const gate = await requireShopCapability(session, "T1");
  if (!gate.ok) return gate.response;
  const userId = gate.userId;
  const active = gate.active;
  const body = await request.json();
  const record = await submitVerification(
    userId,
    body,
    active.kind === "BUSINESS" ? active.shop.id : null,
  );
  return NextResponse.json(record, { status: 201 });
}
