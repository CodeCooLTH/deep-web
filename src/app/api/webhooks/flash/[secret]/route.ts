// feature 00084 — รับแจ้งสถานะจาก Flash (TFR-FLASH-016 · API §4.19)
//
// ด่านตามลำดับ: secret ใน path (ไม่รู้จัก → 404 เปล่า ไม่ยืนยันว่ามี endpoint) → body ≤256KB →
// mchId ตรงร้าน + sign ถูก (ไม่ผ่าน → 401) → service
// ตอบ 200 success ทุกกรณีที่ "ยิงซ้ำไปก็ไม่มีประโยชน์"; 503 retry เฉพาะความล้มเหลวชั่วคราวของเรา
// 🛑 ห้าม log secret / URL / key / sign

import { after, type NextRequest } from "next/server";
import { verifyWebhookSign } from "@/lib/flash/sign";
import { parseWebhookBody } from "@/lib/flash/webhook-parse";
import { loadFlashAccountByWebhookSecret } from "@/services/flash-account";
import { handleFlashWebhook } from "@/services/flash-status.service";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const HEADERS = { "content-type": "application/json", "cache-control": "no-store" };

const SUCCESS = '{"errorCode":"1","state":"success"}';
const RETRY = '{"errorCode":"0","state":"retry"}';
const UNAUTHORIZED = '{"errorCode":"0","state":"unauthorized"}';

const reply = (body: string, status: number) => new Response(body, { status, headers: HEADERS });

export async function POST(request: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  try {
    const { secret } = await params;
    const loaded = await loadFlashAccountByWebhookSecret(secret);
    if (!loaded) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

    // อ่านไม่ได้/ใหญ่เกิน/parse ไม่ได้ = ตอบสำเร็จโดยไม่เขียน (ไม่ให้ Flash ยิงซ้ำของที่ไม่มีวันอ่านได้)
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return reply(SUCCESS, 200);
    let text: string;
    try {
      text = await request.text();
    } catch {
      return reply(SUCCESS, 200);
    }
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) return reply(SUCCESS, 200);
    const parsed = parseWebhookBody(request.headers.get("content-type"), text);
    if (!parsed) return reply(SUCCESS, 200);

    if (
      !parsed.mchId ||
      parsed.mchId !== loaded.cred.mchId ||
      !parsed.nonceStr ||
      !parsed.sign ||
      !verifyWebhookSign({ mchId: parsed.mchId, nonceStr: parsed.nonceStr, sign: parsed.sign }, loaded.cred.secretKey)
    ) {
      return reply(UNAUTHORIZED, 401);
    }

    const result = await handleFlashWebhook(loaded, parsed, { kindHint: new URL(request.url).searchParams.get("k") });
    if (result.outcome === "RETRY") return reply(RETRY, 503);
    if (result.after) after(result.after);
    return reply(SUCCESS, 200);
  } catch (e) {
    console.error("[flash] webhook ล้มชั่วคราว", e instanceof Error ? e.name : "error");
    return reply(RETRY, 503);
  }
}
