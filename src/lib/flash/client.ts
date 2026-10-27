// feature 00084 — HTTP client ของ Flash Express Open API (TFR-FLASH-001/009/013/022)
//
// รู้เรื่องเดียว: เซ็น → ยิง → แกะ envelope {code,message,data} → คืน data หรือโยน FlashError
// ไม่รู้จัก Prisma/session ข้อควรระวัง: server-only (ถือ secretKey) ห้าม import จาก client component
// ห้าม log key/sign/body — ข้อความที่ออกจากไฟล์นี้ผ่าน redactFlash ทุกทาง

import { randomBytes } from "crypto";
import { FlashError, mapFlashCode, redactFlash } from "./errors";
import { flashBaseUrl, isFlashDryRun } from "./gate";
import { buildFormBody, newNonce, type FlashParams } from "./sign";

export type FlashCred = { mchId: string; secretKey: string };

/** timeout ต่อประเภทงาน (TFR-FLASH-001); verify-ใน-webhook ส่ง timeoutMs=5000 เอง */
const TIMEOUT_MS = { read: 10_000, estimate: 12_000, write: 20_000, label: 30_000 } as const;
type Kind = keyof typeof TIMEOUT_MS;
export type FlashCallOpts = { timeoutMs?: number };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

/** แกะ envelope: code=1 → data · อื่น ๆ → FlashError ตามตาราง (ข้อความดิบผ่าน redact + ตัดความยาว) */
function unwrap(text: string, httpStatus: number): unknown {
  let json: { code?: unknown; message?: unknown; data?: unknown } | null = null;
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object") json = j;
  } catch {
    /* ไม่ใช่ JSON — ตัดสินข้างล่าง */
  }
  // ไม่ใช่ JSON หรือ 5xx = ระบบ Flash ขัดข้อง ห้ามแตะสถานะการเชื่อมต่อ (BR-FLASH-14)
  if (!json || httpStatus >= 500) {
    throw new FlashError("UPSTREAM_ERROR", { httpStatus, upstreamMessage: json ? String(json.message ?? "") : "non-JSON response" });
  }
  if (Number(json.code) === 1) return json.data;
  throw new FlashError(mapFlashCode(json.code as string | number | null), {
    httpStatus,
    flashCode: json.code as string | number | null,
    // data ของ 1000 บอกชื่อฟิลด์ที่ไม่ผ่าน (เช่น "subItemTypes.itemWeightSizeต้องระบุ") — เก็บไว้ใน log
    upstreamMessage: [json.message, typeof json.data === "string" ? json.data : null].filter(Boolean).join(" · ").slice(0, 300),
  });
}

