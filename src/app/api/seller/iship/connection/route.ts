// feature 00022 — การเชื่อมต่อบัญชี iShip ของร้าน
// GET    ดูสถานะ         — เจ้าของร้าน + พนักงาน
// POST   วาง/เปลี่ยน token — เจ้าของร้านเท่านั้น (BR-ISHIP-03)
// DELETE ยกเลิกการเชื่อมต่อ — เจ้าของร้านเท่านั้น

import type { NextRequest } from "next/server";
import * as v from "valibot";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { IShipConnectSchema } from "@/lib/validations";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { connect, disconnect, getConnection } from "@/services/iship.service";

// per-user data ที่เปลี่ยนได้ตลอด — ห้าม prerender/cache
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireGeneralShop();
  if ("error" in guard) return guard.error;

  try {
    return ishipJson(await getConnection(guard.shopId));
  } catch (err) {
    return mapIShipError(err);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireGeneralShop({ ownerOnly: true });
  if ("error" in guard) return guard.error;

  const parsed = v.safeParse(IShipConnectSchema, await readJson(request));
  if (!parsed.success) {
    return ishipError(
      "INVALID_INPUT",
      parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      400,
    );
  }

  try {
    // connect() ทดสอบ token กับ iShip ก่อนบันทึกเสมอ (BR-ISHIP-11)
    // ถ้าไม่ผ่าน จะโยน IShipError ออกมาโดยที่ยังไม่มีอะไรถูกเขียนลงฐานข้อมูล
    return ishipJson(await connect(guard.shopId, guard.userId, parsed.output.token), 201);
  } catch (err) {
    return mapIShipError(err);
  }
}

export async function DELETE() {
  const guard = await requireGeneralShop({ ownerOnly: true });
  if ("error" in guard) return guard.error;

  try {
    await disconnect(guard.shopId);
    // ประวัติพัสดุที่เคยสร้างยังอยู่ครบ ถูกลบเฉพาะ token (BR-ISHIP-15)
    return ishipJson({ ok: true });
  } catch (err) {
    return mapIShipError(err);
  }
}
