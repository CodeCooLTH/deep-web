// feature 00022 (ส่วนขยาย) — ผูกพัสดุที่มีอยู่แล้วบน iShip เข้ากับคำสั่งซื้อ
//
// ต่างจาก POST /shipments ตรงที่ไม่เรียก create_order เลย จึงไม่เกิดค่าใช้จ่ายใหม่
// ของร้าน — แต่ยังต้องผ่านการยืนยันของร้านอยู่ดี เพราะผูกผิดใบแปลว่าเลขติดตามของ
// ลูกค้าคนหนึ่งถูกส่งไปให้อีกคน

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipLinkShipmentSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { linkShipment, resolveOrderIdByToken } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // พนักงานร้านผูกพัสดุได้ — เป็นงานประจำวันเหมือนการเปิดพัสดุ ไม่ใช่การตั้งค่าร้าน
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipLinkShipmentSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  const { orderId: rawId, orderToken, trackingNo, addressResolution } = parsed.output;
  if (!rawId && !orderToken) {
    return ishipError("INVALID_INPUT", "ต้องระบุคำสั่งซื้อ", 400);
  }

  try {
    const orderId = rawId ?? (await resolveOrderIdByToken(guard.shopId, orderToken!));
    const shipment = await linkShipment(
      guard.shopId,
      guard.userId,
      orderId,
      trackingNo.trim(),
      addressResolution,
    );
    return ishipJson(shipment, 201);
  } catch (err) {
    return mapIShipError(err);
  }
}
