import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { AudienceConnectSchema } from "@/lib/validations";
import { AUDIENCE_PENDING_COOKIE, openPending } from "@/lib/meta-audience/oauth";
import { audienceRun, json, parseBody } from "@/lib/meta-audience/route-helpers";
import { AudienceError, connectManual, connectOAuthAccount, getAudienceStatus } from "@/services/meta-audience-settings.service";

/** POST /api/shops/meta-audience/connect — เลือกบัญชีโฆษณา (OAUTH: จาก token ที่พักใน cookie) หรือกรอก token เอง (MANUAL) · X9 */
export const dynamic = "force-dynamic";

export const POST = async (req: Request) => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return audienceRun(async () => {
    const input = await parseBody(req, AudienceConnectSchema);
    if (input instanceof NextResponse) return input;
    const jar = await cookies();
    if (input.mode === "MANUAL") {
      await connectManual(shopId, { adAccountId: input.adAccountId, token: input.token });
    } else {
      const pending = openPending(jar.get(AUDIENCE_PENDING_COOKIE)?.value);
      if (!pending) throw new AudienceError("PENDING_EXPIRED", "หมดเวลาเลือกบัญชีโฆษณา — กดเชื่อมผ่าน Facebook ใหม่");
      await connectOAuthAccount(shopId, input.adAccountId, pending);
      jar.delete(AUDIENCE_PENDING_COOKIE); // ใช้แล้วทิ้ง — token ไม่ค้างใน cookie
    }
    return json(await getAudienceStatus(shopId));
  });
};
