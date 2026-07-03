import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { MovementHistoryQuerySchema } from "@/lib/validations";
import { getShopByUserId } from "@/services/shop.service";
import { isProActive } from "@/services/inventory-entitlement.service";
import { getStockMovementHistory } from "@/services/inventory-stock.service";

/**
 * GET /api/inventory/movements — ประวัติการเคลื่อนไหวสต็อกของสินค้าหนึ่งชิ้น (feat 00009 S-10)
 *
 * PRO-gate (ต่างจาก /api/inventory/stock/adjust ที่เป็น ACTIVE-gate) — ต้อง
 * entitlement ACTIVE+package=PRO เท่านั้น (API.md §4.5). cursor-paginated ด้วย
 * createdAt ของรายการสุดท้ายที่เห็น. shop derive จาก session เท่านั้น (DAL ownership)
 */
export async function GET(request: NextRequest) {
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

  // 3. parse query params ด้วย Valibot (searchParams ไม่ใช่ JSON body — manual parse)
  const { searchParams } = request.nextUrl;
  const rawTake = searchParams.get("take");
  const input = {
    productId: searchParams.get("productId") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    take: rawTake === null ? undefined : Number(rawTake),
  };
  const parsed = v.safeParse(MovementHistoryQuerySchema, input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. PRO-gate — SRS TFR-DSP-09: ต้อง ACTIVE+PRO (ไม่ใช่แค่ ACTIVE เหมือน manual adjust)
  if (!(await isProActive(shop.id))) {
    return NextResponse.json({ error: "INVENTORY_NOT_PRO" }, { status: 403 });
  }

  // 5. เรียก service — productId ที่ไม่ใช่ของ shop นี้ service คืน items:[] เอง
  //    (WHERE compound shopId+productId กรองอยู่แล้ว, ไม่ leak ข้อมูล ไม่ต้อง 404 แยก — API.md §4.5 หมายเหตุ)
  const result = await getStockMovementHistory(shop.id, parsed.output.productId, {
    cursor: parsed.output.cursor,
    take: parsed.output.take,
  });
  return NextResponse.json(result);
}
