// ส่วนขยาย feature 00022 — เทียบราคาทุกขนส่งในคำขอเดียว (ปุ่ม "เทียบราคา")
//
// แยกจาก POST /price (รายตัว): ตัวนี้ server เป็นคน fan-out ไปทุกขนส่งของร้าน
// เพื่อไม่ให้ client ต้องยิง ~17 ครั้งจนชน rate-limit ของเราเอง — check-price
// ฝั่ง iShip ไม่ก่อค่าใช้จ่าย
//
// ที่อยู่ผู้ส่งไม่รับจาก body — service อ่านจากการตั้งค่าร้านเสมอ (เหตุผลเดียวกับ /price)

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipPriceCompareSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { compareShippingPrices } from "@/services/iship.service";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipPriceCompareSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  try {
    return ishipJson(await compareShippingPrices(guard.shopId, parsed.output));
  } catch (err) {
    return mapIShipError(err);
  }
}
