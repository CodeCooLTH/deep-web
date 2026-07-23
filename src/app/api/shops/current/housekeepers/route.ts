import { NextRequest } from "next/server";
import * as v from "valibot";
import { CreateHousekeeperSchema } from "@/lib/validations";
import { requireLodgingShop, jsonNoStore } from "@/lib/shop-api-guard";
import { listHousekeepers, createHousekeeper } from "@/services/housekeeping.service";

/** GET/POST /api/shops/current/housekeepers — รายชื่อ/เพิ่มแม่บ้าน (API.md #11) */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;
  try {
    const items = await listHousekeepers(ctx.shopId);
    return jsonNoStore({ housekeepers: items });
  } catch (e: unknown) {
    console.error("[GET housekeepers] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireLodgingShop();
  if ("error" in ctx) return ctx.error;
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(CreateHousekeeperSchema, body ?? {});
  if (!parsed.success) return jsonNoStore({ error: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const hk = await createHousekeeper(ctx.shopId, parsed.output);
    return jsonNoStore(hk, { status: 201 });
  } catch (e: unknown) {
    console.error("[POST housekeepers] shopId:", ctx.shopId, e instanceof Error ? e.message : e);
    return jsonNoStore({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
