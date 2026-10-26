// feature 00085 — ร้านปิด/เลิกปิดพัสดุขาไปที่มีปัญหา (API.md)
// สิทธิ์: S1 + service เทียบ shipment.shopId กับ guard.shopId (ไม่ใช้ร้าน active ของ session)
import * as v from "valibot";
import type { NextRequest } from "next/server";
import { requireGeneralShop } from "@/lib/shop-api-guard";
import { readIShipShopIdFromQuery } from "@/lib/iship/request-shop";
import { ishipError, ishipJson, mapIShipError, readJson } from "@/lib/iship/route-helpers";
import { ParcelCloseBodySchema } from "@/lib/validations";
import {
  ParcelCloseError,
  closeParcelProblem,
  previewParcelClose,
  reopenParcelProblem,
  type ParcelCloseErrorCode,
} from "@/services/parcel-close.service";

export const dynamic = "force-dynamic";

// Record บังคับครบทุก code — เพิ่ม code ใหม่ใน service แล้วลืมแมป = tsc แดง (ไม่ตกเป็น 500)
const STATUS: Record<ParcelCloseErrorCode, number> = {
  REFUND_ANSWER_REQUIRED: 400,
  NOT_FOUND: 404,
  ALREADY_CLOSED: 409,
  NOT_IN_PROBLEM: 409,
  NOT_FORWARD: 409,
  NOT_ACTIVE: 409,
  ORDER_FINISHED: 409,
  NOT_SHIPPED_MODE: 409,
  SERVICE_SHOP_UNSUPPORTED: 409,
  OUTCOME_CHANGED: 409,
  NOT_CLOSED: 409,
};

function mapParcelCloseError(err: unknown) {
  if (err instanceof ParcelCloseError) {
    return ishipJson(
      { error: { code: err.code, message: err.userMessage }, ...(err.preview ? { preview: err.preview } : {}) },
      STATUS[err.code],
    );
  }
  return mapIShipError(err); // อื่น ๆ → 500 + console.error ในนั้น
}

type Ctx = { params: Promise<{ id: string }> };

// ด่าน cap ต้องอยู่ในตัว handler แต่ละเมธอดตรง ๆ — เทส route-capability-inventory ตรวจ literal ต่อเมธอด
export async function GET(request: NextRequest, { params }: Ctx) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  try {
    return ishipJson(await previewParcelClose(guard.shopId, (await params).id));
  } catch (err) {
    return mapParcelCloseError(err);
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  const parsed = v.safeParse(ParcelCloseBodySchema, await readJson(request));
  if (!parsed.success) return ishipError("VALIDATION", parsed.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", 400);
  try {
    return ishipJson(await closeParcelProblem({ shopId: guard.shopId, userId: guard.userId, shipmentId: (await params).id, ...parsed.output }));
  } catch (err) {
    return mapParcelCloseError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const guard = await requireGeneralShop({ cap: "S1", shopId: readIShipShopIdFromQuery(request) });
  if ("error" in guard) return guard.error;
  try {
    return ishipJson(await reopenParcelProblem({ shopId: guard.shopId, userId: guard.userId, shipmentId: (await params).id }));
  } catch (err) {
    return mapParcelCloseError(err);
  }
}
