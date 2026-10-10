import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShopByUserId } from "@/services/shop.service";
import { isProActive } from "@/services/inventory-entitlement.service";
import { exportStockToCsv } from "@/services/inventory-stock.service";
import { formatDateStampBE } from "@/lib/format-date";
import { requireOnlineSalesVertical } from "@/lib/shop-api-guard";
import { resolveActiveShopContext } from "@/lib/shop-context";
import { can, rolesFromMembership } from "@/lib/shop-permissions";
import { forbiddenRoleResponse } from "@/lib/forbidden-role";

/**
 * GET /api/inventory/csv/export — seller export รายการสินค้า PHYSICAL + stockQty เป็นไฟล์ CSV
 * (feat 00009 S-11, API.md §4.6)
 *
 * PRO-gate: entitlement ต้อง ACTIVE+PRO (isProActive) — BASIC/LOCKED/NOT_SUBSCRIBED = 403
 * DAL ownership: shop derive จาก session เท่านั้น (เหมือน pattern /api/inventory/stock/adjust)
 */
export async function GET() {
  // 1. auth gate — ไม่มี session = 401
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  // 2. DAL: shop derive จาก session userId เท่านั้น — ห้ามรับ shopId จาก client
  const shop = await getShopByUserId(userId);
  if (!shop) {
    return NextResponse.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
  }

  // 2.5 vertical gate — Inventory Add-on เปิดเฉพาะ ONLINE_SALES (feature 00028 BR-SBT-10)
  const verticalGate = requireOnlineSalesVertical(shop.vertical);
  if (verticalGate) return verticalGate;

  // 3. PRO-gate — SRS TFR-DSP-10: CSV เฉพาะ package PRO เท่านั้น (BASIC ไม่ได้)
  if (!(await isProActive(shop.id))) {
    return NextResponse.json({ error: "INVENTORY_NOT_PRO" }, { status: 403 });
  }

  // 00071 P3: ต้นทุน = เจ้าของเท่านั้น — role สดจาก membership ของร้านนี้
  const ctx = await resolveActiveShopContext({ user: { id: userId, activeShopId: shop.id } });
  const canSeeCost = ctx !== null && can(rolesFromMembership(ctx.role), "P3");

  // 4. gen CSV จาก service แล้วส่งเป็นไฟล์แนบ
  const csv = await exportStockToCsv(shop.id, { includeCost: canSeeCost });

  // filename ปี(พ.ศ.)เดือนวัน ติดกัน — เรียงตามวันในโฟลเดอร์ได้
  // 🛑 ห้ามใช้ formatDate ตัด "-" (เดิมทำแบบนั้น) — formatDate เป็น วัน-เดือน-ปี แล้ว (2026-10-01)
  // ชื่อไฟล์จะกลายเป็น 01102569 ที่เรียงข้ามเดือนไม่ได้
  const yyyymmdd = formatDateStampBE(new Date());
  const filename = `deep-stock-export-${shop.id}-${yyyymmdd}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
