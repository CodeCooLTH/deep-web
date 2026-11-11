import { NextResponse } from "next/server";
import { deleteCapiDataset, updateCapiDataset } from "@/services/meta-capi-settings.service";
import { CapiDatasetUpdateSchema } from "@/lib/validations";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { json, parseBody, capiRun } from "@/lib/meta-capi/route-helpers";

/** PATCH/DELETE /api/shops/meta-capi/[channelId]/datasets/[datasetRowId] — แก้ชื่อ/เหตุการณ์/token · ลบ · X9 */
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ channelId: string; datasetRowId: string }> };

export const PATCH = async (req: Request, { params }: Ctx) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => {
    const input = await parseBody(req, CapiDatasetUpdateSchema);
    if (input instanceof NextResponse) return input;
    const { channelId, datasetRowId } = await params;
    return json({ dataset: await updateCapiDataset(shopId, channelId, datasetRowId, input as Parameters<typeof updateCapiDataset>[3]) });
  });
};
export const DELETE = async (_req: Request, { params }: Ctx) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => {
    const { channelId, datasetRowId } = await params;
    await deleteCapiDataset(shopId, channelId, datasetRowId);
    return json({ ok: true });
  });
};
