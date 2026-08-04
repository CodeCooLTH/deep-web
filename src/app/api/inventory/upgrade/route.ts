import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShopByUserId } from "@/services/shop.service";
import { upgradeToProEntitlement } from "@/services/inventory-entitlement.service";
import { requireOnlineSalesVertical } from "@/lib/shop-api-guard";

/**
 * POST /api/inventory/upgrade — seller อัพเกรดจาก BASIC ACTIVE เป็น PRO กลางรอบ (฿599 หัก atomic, no-proration)
 *
 * ทำไม shop derive จาก session เท่านั้น (ไม่รับ shopId จาก body):
 * DAL ownership (S-C7 pattern — ดู src/app/api/wallet/topup/route.ts) — ถ้ารับ
 * shopId จาก client, seller A อาจส่ง shopId ของ seller B เพื่ออัพเกรด/หักเงินแทนคนอื่น.
 * session.user.id เป็น single source of truth สำหรับ identity — ดู API.md §2.
 *
 * Request body: ไม่มี ({}) — API.md §4.2
 */
export async function POST() {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // cast เหมือน pattern ที่มีอยู่ใน src/app/api/wallet/route.ts:29
  const userId = (session.user as any).id as string;

  // 2. DAL: shop derive จาก session userId เท่านั้น — ห้ามรับ shopId จาก client
  const shop = await getShopByUserId(userId);
  if (!shop) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
  }

  // 2.5 vertical gate — Inventory Add-on เปิดเฉพาะ ONLINE_SALES (feature 00028 BR-SBT-10)
  const verticalGate = requireOnlineSalesVertical(shop.vertical);
  if (verticalGate) return verticalGate;

  // 3. เรียก service — business logic (idempotency guard + deduct + upgrade) อยู่ใน service
  try {
    const result = await upgradeToProEntitlement(shop.id);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "ENTITLEMENT_NOT_ACTIVE") {
      return NextResponse.json(
        { error: "ยังไม่ได้สมัครใช้งาน หรือถูกล็อกอยู่" },
        { status: 409 },
      );
    }
    if (e instanceof Error && e.message === "ALREADY_PRO") {
      return NextResponse.json(
        { error: "ใช้งาน Deep Stock Pro อยู่แล้ว" },
        { status: 409 },
      );
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json(
        { error: "ยอดเงินไม่พอ กรุณาเติมเงินก่อนอัพเกรด" },
        { status: 402 },
      );
    }
    console.error("[POST /api/inventory/upgrade] shopId:", shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
