// feature 00022 — ทดสอบการเชื่อมต่อซ้ำ (FR-ISHIP-002)
// ผลลบ → service ตั้งสถานะเป็น TOKEN_INVALID ให้เอง (BR-ISHIP-14)

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { verifyConnection } from "@/services/iship.service";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // ชั่วคราว (user สั่ง 2026-07-29): ปลด ownerOnly — เป็นแค่การตรวจว่า token ที่มีอยู่ยังใช้ได้ไหม
  // ไม่ได้แก้/เปิดเผยค่า token และไม่เปลี่ยนอะไรนอกจากสถานะการเชื่อมต่อ
  const guard = await requireGeneralShop({ shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  try {
    return ishipJson(await verifyConnection(guard.shopId));
  } catch (err) {
    return mapIShipError(err);
  }
}
