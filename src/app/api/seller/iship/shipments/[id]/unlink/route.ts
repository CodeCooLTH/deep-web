// feature 00022 (ส่วนขยาย) — เลิกผูกพัสดุ (ไม่ยกเลิกพัสดุจริงกับขนส่ง)
//
// คนละเรื่องกับ /cancel โดยสิ้นเชิง — อันนั้นบอกขนส่งให้ยกเลิกพัสดุจริง อันนี้แค่ตัด
// ความสัมพันธ์ระหว่างพัสดุกับคำสั่งซื้อในระบบเรา เพราะร้านผูกผิดใบ
// พัสดุจริงที่ร้านเปิดไว้บน iShip ยังอยู่ครบและยังส่งของตามปกติ
//
// service กันไว้แล้วว่าใบที่ Deep เป็นคนเปิด (source = CREATED) เรียก endpoint นี้ไม่ได้ —
// ใบพวกนั้นต้องยกเลิกกับขนส่งจริง ไม่ใช่ปล่อยพัสดุค้างอยู่โดยไม่มีใครดูแล

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { unlinkShipment } from "@/services/iship.service";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireGeneralShop({ shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const { id } = await params;
  try {
    await unlinkShipment(guard.shopId, id);
    return ishipJson({ ok: true });
  } catch (err) {
    return mapIShipError(err);
  }
}
