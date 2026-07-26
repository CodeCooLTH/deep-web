// feature 00022 — เรียกรถเข้ารับพัสดุ (FR-ISHIP-051)
//
// ระดับร้าน ไม่ใช่ระดับออเดอร์ — รถมารับครั้งเดียวได้หลายกล่อง
// ข้อควรระวัง: นี่คือการเรียก "คนจริง" มาที่หน้าร้าน UI ต้องยืนยันก่อนเสมอ

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipPickupSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { requestPickup } from "@/services/iship.service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipPickupSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  try {
    const pickup = await requestPickup(guard.shopId, guard.userId, parsed.output);
    return ishipJson(
      {
        id: pickup.id,
        status: pickup.status,
        ticketPickupId: pickup.ticketPickupId,
        staffName: pickup.staffName,
        staffPhone: pickup.staffPhone,
        timeoutAtText: pickup.timeoutAtText,
        ticketMessage: pickup.ticketMessage,
        isDryRun: pickup.isDryRun,
      },
      201,
    );
  } catch (err) {
    return mapIShipError(err);
  }
}
