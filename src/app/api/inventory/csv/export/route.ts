import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShopByUserId } from "@/services/shop.service";
import { isProActive } from "@/services/inventory-entitlement.service";
import { exportStockToCsv } from "@/services/inventory-stock.service";
import { formatDate } from "@/lib/format-date";

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

  // 3. PRO-gate — SRS TFR-DSP-10: CSV เฉพาะ package PRO เท่านั้น (BASIC ไม่ได้)
  if (!(await isProActive(shop.id))) {
    return NextResponse.json({ error: "INVENTORY_NOT_PRO" }, { status: 403 });
  }

  // 4. gen CSV จาก service แล้วส่งเป็นไฟล์แนบ
  const csv = await exportStockToCsv(shop.id);

  // filename YYYYMMDD — ใช้ formatDate (SSOT src/lib/format-date.ts) แล้วตัด "-" ออก
  // หมายเหตุ: formatDate คืนปี พ.ศ. ตามกฎระบบ (docs/conventions/date-format.md) เพื่อความ
  // สอดคล้องทั้งระบบ แม้เป็นชื่อไฟล์ก็ยังถือเป็นสิ่งที่ผู้ใช้ (seller) เห็นโดยตรง
  const yyyymmdd = formatDate(new Date()).replace(/-/g, "");
  const filename = `deep-stock-export-${shop.id}-${yyyymmdd}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
