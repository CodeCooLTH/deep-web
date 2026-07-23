import { NextRequest } from "next/server";
import * as v from "valibot";
import { UpdateHousekeeperSchema } from "@/lib/validations";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import { updateHousekeeper, HousekeeperNotFoundError } from "@/services/housekeeping.service";

/** PATCH /api/shops/current/housekeepers/[id] — แก้ไข/ปิดการใช้งานแม่บ้าน (API.md #12) */
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(UpdateHousekeeperSchema, body ?? {});
  if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const hk = await updateHousekeeper(ctx.shopId, id, parsed.output);
    return jsonNoStore(hk);
  } catch (e: unknown) {
    if (e instanceof HousekeeperNotFoundError) return jsonNoStore({ error: "HOUSEKEEPER_NOT_FOUND" }, { status: 404 });
    console.error("[PATCH housekeepers/:id] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
