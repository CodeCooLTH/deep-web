// feature 00022 — พิมพ์ใบปะหน้าหลายใบพร้อมกัน (FR-ISHIP-031)
//
// ร้านจริงแพ็คของรอบเดียวตอนเย็นแล้วพิมพ์ทีเดียว — endpoint นี้คือรูปแบบการใช้งานหลัก
//
// ข้อควรระวัง: รายการที่พิมพ์ไม่ได้ต้อง "บอกว่าข้ามเพราะอะไร" ห้ามตัดทิ้งเงียบ ๆ
// ถ้าเงียบ ร้านจะนึกว่าพิมพ์ครบแล้วปิดงาน จนพัสดุบางกล่องไม่มีใบปะหน้าไปโผล่ที่ขนส่ง
// จำนวนที่ข้ามส่งผ่าน header เพราะ body เป็น PDF ไม่ใช่ JSON

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipBulkLabelSchema } from "@/lib/validations";
import { ishipError, mapIShipError, NO_STORE } from "@/lib/iship/route-helpers";
import { getLabelPdf, getLabelPdfForOrders } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = v.safeParse(IShipBulkLabelSchema, body);
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  // รับได้ 2 แบบ: shipmentIds (จากหน้าที่รู้จักพัสดุอยู่แล้ว) หรือ orderTokens
  // (จากหน้ารายการคำสั่งซื้อ ซึ่งรู้จักแค่ token) — ต้องมีอย่างใดอย่างหนึ่ง
  const { shipmentIds, orderTokens } = parsed.output;
  if (!shipmentIds?.length && !orderTokens?.length) {
    return ishipError("INVALID_INPUT", "กรุณาเลือกอย่างน้อย 1 รายการ", 400);
  }

  try {
    const { pdf, skipped } = shipmentIds?.length
      ? await getLabelPdf(guard.shopId, shipmentIds)
      : await getLabelPdfForOrders(guard.shopId, orderTokens!);
    const count = shipmentIds?.length ?? orderTokens!.length;
    return new Response(pdf, {
      headers: {
        ...NO_STORE,
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="labels-${count}.pdf"`,
        "x-skipped-count": String(skipped.length),
        // รายละเอียดว่าข้ามใบไหนเพราะอะไร — encode เพราะ header เก็บภาษาไทยตรง ๆ ไม่ได้
        "x-skipped-detail": encodeURIComponent(JSON.stringify(skipped)),
      },
    });
  } catch (err) {
    return mapIShipError(err);
  }
}
