// feature 00022 — ค่าตั้งต้นของร้าน (ที่อยู่ผู้ส่ง + ค่าเริ่มต้นพัสดุ + โหมดสร้าง)
// GET อ่านได้ทั้งเจ้าของและพนักงาน · PUT เจ้าของร้านเท่านั้น (BR-ISHIP-03)

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipSettingsSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { getSettings, updateSettings } from "@/services/iship.service";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireGeneralShop({ shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;

  try {
    return ishipJson(await getSettings(guard.shopId));
  } catch (err) {
    return mapIShipError(err);
  }
}

export async function PUT(request: NextRequest) {
  // ชั่วคราว (user สั่ง 2026-07-29): ปลด ownerOnly ให้พนักงานร้านตั้งค่าได้ด้วย
  // เดิม BR-ISHIP-03 ให้เฉพาะเจ้าของร้าน แต่ทำให้คนที่ไม่ใช่เจ้าของทดสอบ/ใช้งานไม่ได้เลย
  // ผ่อนเฉพาะกลุ่ม "ตั้งค่า" (ที่อยู่ผู้ส่ง/ค่าตั้งต้นพัสดุ/โหมดสร้าง) — การวางและถอด token
  // ยังเป็นสิทธิ์เจ้าของร้านเท่านั้น เพราะเป็น credential และถอดแล้วทั้งร้านใช้งานไม่ได้
  // TODO: ตัดสินใจให้จบว่าจะคืน ownerOnly หรือแก้ BR-ISHIP-03 ถาวร
  const guard = await requireGeneralShop({ shopId: readIShipShopIdFromQuery(request) });
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
