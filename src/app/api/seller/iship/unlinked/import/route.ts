// feature 00022 (ส่วนขยาย) — ดึงพัสดุจาก iShip มาสร้างคำสั่งซื้อใหม่แล้วผูกให้เลย
//
// ต่างจาก /shipments/link ตรงที่ยังไม่มีคำสั่งซื้ออยู่ก่อน — ตัวนี้สร้างให้จากข้อมูลบนพัสดุ
// สำหรับร้านที่เปิดพัสดุบน iShip เป็นหลักและไม่อยากคีย์ออเดอร์ซ้ำอีกรอบ
//
// ไม่เรียก create_order ของ iShip = ไม่เกิดค่าใช้จ่ายใหม่ของร้าน
// แต่ "สร้างคำสั่งซื้อจริงในระบบเรา" จึงต้องผ่านการยืนยันของร้านก่อนเสมอที่ฝั่ง UI

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipImportParcelSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { importParcelAsOrder } from "@/services/iship.service";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipImportParcelSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  try {
    const result = await importParcelAsOrder(
      guard.shopId,
      guard.userId,
      parsed.output.trackingNo.trim(),
      { name: parsed.output.itemName, price: parsed.output.itemPrice },
    );
    return ishipJson(result, 201);
  } catch (err) {
    return mapIShipError(err);
  }
}
