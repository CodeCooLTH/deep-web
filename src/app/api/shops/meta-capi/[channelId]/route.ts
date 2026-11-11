import { NextResponse } from "next/server";
import { getCapiPage, updateCapiPage } from "@/services/meta-capi-settings.service";
import { CapiPageUpdateSchema } from "@/lib/validations";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { json, parseBody, capiRun } from "@/lib/meta-capi/route-helpers";

/** GET/PUT /api/shops/meta-capi/[channelId] — ตั้งค่าเพจ + dataset (ไม่มี token ออกมา) · X9 */
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ channelId: string }> };

export const GET = async (_req: Request, { params }: Ctx) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => json(await getCapiPage(shopId, (await params).channelId)));
};
export const PUT = async (req: Request, { params }: Ctx) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => {
    const input = await parseBody(req, CapiPageUpdateSchema);
    if (input instanceof NextResponse) return input;
    return json({ setting: await updateCapiPage(shopId, (await params).channelId, input as Parameters<typeof updateCapiPage>[2]) });
  });
};
