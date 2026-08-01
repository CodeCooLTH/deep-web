// feature 00022 (ส่วนขยาย) — พัสดุบน iShip ที่ยังไม่ถูกผูกกับคำสั่งซื้อไหน
//
// ใช้เติมรายการให้ร้านเลือก ตอนที่ร้านเปิดพัสดุบนเว็บ iShip ไว้ก่อนแล้วค่อยมาบันทึก
// คำสั่งซื้อทีหลัง
//
// ข้อควรระวังเรื่องข้อมูลส่วนบุคคล: คำตอบนี้มีชื่อ/เบอร์/ที่อยู่ผู้รับของพัสดุทุกใบใน
// 7 วัน จึงต้อง private,no-store เสมอ (มาให้แล้วจาก ishipJson) และต้องผ่าน
// requireGeneralShop — เป็นข้อมูลของร้าน ไม่ใช่ข้อมูลสาธารณะ

import { requireGeneralShop } from "@/lib/shop-api-guard";
import { ishipJson, mapIShipError } from "@/lib/iship/route-helpers";
import { listUnlinkedParcels } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  try {
    return ishipJson({ parcels: await listUnlinkedParcels(guard.shopId) });
  } catch (err) {
    return mapIShipError(err);
  }
}
