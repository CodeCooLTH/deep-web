// feature 00089 — ตัดสินผลการส่ง CAPI (BR-CAPI-05/06) · รหัสยกมาจากบทเรียน gochat-v3 บน prod

export type SendOutcome = "OK" | "RETRY" | "STOP" | "FAIL";

const RETRY_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80004]);

/** httpStatus 0 = ต่อไม่ติด (fetch throw) */
export function classifySendResult(httpStatus: number, body: unknown): SendOutcome {
  const b = (body ?? {}) as { events_received?: number; error?: { code?: number; message?: string } };
  if (httpStatus >= 200 && httpStatus < 300) return (b.events_received ?? 0) >= 1 ? "OK" : "FAIL";

  const code = b.error?.code;
  if (code === 190 || code === 102 || code === 10 || (code !== undefined && code >= 200 && code <= 299)) return "STOP";
  // (#100) "Missing Permission" เป็นเรื่องสิทธิ์ ไม่ใช่ param ผิด (เจอจริงบน prod gochat)
  if (code === 100 && /missing permission/i.test(b.error?.message ?? "")) return "STOP";
  if (code !== undefined && RETRY_CODES.has(code)) return "RETRY";
  if (httpStatus === 0 || httpStatus === 429 || httpStatus >= 500) return "RETRY";
  return "FAIL";
}
