import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CreateBusinessShopSchema } from "@/lib/validations";
import { createBusinessShop } from "@/services/business-shop.service";

/**
 * POST /api/business/shops — owner สร้าง Business shop เพิ่ม (ภายใต้ package quota)
 *
 * ทำไม ownerId derive จาก session เท่านั้น (ไม่รับจาก client body):
 * owner-only endpoint — session.user.id เป็น single source of truth สำหรับ identity
 * (ดู API.md §2) กัน owner A สร้างร้านแทนคนอื่น
 *
 * API.md §4.7
 */
export async function POST(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = (session.user as any).id as string;
  if (!ownerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 2. body validation (valibot)
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CreateBusinessShopSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  // 3. เรียก service — business logic (quota guard + create shop/member/wallet atomic) อยู่ใน service
  try {
    const shop = await createBusinessShop(ownerId, parsed.output);
    return NextResponse.json({ shopId: shop.id, shopName: shop.shopName, kind: shop.kind }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NO_ACTIVE_PACKAGE") {
      return NextResponse.json({ error: "NO_ACTIVE_PACKAGE" }, { status: 403 });
    }
    if (e instanceof Error && e.message === "BUSINESS_QUOTA_EXCEEDED") {
      return NextResponse.json({ error: "BUSINESS_QUOTA_EXCEEDED" }, { status: 403 });
    }
    // P2002 = unique-violation บน Shop.userId — คาดว่าเกิดเสมอสำหรับ owner ที่มี Personal shop แล้ว
    // เพราะ Phase 1 ยังไม่ได้ตัด @unique เดิมออก (partial unique index มาใน Phase 2 — ดู DATABASE.md §4/§9-1
    // และ comment ใน prisma/schema.prisma model Shop) ไม่ใช่ bug ของ route/service นี้
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "SHOP_CREATE_BLOCKED_PENDING_PHASE2" }, { status: 409 });
    }
    console.error("[POST /api/business/shops] ownerId:", ownerId, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
