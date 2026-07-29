// feature 00022 — รายการกล่องจากบัญชี iShip ของร้าน (ให้เลือกแทนกรอกขนาดเอง)
//
// คืนทั้งกล่องมาตรฐานของ iShip (user_id = null) และกล่องที่ร้านสร้างเองบนหลังบ้าน iShip
// (user_id มีค่า) — ส่งต่อทั้งก้อนโดยไม่กรอง เพราะหน้าจอต้องใช้ user_id แยกกลุ่มให้กล่อง
// ของร้านขึ้นก่อน ไม่งั้นมันไปกองท้ายกล่องมาตรฐาน ~24 ใบจนร้านนึกว่าไม่มี

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { listBoxes } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  try {
    return ishipJson(await listBoxes(guard.shopId));
  } catch (err) {
    return mapIShipError(err);
  }
}
