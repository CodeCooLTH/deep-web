// feature 00022 — HTTP client ของ iShip Open API
//
// ชั้นนี้รู้เรื่องเดียว: คุยกับ iShip แล้วคืนข้อมูลที่ typed แล้ว หรือโยน IShipError
// ไม่รู้จัก Prisma ไม่รู้จัก session ไม่รู้จักกฎธุรกิจ — service layer เป็นคนประกอบ
//
// สเปกอ้างอิง: Postman collection จริงของ iShip (docs/20 - Features/00022 .../API.md §B)
// หน้าเอกสารเว็บ api-docs.iship.cloud เป็น Postman documenter ที่ render ด้วย JS
// อ่านตรงไม่ได้ — ห้ามเดา endpoint ที่ไม่มีในเอกสารนั้น
//
// ข้อควรระวัง: ทุกฟังก์ชันในไฟล์นี้เป็น server-only (ถือ token ของร้าน)
// ห้าม import จาก client component เด็ดขาด

import { IShipError, classifyUpstream, redactToken } from "./errors";

const DEFAULT_BASE_URL = "https://app.iship.cloud";

/** timeout ต่อประเภทงาน — งานที่ก่อค่าใช้จ่ายให้เวลานานกว่างานอ่านเฉย ๆ */
const TIMEOUT_MS = {
  read: 10_000, // courier_code, boxes, traces, get_order
  price: 12_000, // check-price
  write: 20_000, // create_order, cancel_order, request_courier
  label: 30_000, // download/pdf — ไฟล์ PDF ใหญ่กว่าและ generate ช้ากว่า
} as const;

export function ishipBaseUrl(): string {
  return process.env.ISHIP_BASE_URL?.replace(/\/+$/, "") || DEFAULT_BASE_URL;
}

/**
 * isDryRun — โหมดจำลอง (BR-ISHIP-60)
 *
 * เปิดได้เฉพาะเมื่อ ISHIP_DRY_RUN=1 **และไม่ใช่ production**
 * เงื่อนไข NODE_ENV เป็นตัวกันชั้นที่สอง: ต่อให้ใครเผลอตั้ง env ผิดบน prod
 * ก็ยังไม่มีทางเข้าโหมดจำลองได้ — เพราะโหมดนี้คืน tracking ปลอม ถ้าหลุดขึ้น prod
 * ร้านจะได้เลขพัสดุที่ไม่มีอยู่จริงไปแปะกล่อง
 */
export function isDryRun(): boolean {
  return process.env.ISHIP_DRY_RUN === "1" && process.env.NODE_ENV !== "production";
}

// ─── ชนิดข้อมูลที่ iShip คืนกลับมา ───────────────────────────────────────────

export interface IShipCourier {
  code: string;
  name: string;
}

export interface IShipBox {
  id: number;
  name: string;
  width: number;
  length: number;
  height: number;
  unit: string;
  /**
   * null = กล่องมาตรฐานของ iShip · มีค่า = กล่องที่บัญชีร้านนั้นสร้างเองบนหลังบ้าน iShip
   *
   * ต้องส่งต่อถึงหน้าจอ ไม่ตัดทิ้ง — กล่องมาตรฐานมี ~24 ใบ ถ้าไม่แยกกลุ่ม กล่องของร้าน
   * จะไปกองท้ายสุดจนร้านนึกว่าไม่มี (user report 2026-07-29)
   */
  user_id?: number | null;
}

export interface IShipPrice {
  courier_code: string;
  weight: number;
  weight_unit: string;
  remote_area: string | number;
  price: number;
  total_price: number;
  /** จำนวนวันโดยประมาณ — iShip ส่งมาเป็นสตริง (ยืนยันกับบัญชีจริง 2026-07-31: "3") */
  estimate_shipping_date?: string | number;
  fuel_surcharge_fee?: number;
}

export interface IShipCreateOrderResult {
  ref: string;
  tracking_number: string;
  sortCode?: string;
  sortingLineCode?: string;
  dstStoreName?: string;
  id?: number;
}

