import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { CsvImportSchema } from "@/lib/validations";
import { getShopByUserId } from "@/services/shop.service";
import { isProActive } from "@/services/inventory-entitlement.service";
import { importStockFromCsvRows } from "@/services/inventory-stock.service";

// 500 แถว sequential (per-row transaction) อาจใช้เวลานาน — กัน default timeout ตัดกลางคัน (API.md §4.7)
export const maxDuration = 30;

/**
 * POST /api/inventory/csv/import — seller import stockQty แบบ batch จาก rows ที่ client parse แล้ว
 * (feat 00009 S-11, API.md §4.7)
 *
 * PRO-gate: entitlement ต้อง ACTIVE+PRO — BASIC/LOCKED/NOT_SUBSCRIBED = 403
 * DAL ownership: shop derive จาก session เท่านั้น
 *
 * ⚠️ HTTP 200 เสมอถ้า request ผ่าน validation ระดับ body (ไม่ใช่ per-row) — ความล้มเหลว
 * รายแถวอยู่ใน results[] ไม่ใช่ HTTP error code (FR-DSP-10-AC-03: รายงานว่าแถวไหนล้มเหลว
 * ไม่ทำให้ทั้งไฟล์ fail เงียบ ๆ). 400/401/403/429 = request-level เท่านั้น
 */
export async function POST(request: NextRequest) {
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

  // 4. parse body ด้วย Valibot — rows ว่าง/เกิน 500/schema ผิด = 400 request-level
  // ข้อความ "นำเข้าได้สูงสุด 500 แถวต่อครั้ง" ฝังอยู่ใน CsvImportSchema (v.maxLength) แล้ว
  // (src/lib/validations.ts) — ใช้ issue.message ตรง ๆ เหมือน pattern /api/inventory/subscribe
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CsvImportSchema, body);
  if (!parsed.success) {
    const firstIssue = parsed.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  // 5. เรียก service — per-row isolation อยู่ใน service เอง (แถวหนึ่ง fail ไม่ rollback แถวอื่น)
  const result = await importStockFromCsvRows(shop.id, userId, parsed.output.rows);
  return NextResponse.json(result, { status: 200 });
}
