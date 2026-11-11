import { NextResponse } from "next/server";
import * as v from "valibot";
import { listCapiLog } from "@/services/meta-capi-settings.service";
import { CapiLogQuerySchema } from "@/lib/validations";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { json, capiRun } from "@/lib/meta-capi/route-helpers";

/** GET /api/shops/meta-capi/[channelId]/log?status&eventKey&cursor&take — บันทึกการส่ง ใหม่→เก่า · X9 */
export const dynamic = "force-dynamic";

export const GET = async (req: Request, { params }: { params: Promise<{ channelId: string }> }) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => {
    const sp = new URL(req.url).searchParams;
    const parsed = v.safeParse(CapiLogQuerySchema, Object.fromEntries(["status", "eventKey", "cursor", "take"].flatMap((k) => (sp.get(k) ? [[k, sp.get(k)]] : []))));
    if (!parsed.success) return json({ error: parsed.issues[0]?.message ?? "Invalid input", code: "INVALID_INPUT" }, 400);
    return json(await listCapiLog(shopId, (await params).channelId, parsed.output as Parameters<typeof listCapiLog>[2]));
  });
};