export interface IShipTraceRoute {
  status: string;
  status_text: string;
  status_desc: string;
  current_location: string;
  timestamp: string;
}

export interface IShipPickupResult {
  ticketPickupId?: number | string;
  staffInfoName?: string | null;
  staffInfoPhone?: string | null;
  timeoutAtText?: string | null;
  ticketMessage?: string | null;
}

/** payload ที่ส่งไป create_order — ชื่อ field ตรงตามที่ iShip กำหนดเป๊ะ */
export interface IShipCreateOrderPayload {
  platform_name: string;
  courier_code: string;
  custom_order_id: string;
  src_name: string;
  src_phone: string;
  src_address: string;
  src_district: string; // ตำบล/แขวง ของผู้ส่ง
  src_amphure: string; // อำเภอ/เขต ของผู้ส่ง
  src_province: string;
  src_zipcode: string;
  dst_name: string;
  dst_phone: string;
  dst_address: string;
  dst_district: string; // ตำบล/แขวง ของผู้รับ
  dst_amphure: string; // อำเภอ/เขต ของผู้รับ
  dst_province: string;
  dst_zipcode: string;
  weight: number;
  width: number;
  length: number;
  height: number;
  cod_amount: number;
  category_id: number;
  remark?: string;
  on_time?: number;
  box_shield?: number;
  service_type?: number;
  is_insured?: number;
  product_value?: number;
  products?: {
    product_name: string;
    product_length: string;
    product_width: string;
    product_height: string;
    product_weight: number;
    product_qty: number;
    product_color?: string;
    product_price: number;
  }[];
}

// ─── แกนกลางการเรียก ────────────────────────────────────────────────────────

/**
 * unwrap — แกะ envelope ของ iShip ให้เหลือ data
 *
 * iShip ตอบมาไม่เป็นรูปเดียวกันทุก endpoint:
 *   { status: true,  code: "0000", message: "success", data: ... }
 *   { status: true,  code: "0000", msg: "success",     data: ... }   ← msg ไม่ใช่ message
 *   { status: 1,     code: "0000", message: ..., data: null }        ← status เป็นตัวเลข
 *   [ ... ]                                                          ← boxes คืน array เปล่า ๆ
 *
 * helper นี้จึงต้องทนทุกรูป และ "ห้ามพึ่งโครงประโยคของข้อความ" ในการตัดสินสำเร็จ/ล้มเหลว
 * (บทเรียน feedback_spike_must_match_production_path)
 */
function unwrap<T>(body: unknown, httpStatus: number, token: string): T {
  // รูป array เปล่า ๆ (เช่น /api/boxes) — ถือว่าสำเร็จตรง ๆ
  if (Array.isArray(body)) return body as T;

  if (body === null || typeof body !== "object") {
    throw new IShipError("UPSTREAM_ERROR", { httpStatus });
  }

  const env = body as Record<string, unknown>;
  const rawMessage =
    typeof env.message === "string"
      ? env.message
      : typeof env.msg === "string"
        ? env.msg
        : undefined;

  // payload เปล่าไม่มี envelope — /api/v2/check-price คืน object ตรง ๆ
  // ({courier_code, price, total_price, …} ยืนยันจาก prod 2026-08-05) ตีความ
  // "ไม่มี status" เป็นล้มเหลวไม่ได้: ทำให้ราคาทุกคำขอกลายเป็น UPSTREAM_ERROR
  // http=200 message ว่าง ทั้งที่คำตอบสำเร็จ. เงื่อนไข: ไม่มี key ของ envelope
  // เลยสักตัว (status/success/data) และไม่มีข้อความ error (message/msg) ปนมา
  if (
    !("status" in env) &&
    !("success" in env) &&
    !("data" in env) &&
    rawMessage === undefined
  ) {
    return body as T;
  }

  // status: true | 1 = สำเร็จ, false | 0 | undefined = ล้มเหลว
  // v2 บาง endpoint (เช่น /api/v2/boxes) ใช้ชื่อ success แทน status — ต้องรับทั้งสองชื่อ
  const ok = env.status === true || env.status === 1 || env.success === true;
  if (!ok) {
    throw new IShipError(classifyUpstream(httpStatus, rawMessage), {
      upstreamMessage: rawMessage ? redactToken(rawMessage, token) : undefined,
      httpStatus,
    });
  }

  return env.data as T;
}

