import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { isMetaAudienceEnabled } from "@/lib/meta-audience/gate";
import { AUDIENCE_PENDING_COOKIE, listAdAccounts, openPending } from "@/lib/meta-audience/oauth";
import { audienceRun, json } from "@/lib/meta-audience/route-helpers";
import { AudienceError } from "@/services/meta-audience-settings.service";

/** GET /api/shops/meta-audience/accounts — บัญชีโฆษณาที่ token (พักไว้หลัง OAuth) เข้าถึงได้ ให้เจ้าของเลือก (feature 00092) · X9 */
export const dynamic = "force-dynamic";

export const GET = async () => {
  const g = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!g.ok) return g.response;
  const shopId = g.shopId;
  return audienceRun(async () => {
    if (!isMetaAudienceEnabled(shopId)) throw new AudienceError("FEATURE_DISABLED", "ฟีเจอร์ยังไม่เปิดให้ร้านนี้");
    const pending = openPending((await cookies()).get(AUDIENCE_PENDING_COOKIE)?.value);
    if (!pending) throw new AudienceError("PENDING_EXPIRED", "หมดเวลาเลือกบัญชีโฆษณา — กดเชื่อมผ่าน Facebook ใหม่");
    const accounts = await listAdAccounts(pending.token).catch(() => {
      throw new AudienceError("TOKEN_INVALID", "token ใช้ไม่ได้ — เริ่มเชื่อมใหม่");
    });
    return json({ accounts });
  });
};
