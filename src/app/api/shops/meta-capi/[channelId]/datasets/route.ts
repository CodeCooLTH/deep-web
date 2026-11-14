import { NextResponse } from "next/server";
import { addCapiDataset } from "@/services/meta-capi-settings.service";
import { CapiDatasetCreateSchema } from "@/lib/validations";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { json, parseBody, capiRun } from "@/lib/meta-capi/route-helpers";

/** POST /api/shops/meta-capi/[channelId]/datasets — เพิ่ม dataset (PAGE = ขอจาก Meta · MANUAL = กรอกเอง) · X9 */
export const dynamic = "force-dynamic";

export const POST = async (req: Request, { params }: { params: Promise<{ channelId: string }> }) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => {
    const input = await parseBody(req, CapiDatasetCreateSchema);
    if (input instanceof NextResponse) return input;
    return json({ dataset: await addCapiDataset(shopId, (await params).channelId, input as Parameters<typeof addCapiDataset>[2]) }, 201);
  });
};