async function send(
  cred: FlashCred,
  path: string,
  params: FlashParams,
  kind: Kind,
  accept: string,
  opts?: FlashCallOpts,
): Promise<{ status: number; bytes: Uint8Array }> {
  const body = buildFormBody({ ...params, mchId: cred.mchId, nonceStr: newNonce() }, cred.secretKey);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts?.timeoutMs ?? TIMEOUT_MS[kind]);
  try {
    const res = await fetch(`${flashBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        accept,
        "accept-language": "th",
      },
      body,
      signal: ctl.signal,
      cache: "no-store",
    });
    return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()) };
  } catch (e) {
    if (ctl.signal.aborted || (e as Error)?.name === "AbortError" || (e as Error)?.name === "TimeoutError") {
      throw new FlashError("UPSTREAM_TIMEOUT");
    }
    // ไม่แนบ error ดิบ (undici อาจพ่น URL/ที่อยู่ภายใน) — เก็บแค่ชื่อชนิด
    throw new FlashError("UPSTREAM_ERROR", { upstreamMessage: `network: ${(e as Error)?.name ?? "error"}` });
  } finally {
    clearTimeout(timer);
  }
}

/** path variable ({pno},{id}) ต่อใน path ไม่เข้า params จึงไม่เข้าลายเซ็น */
export async function flashCall(
  cred: FlashCred,
  path: string,
  params: FlashParams,
  kind: Kind = "read",
  opts?: FlashCallOpts,
): Promise<unknown> {
  const { status, bytes } = await send(cred, path, params, kind, "application/json", opts);
  return unwrap(new TextDecoder().decode(bytes), status);
}

const fakeId = (prefix: string) => `${prefix}${randomBytes(5).toString("hex").toUpperCase()}`;
const seg = encodeURIComponent;

export type FlashCreateResult = {
  pno: string;
  sortCode?: string;
  sortingLineCode?: string;
  dstStoreName?: string;
  [k: string]: unknown;
};

export const warehouses = (c: FlashCred, o?: FlashCallOpts) => flashCall(c, "/open/v1/warehouses", {}, "read", o);

/** dry-run: ไม่ยิง คืน pno ปลอม FLDRY… (read-only อื่นยังยิงจริง) */
export async function createOrder(c: FlashCred, params: FlashParams): Promise<FlashCreateResult> {
  if (isFlashDryRun()) return { pno: fakeId("FLDRY") };
  return (await flashCall(c, "/open/v3/orders", params, "write")) as FlashCreateResult;
}

export const cancelOrder = (c: FlashCred, pno: string) => flashCall(c, `/open/v1/orders/${seg(pno)}/cancel`, {}, "write");
export const routes = (c: FlashCred, pno: string, o?: FlashCallOpts) =>
  flashCall(c, `/open/v1/orders/${seg(pno)}/routes`, {}, "read", o);
export const routesBatch = (c: FlashCred, pnos: string[], o?: FlashCallOpts) =>
  flashCall(c, "/open/v1/orders/routesBatch", { pnos: pnos.join(",") }, "read", o);
export const deliveredInfo = (c: FlashCred, pno: string) =>
  flashCall(c, `/open/v1/orders/${seg(pno)}/deliveredInfo`, {}, "read");
export const estimateRate = (c: FlashCred, params: FlashParams) =>
  flashCall(c, "/open/v1/orders/estimate_rate", params, "estimate");

/** dry-run: ไม่ยิง */
export async function notify(c: FlashCred, params: FlashParams): Promise<Record<string, unknown>> {
  if (isFlashDryRun()) return { ticketPickupId: fakeId("FLDRY") };
  return (await flashCall(c, "/open/v1/notify", params, "write")) as Record<string, unknown>;
}

export const cancelNotify = (c: FlashCred, id: string | number) =>
  flashCall(c, `/open/v1/notify/${seg(String(id))}/cancel`, {}, "write");
export const webhookInfos = (c: FlashCred) => flashCall(c, "/gw/fda/open/standard/webhook/setting/infos", {}, "read");
export const setWebhook = (
  c: FlashCred,
  p: { serviceCategory: 0 | 1; webhookApiCode: 0 | 1 | 2 | 3 | 4; url?: string },
) => flashCall(c, "/open/v1/setting/web_hook_service", p, "write");

/** ใบปะหน้า PDF — ตรวจ %PDF; ไม่ใช่ → แกะเป็น envelope error; ห้ามส่งไฟล์เสียออกไป */
export async function labelPdf(c: FlashCred, pno: string, size: "BIG" | "SMALL" = "BIG"): Promise<Buffer> {
  const path = `/open/v1/orders/${seg(pno)}/${size === "SMALL" ? "small/" : ""}pre_print`;
  const { status, bytes } = await send(c, path, {}, "label", "application/pdf");
  if (status < 400 && PDF_MAGIC.every((b, i) => bytes[i] === b)) return Buffer.from(bytes);
  unwrap(new TextDecoder().decode(bytes.subarray(0, 4096)), status); // code≠1 → throw
  // code=1 แต่ไม่ใช่ PDF = ผิดสัญญา
  throw new FlashError("UPSTREAM_ERROR", { httpStatus: status, upstreamMessage: redactFlash("label: not a PDF") });
}
