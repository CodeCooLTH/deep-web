// feature 00022 — รายชื่อขนส่งของบัญชี iShip ที่ร้านผูกไว้
//
// proxy ผ่านเซิร์ฟเวอร์เสมอ — ถ้าให้เบราว์เซอร์ยิงเองจะต้องส่ง token ลงหน้าเว็บ
// รายชื่อมาจากบัญชีจริงของร้าน ไม่ใช่รายการที่เขียนตายไว้ในโค้ด เพราะแต่ละบัญชี
// เปิดใช้ขนส่งไม่เหมือนกัน

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { listCouriers } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  try {
    return ishipJson(await listCouriers(guard.shopId));
  } catch (err) {
    return mapIShipError(err);
  }
}
