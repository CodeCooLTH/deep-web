// feature 00022 — ค่าตั้งต้นของร้าน (ที่อยู่ผู้ส่ง + ค่าเริ่มต้นพัสดุ + โหมดสร้าง)
// GET อ่านได้ทั้งเจ้าของและพนักงาน · PUT เจ้าของร้านเท่านั้น (BR-ISHIP-03)

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipSettingsSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { getSettings, updateSettings } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  try {
    return ishipJson(await getSettings(guard.shopId));
  } catch (err) {
    return mapIShipError(err);
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireGeneralShop({ ownerOnly: true });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipSettingsSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  // มูลค่าเอาประกันมีความหมายเฉพาะเมื่อเปิดประกันสินค้า — กันร้านตั้งค่าที่ขัดกันเอง
  // แล้วไปงงทีหลังว่าทำไมส่งไปแล้วไม่มีผล
  if (parsed.output.optIsInsured && !parsed.output.optProductValue) {
    return ishipError(
      "INVALID_INPUT",
      "เปิดประกันสินค้าแล้วต้องระบุมูลค่าสินค้าที่ต้องการเอาประกัน",
      400,
    );
  }

  try {
    return ishipJson(await updateSettings(guard.shopId, parsed.output));
  } catch (err) {
    return mapIShipError(err);
  }
}
