import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GRAPH_VERSION } from "@/lib/facebook/constants";
import { sessionUserId } from "@/lib/session-user";
import { requireShopCapability } from "@/lib/shop-capability";
import { isMetaAudienceEnabled } from "@/lib/meta-audience/gate";
import { AUDIENCE_STATE_COOKIE, audienceScopeFor } from "@/lib/meta-audience/oauth";

// เริ่ม OAuth เชื่อมบัญชีโฆษณา (feature 00092) · X9 เจ้าของเท่านั้น · แยกจากเชื่อมเพจ (scope คนละชุด)
export const dynamic = "force-dynamic";

export const callbackUrl = (request: NextRequest) => `${request.nextUrl.origin}/api/meta-audience/callback`;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const gate = await requireShopCapability(session, "X9");
  if (!gate.ok) return gate.response;
  if (!isMetaAudienceEnabled(gate.shopId)) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });

  const appId = process.env.FB_CHAT_APP_ID;
  if (!appId) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า FB_CHAT_APP_ID" }, { status: 500 });
  // ads_management ยังเป็น Standard — คนนอก role ส่งไปก็เจอ "ฟีเจอร์ไม่พร้อมใช้งาน" จึงกันที่ต้นทาง (ใช้ทางกรอก token เอง)
  const scope = audienceScopeFor(sessionUserId(session));
  if (!scope) return NextResponse.json({ error: "ยังเชื่อมผ่าน Facebook ไม่ได้สำหรับบัญชีนี้ — ใช้ทางกรอก token เอง", code: "NOT_ROLE_USER" }, { status: 403 });

  const state = randomBytes(16).toString("hex");
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", callbackUrl(request));
  url.searchParams.set("scope", scope);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString(), 302);
  res.cookies.set(AUDIENCE_STATE_COOKIE, state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/meta-audience", maxAge: 600,
  });
  return res;
}
