import { NextResponse } from "next/server";
import { testCapiDataset } from "@/services/meta-capi-settings.service";
import { CapiDatasetTestSchema } from "@/lib/validations";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { json, parseBody, capiRun } from "@/lib/meta-capi/route-helpers";

/** POST .../datasets/[datasetRowId]/test — ปุ่มทดสอบ (FR-004) · ไม่เข้าคิว · body {testEventCode?} · X9 */
export const dynamic = "force-dynamic";

export const POST = async (req: Request, { params }: { params: Promise<{ channelId: string; datasetRowId: string }> }) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => {
    const input = await parseBody(req, CapiDatasetTestSchema);
    if (input instanceof NextResponse) return input;
    const { channelId, datasetRowId } = await params;
    return json(await testCapiDataset(shopId, channelId, datasetRowId, input));
  });
};
