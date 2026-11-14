import { listCapiPages } from "@/services/meta-capi-settings.service";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { json, capiRun } from "@/lib/meta-capi/route-helpers";

/** GET /api/shops/meta-capi — เพจ Messenger ของร้าน + สถานะการส่ง (feature 00089 FR-002) · X9 */
export const dynamic = "force-dynamic";

export const GET = async () => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return capiRun(async () => json({ pages: await listCapiPages(shopId) }));
};
