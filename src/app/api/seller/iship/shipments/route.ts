// feature 00022 — สร้างพัสดุจากคำสั่งซื้อ (FR-ISHIP-020/021/022)
//
// ข้อควรระวัง: endpoint นี้ก่อค่าใช้จ่ายจริงของร้านทุกครั้งที่สำเร็จ
// UI ต้องมีหน้าต่างยืนยันก่อนเรียกเสมอในโหมด "ถามทุกครั้ง"

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipCreateShipmentSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { createShipment } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // พนักงานร้านเปิดพัสดุได้ — เป็นงานประจำวัน ไม่ใช่การตั้งค่า
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipCreateShipmentSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  try {
    const shipment = await createShipment(
      guard.shopId,
      guard.userId,
      parsed.output.orderId,
      parsed.output.override,
    );
    // status = FAILED ยังตอบ 201 เพราะ "แถวพัสดุถูกสร้างแล้ว" และ UI ต้องได้ shipmentId
    // ไปแสดงปุ่มลองใหม่ — ความล้มเหลวอยู่ใน payload ไม่ใช่ใน HTTP status
    return ishipJson(shipment, 201);
  } catch (err) {
    return mapIShipError(err);
  }
}