interface CallOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  /** query string ที่ต่อท้าย path (ต่อมาแล้ว encode มาเรียบร้อย) */
  query?: string;
}

/**
 * call — เรียก iShip 1 ครั้ง แล้วคืน data ที่แกะ envelope แล้ว
 *
 * ทุก error ที่ออกจากฟังก์ชันนี้เป็น IShipError เสมอ — caller ไม่ต้องเดารูป
 */
async function call<T>(
  token: string,
  path: string,
  opts: CallOptions = {},
): Promise<T> {
  const { method = "GET", body, timeoutMs = TIMEOUT_MS.read, query } = opts;
  const url = `${ishipBaseUrl()}${path}${query ? `?${query}` : ""}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // ห้าม cache คำตอบของ API ที่ผูกกับ token ของร้าน
      cache: "no-store",
    });
  } catch (err) {
    // AbortError = เราเป็นฝ่ายตัดเอง → แยกจาก network error จริง เพราะการกระทำต่อไปต่างกัน:
    // timeout อาจแปลว่า "iShip สร้างพัสดุสำเร็จแล้วแต่คำตอบมาไม่ทัน" → retry ต้องใช้ idempotencyKey เดิม
    if (err instanceof Error && err.name === "AbortError") {
      throw new IShipError("UPSTREAM_TIMEOUT");
    }
    throw new IShipError("UPSTREAM_ERROR", {
      upstreamMessage: redactToken(
        err instanceof Error ? err.message : String(err),
        token,
      ),
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // ตอบมาไม่ใช่ JSON (หน้า error ของ gateway / HTML) — จัดเป็น upstream error
    throw new IShipError(classifyUpstream(res.status, text.slice(0, 200)), {
      upstreamMessage: redactToken(text.slice(0, 500), token),
      httpStatus: res.status,
    });
  }

  return unwrap<T>(parsed, res.status, token);
}

// ─── การเรียกที่ "อ่านอย่างเดียว" — ไม่ก่อค่าใช้จ่าย ยิงจริงเสมอแม้ในโหมดจำลอง ──

/** รายชื่อขนส่งที่บัญชีนี้ใช้ได้ — ใช้เป็นตัวทดสอบ token ด้วย (FR-ISHIP-001) */
export function listCouriers(token: string): Promise<IShipCourier[]> {
  return call<IShipCourier[]>(token, "/api/courier_code");
}

/**
 * กล่องที่บัญชีร้านใช้ได้ — ทั้งชุดมาตรฐานและกล่องที่ร้านสร้างเองบนหลังบ้าน iShip
 *
 * ต้องใช้ v2 เท่านั้น: /api/boxes (v1) คืนเฉพาะกล่องมาตรฐาน 26 ใบและ **ตัดกล่องของร้าน
 * ทิ้งเงียบ ๆ** — ไม่ error ไม่มีสัญญาณอะไรบอกว่าหายไป ร้านที่สร้างกล่องเองไว้จึงเห็นแต่
 * ชุดมาตรฐานแล้วนึกว่าระบบดึงไม่ได้ (ยืนยันกับบัญชีจริง 2026-07-29: v1=26 ใบ user_id null
 * ล้วน / v2=30 ใบ มี 4 ใบ user_id=47784 ซึ่งเป็นกล่องของร้านจริง)
 *
 * v2 ห่อคำตอบด้วย { success, message, data } — ไม่ใช่ { status } เหมือน endpoint อื่น
 * (unwrap รองรับทั้งสองรูปแล้ว)
 */
export function listBoxes(token: string): Promise<IShipBox[]> {
  return call<IShipBox[]>(token, "/api/v2/boxes");
}

/** ราคาโดยประมาณ — ค่าที่ได้เป็นการประเมินจากขนาด/น้ำหนักที่ร้านแจ้ง (BR-ISHIP-34) */
export function checkPrice(
  token: string,
  payload: {
    courier_code: string;
    src_zipcode: string;
    src_province: string;
    src_amphure: string;
    src_district: string;
    dst_zipcode: string;
    dst_province: string;
    dst_amphure: string;
    dst_district: string;
    weight: string | number;
    width: string | number;
    length: string | number;
    height: string | number;
  },
): Promise<IShipPrice> {
  return call<IShipPrice>(token, "/api/v2/check-price", {
    method: "POST",
    body: payload,
    timeoutMs: TIMEOUT_MS.price,
  });
}

export interface IShipOrderRow {
  track_no: string;
  status: number;
  status_name?: string;
  status_desc?: string;
  updated_at?: string;
  /**
   * วันเวลาที่เงินเก็บปลายทางเข้าระบบร้าน = คำว่า "เงินเข้าระบบ" บนหน้าจอ iShip
   * (ยืนยันกับพัสดุจริง TH160390J7DJ1I 2026-08-06) — มาคู่กับ status 12 payment_success
   *
   * [ระวัง] รูปแบบ "YYYY-MM-DD HH:mm:ss" เวลาไทยไม่มี timezone suffix ซึ่ง **ต่างจาก**
   * `updated_at`/`created_at` ในออบเจ็กต์เดียวกันที่เป็น ISO UTC — ต้องแปลงด้วย
   * parseCarrierTimestamp เท่านั้น ส่งเข้า new Date() ตรง ๆ จะเพี้ยนไป 7 ชั่วโมง
   *
   * ไม่มีใน /api/traces (trace หยุดที่ delivered) — ห้ามไปหาจากที่นั่น
   */
  settlement_at?: string | null;
  /** ยอดเก็บปลายทางเป็น string ("590.00") — "0.00" เมื่อไม่ใช่ COD */
  cod_amount?: string | number | null;
  /** ค่าธรรมเนียมที่ขนส่งหักจากยอด COD ("12.63") */
  cod_fee?: string | number | null;
  /** เวลาที่ส่งถึงผู้รับ — มาก่อน settlement_at เสมอ (ตัวอย่างจริงห่างกัน ~33 ชม.) */
  delivered_at?: string | null;
}

/**
 * รายการพัสดุของร้านในช่วงวันที่ — ใช้ sync สถานะทั้งร้านด้วยการยิงครั้งเดียว
 *
 * ทำไมไม่วน traces ทีละใบ: traces เป็นรายพัสดุ ร้านที่มีของเดินอยู่ 100 ใบ = 100 คำขอต่อรอบ
 * ตัวนี้คืนทั้งชุดในคำขอเดียว (ยืนยันกับบัญชีจริง 2026-07-31: 108 แถว/คำขอ)
 *
 * ข้อจำกัดของ iShip: ช่วงวันที่ต้องไม่เกิน 7 วัน (เกินแล้วตอบ code 1009 ไม่ใช่ error กลาง ๆ)
 * ผู้เรียกต้องซอยช่วงเอง — ที่นี่ไม่ซอยให้ เพราะการซอยคือการตัดสินใจเรื่องจำนวนคำขอ
 */
export function queryOrders(
  token: string,
  startDate: string,
  endDate: string,
): Promise<IShipOrderRow[]> {
  return call<IShipOrderRow[]>(token, "/api/query_orders", {
    query: `start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
  });
}

