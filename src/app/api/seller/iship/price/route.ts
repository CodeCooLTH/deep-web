// feature 00022 — ประเมินค่าส่งก่อนกดเปิดพัสดุ (FR-ISHIP-034)
//
// แยกจาก POST /shipments โดยสิ้นเชิง: ตัวนั้นเปิดพัสดุจริงและเสียเงิน ตัวนี้แค่ถามราคา
// ไม่ก่อค่าใช้จ่าย จึงยิงซ้ำได้ตอนร้านแก้ขนาด/น้ำหนัก/ขนส่ง
//
// ที่อยู่ผู้ส่งไม่รับจาก body — service อ่านจากการตั้งค่าร้านเสมอ ไม่งั้นหน้าจอจะประเมิน
// ราคาจากต้นทางที่ไม่ใช่ที่ส่งจริง

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipPriceQuoteSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { estimateShippingPrice } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipPriceQuoteSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  try {
    return ishipJson(await estimateShippingPrice(guard.shopId, parsed.output));
  } catch (err) {
    return mapIShipError(err);
  }
}
