// feature 00084 — error taxonomy ของ Flash (TFR-FLASH-003, SRS Appendix A)

export type FlashErrorCode =
  | "MERCHANT_NOT_FOUND" | "SIGN_INVALID" | "DUPLICATE_ORDER" | "SENDER_ADDRESS_INVALID"
  | "RECEIVER_ADDRESS_INVALID" | "PARCEL_NOT_FOUND" | "INVALID_REQUEST" | "COD_NOT_ENABLED"
  | "PICKUP_PENDING" | "PICKUP_NOT_CANCELLABLE" | "NOT_CANCELLABLE" | "NOT_MERCHANT_PARCEL"
  | "POSTCODE_INVALID" | "SENDER_OUT_OF_AREA" | "UPSTREAM_ERROR" | "UPSTREAM_TIMEOUT" | "UNKNOWN_CODE";

/** none = ไม่มีปุ่มแนะนำ (แถว "—" ในตาราง) */
export type FlashRetryUX = "retry" | "fix-data" | "connection" | "review" | "none";

type Row = { code: FlashErrorCode; ux: FlashRetryUX; msg: string };

// ตารางตามรหัสดิบของ Flash — INVALID_REQUEST มีหลายข้อความจึงต้องคีย์ด้วยรหัสดิบ
const BY_FLASH_CODE: Record<string, Row> = {
  // UAT 2026-10-27: 1000 = ข้อมูลไม่ผ่านการตรวจ ("ตรวจสอบข้อมูลผิดพลาด" + ชื่อฟิลด์ใน data) ไม่ใช่ Flash ล่ม — ลองซ้ำไม่หาย
  "1000": { code: "INVALID_REQUEST", ux: "fix-data", msg: "Flash ไม่รับข้อมูลพัสดุนี้ (ตรวจสอบข้อมูลผิดพลาด) — ตรวจที่อยู่ น้ำหนัก และยอดเก็บเงินปลายทาง แล้วลองใหม่" },
  "1001": { code: "MERCHANT_NOT_FOUND", ux: "connection", msg: "ไม่พบ mchId นี้ที่ Flash — ตรวจรหัสร้านค้า (mchId) ให้ตรงกับที่ Flash ออกให้" },
  "1002": { code: "SIGN_INVALID", ux: "connection", msg: "Secret Key ไม่ถูกต้องหรือถูกเปลี่ยนที่ Flash — กรุณาวาง key ใหม่" },
  "1003": { code: "DUPLICATE_ORDER", ux: "review", msg: "อาจมีพัสดุถูกสร้างไว้แล้วที่ Flash — ตรวจที่ Flash Printer แล้วใส่เลขพัสดุเพื่อผูก หรือยืนยันว่าไม่มีใบเดิมเพื่อเปิดใหม่" },
  "1004": { code: "SENDER_ADDRESS_INVALID", ux: "fix-data", msg: "ที่อยู่ผู้ส่งไม่ตรงกับข้อมูลของ Flash — ตรวจตำบล อำเภอ จังหวัด และรหัสไปรษณีย์ในหน้าตั้งค่า" },
  "1005": { code: "RECEIVER_ADDRESS_INVALID", ux: "fix-data", msg: "ที่อยู่ผู้รับไม่ตรงกับข้อมูลของ Flash — ตรวจตำบล อำเภอ จังหวัด และรหัสไปรษณีย์ของผู้รับ" },
  "1006": { code: "PARCEL_NOT_FOUND", ux: "none", msg: "ไม่พบพัสดุเลขนี้ที่ Flash" },
  "1007": { code: "INVALID_REQUEST", ux: "fix-data", msg: "ข้อมูลคลังผู้ส่งไม่ถูกต้อง (ไม่ควรเกิด — เราไม่ใช้ warehouseNo)" },
  "1008": { code: "COD_NOT_ENABLED", ux: "fix-data", msg: "บัญชี Flash ของร้านยังไม่ได้เปิดบริการเก็บเงินปลายทาง ติดต่อ Flash" },
  "1009": { code: "INVALID_REQUEST", ux: "fix-data", msg: "ยอดเก็บเงินปลายทางไม่ถูกต้อง" },
  "1010": { code: "PICKUP_PENDING", ux: "none", msg: "มีคำขอเรียกรถที่ยังค้างอยู่ที่ที่อยู่เดียวกัน — รอให้เสร็จหรือยกเลิกงานเดิมก่อน" },
  "1011": { code: "PICKUP_NOT_CANCELLABLE", ux: "none", msg: "ยกเลิกคำขอเรียกรถนี้ไม่ได้ (รหัสคำขอเปลี่ยนหรือคนขับรับงานแล้ว) ติดต่อ Flash" },
  "1015": { code: "NOT_CANCELLABLE", ux: "none", msg: "ขนส่งรับของไปแล้ว ยกเลิกจาก Deep ไม่ได้ ต้องติดต่อ Flash" },
  "1018": { code: "INVALID_REQUEST", ux: "fix-data", msg: "ยังไม่มีที่อยู่ผู้ส่ง — ตั้งค่าที่อยู่ผู้ส่งให้ครบ" },
  "1019": { code: "NOT_MERCHANT_PARCEL", ux: "none", msg: "เลขนี้ไม่ใช่ของบัญชี Flash ของร้านนี้" },
  "1020": { code: "INVALID_REQUEST", ux: "fix-data", msg: "มูลค่าที่เอาประกันไม่ถูกต้อง" },
  "1021": { code: "POSTCODE_INVALID", ux: "fix-data", msg: "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก" },
  "1022": { code: "SENDER_OUT_OF_AREA", ux: "fix-data", msg: "ที่อยู่ผู้ส่งอยู่นอกพื้นที่ให้บริการของ Flash" },
};
const UPSTREAM_ERR: Row = { code: "UPSTREAM_ERROR", ux: "retry", msg: "ระบบ Flash ขัดข้องชั่วคราว คำสั่งซื้อถูกบันทึกไว้แล้ว กดลองใหม่ได้" };
const FALLBACK: Record<"UPSTREAM_ERROR" | "UPSTREAM_TIMEOUT" | "UNKNOWN_CODE" | "INVALID_REQUEST", Row> = {
  UPSTREAM_ERROR: UPSTREAM_ERR,
  UPSTREAM_TIMEOUT: { code: "UPSTREAM_TIMEOUT", ux: "retry", msg: "Flash ไม่ตอบสนองภายในเวลาที่กำหนด คำสั่งซื้อถูกบันทึกไว้แล้ว กดลองใหม่ได้" },
  UNKNOWN_CODE: { code: "UNKNOWN_CODE", ux: "retry", msg: "Flash ปฏิเสธคำสั่งนี้ (รหัสที่ระบบยังไม่รู้จัก) กรุณาลองใหม่หรือติดต่อทีมงาน" },
  INVALID_REQUEST: { code: "INVALID_REQUEST", ux: "fix-data", msg: "ข้อมูลคำสั่งไม่ถูกต้อง — ตรวจข้อมูลพัสดุแล้วลองใหม่" },
};
const BY_CODE = new Map<FlashErrorCode, Row>();
for (const r of Object.values(BY_FLASH_CODE)) if (!BY_CODE.has(r.code)) BY_CODE.set(r.code, r);
for (const r of Object.values(FALLBACK)) BY_CODE.set(r.code, r); // ข้อความทั่วไปของ INVALID_REQUEST ใช้แทน 1007

