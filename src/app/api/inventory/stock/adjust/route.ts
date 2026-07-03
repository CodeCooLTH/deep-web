import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ManualStockAdjustSchema } from "@/lib/validations";
import { getShopByUserId } from "@/services/shop.service";
import { isEntitlementActive } from "@/services/inventory-entitlement.service";
import { manualAdjustStock, InsufficientStockError } from "@/services/inventory-stock.service";

/**
 * POST /api/inventory/stock/adjust — seller ปรับสต็อกด้วยมือ (feat 00009 S-9)
 *
 * ACTIVE-gate (ไม่ใช่ PRO-gate) — ใช้ได้ทั้ง package BASIC/PRO ตราบใด entitlement ยัง ACTIVE
 * (API.md §4.4). shop derive จาก session เท่านั้น (DAL ownership — เหมือน pattern
 * /api/inventory/subscribe) ห้ามรับ shopId จาก client
 */
export async function POST(request: NextRequest) {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  // 2. DAL: shop derive จาก session userId เท่านั้น
  const shop = await getShopByUserId(userId);
  if (!shop) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
  }

  // 3. parse body ด้วย Valibot
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(ManualStockAdjustSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. ACTIVE-gate — SRS TFR-DSP-01: ใช้ได้ทั้ง BASIC/PRO ขอแค่ ACTIVE (ไม่ใช่ PRO-gate)
  if (!(await isEntitlementActive(shop.id))) {
    return NextResponse.json({ error: "INVENTORY_NOT_ACTIVE" }, { status: 403 });
  }

  // 5. เรียก service ใน $transaction เดียว (updateMany + stockMovement.create ต้อง atomic — RC-3)
  try {
    const result = await prisma.$transaction((tx) =>
      manualAdjustStock(tx, {
        shopId: shop.id,
        productId: parsed.output.productId,
        delta: parsed.output.delta,
        note: parsed.output.note,
        actorUserId: userId,
      }),
    );
    return NextResponse.json(result);
  } catch (e: unknown) {
    // ⚠️ service throw error string ต่างกันตามเคส — ต้อง map ครบทุกตัว (บทเรียน
    // service-error→route-catch: ห้ามปล่อยตกไป 500 เฉยๆ)
    if (e instanceof InsufficientStockError) {
      return NextResponse.json(
        { error: `สต็อกไม่พอ: ${e.productName}` },
        { status: 400 },
      );
    }
    if (e instanceof Error && e.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "PRODUCT_NOT_FOUND" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "PRODUCT_NOT_TRACKED") {
      return NextResponse.json({ error: "PRODUCT_NOT_TRACKED" }, { status: 400 });
    }
    if (e instanceof Error && e.message === "DELTA_ZERO") {
      // Valibot กัน delta=0 อยู่แล้ว (ไม่ควรถึงจุดนี้) — เผื่อไว้กัน 500 เงียบ
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error(
      "[POST /api/inventory/stock/adjust] shopId:",
      shop.id,
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
