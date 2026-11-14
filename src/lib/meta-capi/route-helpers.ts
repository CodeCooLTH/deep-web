// feature 00089 — ตัวห่อ API ตั้งค่า CAPI: ด่าน X9 + no-store + แปลง CapiError เป็น HTTP (ใช้ร่วมทุก route ใต้ /api/shops/meta-capi)
import { NextResponse } from "next/server";
import * as v from "valibot";
import { CapiError, type CapiErrorCode } from "@/services/meta-capi-settings.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

const STATUS: Record<CapiErrorCode, number> = {
  FEATURE_DISABLED: 404, // ฟีเจอร์ปิด = ทำเหมือนไม่มีหน้านี้
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  TOKEN_REQUIRED: 400,
  NO_CONVERSATION: 400,
  PAGE_EVENTS_PERMISSION: 400,
  META_ERROR: 400,
  DATASET_LIMIT: 409,
  DATASET_DUPLICATE: 409,
};
const MESSAGE: Partial<Record<CapiErrorCode, string>> = { FEATURE_DISABLED: "ไม่พบหน้านี้" };

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** แปลง CapiError เป็น HTTP — ด่าน X9 อยู่ในแต่ละ route เอง (เทส route-capability-inventory ตรวจที่ตัว handler) */
export async function capiRun(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (e) {
    if (e instanceof CapiError) return json({ error: MESSAGE[e.code] ?? e.message, code: e.code }, STATUS[e.code]);
    console.error("[meta-capi api]", e instanceof Error ? e.message : String(e)); // ไม่ log body/token
    return json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, 500);
  }
}

export async function parseBody<S extends v.GenericSchema>(request: Request, schema: S): Promise<v.InferOutput<S> | NextResponse> {
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(schema, body);
  if (!parsed.success) return json({ error: parsed.issues[0]?.message ?? "Invalid input", code: "INVALID_INPUT" }, 400);
  return parsed.output;
}
