import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { AudienceUpdateSchema } from "@/lib/validations";
import { audienceRun, json, parseBody } from "@/lib/meta-audience/route-helpers";
import { disconnectAudience, getAudienceStatus, setAudienceEnabled } from "@/services/meta-audience-settings.service";

/** GET/PUT/DELETE /api/shops/meta-audience — สถานะ/เปิด-ปิด/ตัดการเชื่อม audience ลูกค้าที่ซื้อแล้ว (feature 00092) · X9 */
export const dynamic = "force-dynamic";

export const GET = async () => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return audienceRun(async () => json(await getAudienceStatus(shopId)));
};

export const PUT = async (req: Request) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return audienceRun(async () => {
    const input = await parseBody(req, AudienceUpdateSchema);
    if (input instanceof NextResponse) return input;
    await setAudienceEnabled(shopId, input.enabled);
    return json(await getAudienceStatus(shopId));
  });
};

export const DELETE = async () => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return audienceRun(async () => {
    await disconnectAudience(shopId);
    return json({ ok: true });
  });
};
