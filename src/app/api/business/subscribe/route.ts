import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SubscribeBusinessPackageSchema } from "@/lib/validations";
import { subscribeBusinessPackage } from "@/services/business-package.service";

/**
 * POST /api/business/subscribe — owner สมัคร Business Package ครั้งแรก
 *
 * ทำไม ownerId derive จาก session เท่านั้น (ไม่รับจาก client body):
 * owner-only endpoint — session.user.id เป็น single source of truth สำหรับ identity
 * (ดู API.md §2) กัน owner A สมัคร/หักเครดิตแทนคนอื่น
 *
 * API.md §4.2
 */
export async function POST(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2. body validation (valibot) — pattern จาก src/app/api/scam-reports/route.ts
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(SubscribeBusinessPackageSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  // 3. เรียก service — business logic (idempotency guard + deduct + create) อยู่ใน service
  try {
    const result = await subscribeBusinessPackage(ownerId, parsed.output.tier);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "PERSONAL_SHOP_REQUIRED") {
      return NextResponse.json({ error: "PERSONAL_SHOP_REQUIRED" }, { status: 412 });
    }
    if (e instanceof Error && e.message === "SUBSCRIPTION_ALREADY_EXISTS") {
      return NextResponse.json({ error: "SUBSCRIPTION_ALREADY_EXISTS" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json({ error: "INSUFFICIENT_CREDIT" }, { status: 402 });
    }
    console.error("[POST /api/business/subscribe] ownerId:", ownerId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