/** รหัสดิบ 0 = ระบบ Flash ขัดข้อง; ไม่รู้จัก = UNKNOWN_CODE (HTTP 5xx/ไม่ใช่ JSON/timeout ให้ client ตัดสินเอง) */
export function mapFlashCode(flashCode: string | number | null | undefined): FlashErrorCode {
  const k = String(flashCode ?? "").trim();
  if (k === "0") return "UPSTREAM_ERROR";
  return BY_FLASH_CODE[k]?.code ?? "UNKNOWN_CODE";
}

/** `upstream` = รหัสดิบ (หรือ {flashCode}) เพื่อเลือกข้อความเฉพาะรหัสของ INVALID_REQUEST */
export function flashUserMessage(
  code: FlashErrorCode,
  upstream?: string | number | { flashCode?: string | number | null } | null,
): string {
  const raw = upstream && typeof upstream === "object" ? upstream.flashCode : upstream;
  const specific = raw == null ? undefined : BY_FLASH_CODE[String(raw)];
  return (specific?.code === code ? specific : BY_CODE.get(code)!).msg;
}

export function classifyFlashRetryUX(code: FlashErrorCode): FlashRetryUX {
  return BY_CODE.get(code)!.ux;
}

/** ตัดความลับออกก่อนเก็บ/log: key=…, "sign":"…", และ hex 64 ตัว (รูปของ SHA256) */
export function redactFlash(text: string): string {
  return text
    .replace(/(?<![A-Za-z])((?:key|secretKey|sign)["']?\s*[=:]\s*["']?)[^&\s"',}]*/gi, "$1[redacted]")
    .replace(/\b[A-Fa-f0-9]{64}\b/g, "[redacted]")
    // path webhook มี secret ของร้านฝังอยู่ (M2)
    .replace(/\/api\/webhooks\/flash\/[A-Za-z0-9_-]+/g, "/api/webhooks/flash/[redacted]");
}

