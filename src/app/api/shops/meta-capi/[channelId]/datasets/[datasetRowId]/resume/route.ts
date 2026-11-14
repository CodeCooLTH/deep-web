import { resumeCapiDataset } from "@/services/meta-capi-settings.service";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { json, capiRun } from "@/lib/meta-capi/route-helpers";

/** POST .../datasets/[datasetRowId]/resume — dataset แบบเพจที่หยุดเพราะ token เพจ เชื่อมเพจใหม่แล้วให้ส่งต่อ · X9 */
export const dynamic = "force-dynamic";

export const POST = async (_req: Request, { params }: { params: Promise<{ channelId: string; datasetRowId: string }> }) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => {
    const { channelId, datasetRowId } = await params;
    return json({ dataset: await resumeCapiDataset(shopId, channelId, datasetRowId) });
  });
};