/** ประวัติการเดินทางของพัสดุ */
export async function getTraces(
  token: string,
  trackNo: string,
): Promise<IShipTraceRoute[]> {
  try {
    const data = await call<{ trace_routes?: IShipTraceRoute[] }>(
      token,
      "/api/traces",
      { method: "POST", body: { track_no: trackNo } },
    );
    return data?.trace_routes ?? [];
  } catch (err) {
    // พัสดุที่เพิ่งเปิดและขนส่งยังไม่สแกน → iShip ตอบ HTTP 500 body
    // {"status":false,"message":"","data":[]} แทนที่จะคืนลิสต์ว่าง (ยืนยันกับ prod 2026-07-29
    // ด้วย track จริง TH0205901RX26E0) — ไม่ใช่ระบบล่ม แต่เป็น "ยังไม่มีข้อมูล"
    //
    // แยกสองอย่างนี้ด้วย "ไม่มีข้อความอธิบายเลย" เท่านั้น — ถ้า iShip ส่งเหตุผลอะไรมา
    // (token เสีย/เลขไม่มีจริง) ต้องยังเป็น error ตามเดิม ห้ามกลืนเงียบ
    if (
      err instanceof IShipError &&
      err.httpStatus === 500 &&
      !err.upstreamMessage
    ) {
      return [];
    }
    throw err;
  }
}

