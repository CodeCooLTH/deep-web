import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import { getCancellationSummary } from "@/services/customer.service";

/**
 * GET /api/shops/current/customers/lookup?phone= — ค้นลูกค้า + สรุปประวัติการยกเลิก (API.md #10)
 *
 * 🛑 ความเป็นส่วนตัว (BR-LODG-39) — ข้อบังคับของ endpoint นี้:
 *   - คืนได้เฉพาะ "จำนวนครั้ง" ที่ถูกยกเลิกด้วยความผิดของผู้จอง
 *   - ห้ามคืน shopId / ชื่อร้าน / วันที่ / publicToken / รายละเอียดการจองของร้านอื่น
 *   - `name` คืนได้เฉพาะเมื่อลูกค้ารายนี้เคยมีออเดอร์กับ "ร้านที่เรียก" เท่านั้น
 *     (คงหลักความเป็นส่วนตัวของ Customer Directory — ผู้ขายเห็นได้เฉพาะลูกค้าของร้านตัวเอง)
 *   - ผลลัพธ์ใช้ "เตือน" เท่านั้น ห้ามใช้บล็อกการสร้างการจอง
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;

  const raw = request.nextUrl.searchParams.get("phone") ?? "";
  const phone = normalizePhone(raw);
  if (!phone) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });

  try {
    const customer = await prisma.customer.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!customer) return jsonNoStore({ found: false });

    // ชื่อมาจากออเดอร์ของ "ร้านนี้" เท่านั้น — ถ้าไม่เคยสั่งกับร้านนี้จะได้ null
    const ownOrder = await prisma.order.findFirst({
      where: { customerId: customer.id, shopId: ctx.shopId, buyerName: { not: null } },
      select: { buyerName: true },
      orderBy: { createdAt: "desc" },
    });

    const cancellationSummary = await getCancellationSummary(customer.id);

    return jsonNoStore({
      found: true,
      customerId: customer.id,
      name: ownOrder?.buyerName ?? null,
      cancellationSummary,
    });
  } catch (e: unknown) {
    // ไม่ log เบอร์โทร (PII) — ใช้ shopId เป็น ref เท่านั้น
    console.error("[GET customers/lookup] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
