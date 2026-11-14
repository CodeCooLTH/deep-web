import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireShopCapability } from "@/lib/shop-capability";
import { isMetaAudienceEnabled } from "@/lib/meta-audience/gate";
import {
  AUDIENCE_PENDING_COOKIE, AUDIENCE_PENDING_PATH, AUDIENCE_STATE_COOKIE, exchangeAudienceCode, listAdAccounts, sealPending,
} from "@/lib/meta-audience/oauth";
import { callbackUrl } from "../connect/route";

// รับ code จาก Facebook (feature 00092) — แลก long-lived token แล้ว "พก" ไปหน้าเลือกบัญชีโฆษณา ยังไม่เขียน DB
// (การเชื่อมจริงเกิดที่ POST /api/shops/meta-audience/connect หลังเจ้าของเลือกเอง)
export const dynamic = "force-dynamic";

const back = (request: NextRequest, status: string) => {
  const url = new URL("/settings/conversions-api", request.nextUrl.origin);
  url.searchParams.set("audience", status);
  return NextResponse.redirect(url.toString(), 302);
};

export async function GET(request: NextRequest) {
  const gate = await requireShopCapability(await getServerSession(authOptions), "X9");
  if (!gate.ok) return gate.response;
  if (!isMetaAudienceEnabled(gate.shopId)) return NextResponse.json({ error: "ไม่พบหน้านี้" }, { status: 404 });

  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return back(request, "cancelled");
  const state = sp.get("state");
  const expected = request.cookies.get(AUDIENCE_STATE_COOKIE)?.value;
  if (!state || !expected || state !== expected) return back(request, "state_mismatch");
  const code = sp.get("code");
  if (!code) return back(request, "no_code");

  try {
    const { token, expiresAt } = await exchangeAudienceCode(code, callbackUrl(request));
    // คัดกรองล่วงหน้า: ไม่มีบัญชีโฆษณาเลย = บอกที่หน้าตั้งค่า ไม่พาไปเลือกรายการว่าง
    if ((await listAdAccounts(token)).length === 0) return back(request, "no_ad_account");
    const res = back(request, "choose_account");
    res.cookies.set(AUDIENCE_PENDING_COOKIE, sealPending(token, expiresAt), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: AUDIENCE_PENDING_PATH, maxAge: 600,
    });
    res.cookies.delete(AUDIENCE_STATE_COOKIE);
    return res;
  } catch (e) {
    console.error("[meta-audience-connect] ล้มเหลว", e instanceof Error ? e.message : e); // ห้าม log token
    return back(request, "error");
  }
}