/** รายละเอียดพัสดุฝั่ง iShip — ใช้ยืนยันสถานะกลับ ไม่เชื่อ webhook อย่างเดียว */
export function getOrder(
  token: string,
  trackNo: string,
): Promise<Record<string, unknown>> {
  return call<Record<string, unknown>>(
    token,
    `/api/get_order/${encodeURIComponent(trackNo)}`,
  );
}

/**
 * downloadLabel — ใบปะหน้า A6 (PDF)
 *
 * ข้อควรระวัง: FR-ISHIP-030 — ต้องเรียกจากฝั่งเซิร์ฟเวอร์เท่านั้น แล้วส่งไฟล์ต่อให้เบราว์เซอร์
 * ห้ามให้เบราว์เซอร์ยิง URL นี้เอง เพราะจะต้องถือ token ของร้านไปด้วย
 *
 * endpoint นี้คืน PDF ดิบ ไม่ใช่ JSON envelope จึงไม่ผ่าน call()/unwrap()
 * รองรับหลาย tracking ในครั้งเดียว (คั่นด้วย comma) = การพิมพ์หลายใบ (FR-ISHIP-031)
 */
export async function downloadLabel(
  token: string,
  trackNos: string[],
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS.label);

  try {
    const res = await fetch(
      `${ishipBaseUrl()}/api/download/pdf?tracks=${encodeURIComponent(trackNos.join(","))}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new IShipError(classifyUpstream(res.status, detail.slice(0, 200)), {
        upstreamMessage: redactToken(detail.slice(0, 500), token),
        httpStatus: res.status,
      });
    }

    const buf = await res.arrayBuffer();
    // กันกรณี iShip ตอบ 200 แต่เนื้อหาเป็นหน้า error ไม่ใช่ PDF —
    // PDF ทุกไฟล์ขึ้นต้นด้วย "%PDF" เสมอ ตรวจ magic bytes ถูกกว่าเชื่อ content-type
    const head = new TextDecoder().decode(buf.slice(0, 4));
    if (head !== "%PDF") {
      throw new IShipError("UPSTREAM_ERROR", {
        upstreamMessage: "ไฟล์ที่ได้กลับมาไม่ใช่ PDF",
        httpStatus: res.status,
      });
    }
    return buf;
  } catch (err) {
    if (err instanceof IShipError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new IShipError("UPSTREAM_TIMEOUT");
    }
    throw new IShipError("UPSTREAM_ERROR", {
      upstreamMessage: redactToken(
        err instanceof Error ? err.message : String(err),
        token,
      ),
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── การเรียกที่ "ก่อค่าใช้จ่ายจริง" — โหมดจำลองจะไม่ยิงออกไป ────────────────

/**
 * createOrder — เปิดพัสดุจริงกับขนส่ง
 *
 * ข้อควรระวัง: ทุกครั้งที่สำเร็จ = พัสดุจริง + ค่าใช้จ่ายจริงของร้าน
 * ในโหมดจำลองจะไม่ยิงออกไปเลย แต่คืนผลลัพธ์รูปเดียวกันเพื่อให้ทดสอบเส้นทางได้ครบ
 * (BR-ISHIP-60/61 — ผู้ให้บริการไม่มีระบบทดสอบแยกให้ใช้)
 */
export async function createOrder(
  token: string,
  payload: IShipCreateOrderPayload,
): Promise<{ result: IShipCreateOrderResult; dryRun: boolean }> {
  if (isDryRun()) {
    // เลขจำลองมี prefix ที่มองแล้วรู้ทันทีว่าไม่ใช่ของจริง — กันสับสนตอนดูฐานข้อมูล
    const stamp = Date.now().toString(36).toUpperCase();
    return {
      result: {
        ref: `DRYRUN-${payload.custom_order_id}`,
        tracking_number: `DRYRUN${stamp}`,
        dstStoreName: "DRY RUN (ไม่ได้ส่งออกไปจริง)",
      },
      dryRun: true,
    };
  }

  const result = await call<IShipCreateOrderResult>(token, "/api/create_order", {
    method: "POST",
    body: payload,
    timeoutMs: TIMEOUT_MS.write,
  });
  return { result, dryRun: false };
}

/**
 * ยกเลิกพัสดุ — ทำได้เฉพาะตอนที่ขนส่งยังไม่รับของเข้าระบบ
 *
 * ระบุพัสดุด้วย courier_code + ref_code ไม่ใช่เลขติดตาม — ตามตัวอย่างจริงใน Postman
 * collection ของ iShip (item "Cancel Order" → saved response originalRequest):
 *   { "courier_code":"FlashExpress", "ref_code":"REFUAT...", "reason":"Customer canceled" }
 *
 * เดิมเราส่ง { track_no } ซึ่งไม่มีอยู่ในสัญญาของ endpoint นี้เลย ปุ่มยกเลิกจึงยิงแล้วไม่ผ่าน
 * (ช่อง body ที่แสดงในหน้าเอกสารว่างเปล่า ตัวอย่างจริงซ่อนอยู่ใน response ที่บันทึกไว้)
 */
export async function cancelOrder(
  token: string,
  params: { courierCode: string; refCode: string; reason?: string },
): Promise<void> {
  if (isDryRun()) return;
  await call<unknown>(token, "/api/cancel_order", {
    method: "POST",
    body: {
      courier_code: params.courierCode,
      ref_code: params.refCode,
      reason: params.reason ?? "ร้านค้ายกเลิกคำสั่งซื้อ",
    },
    timeoutMs: TIMEOUT_MS.write,
  });
}

/** เรียกรถเข้ารับพัสดุ — ระดับร้าน ไม่ใช่ระดับออเดอร์ (FR-ISHIP-051) */
export async function requestPickup(
  token: string,
  payload: {
    courier_code: string;
    pickup_address: string;
    name: string;
    phone: string;
    parcel: number;
    remark?: string;
  },
): Promise<{ result: IShipPickupResult; dryRun: boolean }> {
  if (isDryRun()) {
    return {
      result: {
        ticketPickupId: `DRYRUN-${Date.now().toString(36).toUpperCase()}`,
        ticketMessage: "DRY RUN (ไม่ได้เรียกรถจริง)",
      },
      dryRun: true,
    };
  }

  const result = await call<IShipPickupResult>(token, "/api/request_courier", {
    method: "POST",
    body: payload,
    timeoutMs: TIMEOUT_MS.write,
  });
  return { result, dryRun: false };
}

/** ยกเลิกคำขอเรียกรถเข้ารับ */
export async function cancelPickup(
  token: string,
  ticketPickupId: string,
): Promise<void> {
  if (isDryRun()) return;
  await call<unknown>(
    token,
    `/api/cancel-notify/${encodeURIComponent(ticketPickupId)}`,
    { timeoutMs: TIMEOUT_MS.write },
  );
}