export class FlashError extends Error {
  readonly code: FlashErrorCode;
  readonly userMessage: string;
  readonly upstreamMessage?: string;
  readonly httpStatus?: number;
  readonly flashCode?: string;

  constructor(
    code: FlashErrorCode,
    opts?: { upstreamMessage?: string; httpStatus?: number; flashCode?: string | number | null; userMessage?: string },
  ) {
    super(`FlashError(${code})`);
    this.name = "FlashError";
    this.code = code;
    this.flashCode = opts?.flashCode == null ? undefined : String(opts.flashCode);
    this.userMessage = opts?.userMessage ?? flashUserMessage(code, this.flashCode);
    this.upstreamMessage = opts?.upstreamMessage == null ? undefined : redactFlash(opts.upstreamMessage);
    this.httpStatus = opts?.httpStatus;
  }

  /** timeout, 0, 1000, 5xx, ไม่ใช่ JSON ห้ามเปลี่ยนสถานะการเชื่อมต่อ (BR-FLASH-14) */
  get invalidatesConnection(): boolean {
    return this.code === "MERCHANT_NOT_FOUND" || this.code === "SIGN_INVALID";
  }

  get retryable(): boolean {
    return this.code === "UPSTREAM_ERROR" || this.code === "UPSTREAM_TIMEOUT";
  }
}

export type FlashServiceErrorCode =
  | "NOT_CONNECTED" | "FEATURE_DISABLED" | "SHIPMENT_EXISTS" | "NEEDS_REVIEW" | "INCOMPLETE_DATA"
  | "NOT_ELIGIBLE" | "NOT_FOUND" | "INVALID_STATE" | "MERCHANT_IN_USE" | "MERCHANT_CHANGE_NOT_ALLOWED"
  | "PNO_TAKEN" | "INVALID_INPUT" | "RATE_LIMITED";

export class FlashServiceError extends Error {
  constructor(
    readonly code: FlashServiceErrorCode,
    readonly userMessage: string,
    /** ช่องที่ขาด — มีเฉพาะ INCOMPLETE_DATA */
    readonly missing?: string[],
  ) {
    super(`FlashServiceError(${code})`);
    this.name = "FlashServiceError";
  }
}
