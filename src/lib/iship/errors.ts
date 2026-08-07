// feature 00022 — Error taxonomy ของการเชื่อมต่อ iShip
//
// ทำไมต้องมีชั้นนี้: iShip ตอบ error มาหลายรูป (บาง endpoint ใช้ `status: true|1`,
// บาง endpoint ใช้ `code: "0000"`, บางกรณีเป็น HTTP error ล้วน, บางกรณีข้อความไทยดิบ)
// ถ้าปล่อยให้ route/UI ไปแกะเอง ตรรกะจะกระจายและเพี้ยนคนละที่
// → รวบเป็น error type เดียวที่มี `code` ของเรา + ข้อความไทยที่แสดงต่อร้านได้เลย
//
// ข้อควรระวัง: บทเรียน feedback_spike_must_match_production_path: helper ที่แกะ error ต้องทน
// payload หลายรูป และห้ามพึ่งโครงประโยคของข้อความ (ผู้ให้บริการแก้คำเมื่อไหร่ก็ได้)
// ที่นี่จึงตัดสินจาก HTTP status + field ที่เป็นโครงสร้างก่อนเสมอ แล้วค่อยใช้ข้อความ
// เป็นตัวช่วยลำดับสุดท้าย

/** รหัสข้อผิดพลาดของ "เรา" — ไม่ใช่ของ iShip. UI/route แมปจากตัวนี้เท่านั้น */
export type IShipErrorCode =
  | "TOKEN_INVALID" // token ผิด/หมดอายุ/ถูกเพิกถอน → ต้องให้ร้านเอาใบใหม่มาวาง
  | "INSUFFICIENT_BALANCE" // ยอดเงินในบัญชี iShip ของร้านไม่พอ
  | "ADDRESS_INVALID" // ที่อยู่ปลายทางไม่ผ่านการตรวจของขนส่ง
  | "COURIER_UNAVAILABLE" // ขนส่งเจ้านี้ไม่รับพื้นที่นี้/ปิดรับชั่วคราว
  | "SHIPMENT_NOT_CANCELLABLE" // ยกเลิกไม่ได้แล้ว เพราะขนส่งรับของไปแล้ว
  | "REJECTED_BY_CARRIER" // iShip ปฏิเสธเพราะข้อมูลไม่ครบ/ไม่ผ่านเงื่อนไข — กดซ้ำก็ไม่ผ่าน
  | "UPSTREAM_TIMEOUT" // เรารอเกินเวลาที่กำหนด
  | "UPSTREAM_ERROR"; // อย่างอื่นทั้งหมดที่ฝั่ง iShip

/** ข้อความภาษาไทยที่ "แสดงต่อร้านได้เลย" — บอกทั้งสิ่งที่เกิดและสิ่งที่ต้องทำต่อ */
const MESSAGES: Record<IShipErrorCode, string> = {
  TOKEN_INVALID:
    "การเชื่อมต่อ iShip ใช้งานไม่ได้แล้ว — Token อาจหมดอายุหรือถูกยกเลิก กรุณานำ Token ใหม่จากหลังบ้าน iShip มาใส่อีกครั้ง",
  INSUFFICIENT_BALANCE:
    "ยอดเงินในบัญชี iShip ไม่พอสำหรับเปิดพัสดุ กรุณาเติมเงินที่ระบบ iShip แล้วลองใหม่",
  ADDRESS_INVALID:
    "ที่อยู่ผู้รับไม่ผ่านการตรวจสอบของขนส่ง กรุณาตรวจตำบล อำเภอ จังหวัด และรหัสไปรษณีย์ให้ตรงกัน",
  COURIER_UNAVAILABLE:
    "ขนส่งที่เลือกไม่รับพื้นที่ปลายทางนี้ในขณะนี้ กรุณาเลือกขนส่งเจ้าอื่น",
  SHIPMENT_NOT_CANCELLABLE:
    "ยกเลิกพัสดุไม่ได้แล้ว เพราะขนส่งรับของเข้าระบบไปแล้ว กรุณาติดต่อขนส่งหรือจัดการที่ระบบ iShip โดยตรง",
  // ข้อความจริงจาก iShip จะถูกต่อท้ายให้ (ดู IShipError.userMessage) — เคสนี้เป็นเคสเดียว
  // ที่ยอมให้ข้อความดิบถึงตาร้าน เพราะมันคือ "สิ่งที่ต้องแก้" ถ้าปิดไว้ร้านจะไม่มีทางรู้เลย
  REJECTED_BY_CARRIER:
    "ขนส่งไม่รับคำสั่งนี้ เพราะข้อมูลยังไม่ครบตามที่ขนส่งต้องการ",
  UPSTREAM_TIMEOUT:
    "ระบบขนส่งไม่ตอบสนองภายในเวลาที่กำหนด คำสั่งซื้อของคุณถูกบันทึกไว้แล้ว กรุณากดลองใหม่อีกครั้ง",
  UPSTREAM_ERROR:
    "ระบบขนส่งขัดข้องชั่วคราว คำสั่งซื้อของคุณถูกบันทึกไว้แล้ว กรุณากดลองใหม่อีกครั้ง",
};

export class IShipError extends Error {
  readonly code: IShipErrorCode;
  /** ข้อความไทยที่แสดงต่อผู้ใช้ได้ — ไม่ใช่ข้อความดิบจาก iShip */
  readonly userMessage: string;
  /** ข้อความดิบจาก iShip — ข้อควรระวัง: เก็บ log/DB ได้ ห้ามแสดงตรงต่อผู้ใช้ (BR-ISHIP §6.4) */
  readonly upstreamMessage?: string;
  readonly httpStatus?: number;

  constructor(
    code: IShipErrorCode,
    opts?: { upstreamMessage?: string; httpStatus?: number },
  ) {
    super(`IShipError(${code})`);
    this.name = "IShipError";
    this.code = code;
    // REJECTED_BY_CARRIER เป็นข้อยกเว้นเดียวของ BR-ISHIP §6.4 (ห้ามโชว์ข้อความดิบ):
    // ข้อความดิบคือ "สิ่งที่ต้องแก้" เช่น "กรุณากรอก สีสินค้า …" ถ้าปิดไว้ร้านจะเห็นแต่
    // "ระบบขัดข้อง กรุณาลองใหม่" แล้วกดวนไม่จบเพราะสาเหตุจริงไม่เคยถูกบอก (เคสจริง prod 2026-07-29)
    this.userMessage =
      code === "REJECTED_BY_CARRIER" && opts?.upstreamMessage
        ? `${MESSAGES[code]} — ${redactToken(opts.upstreamMessage)}`
        : MESSAGES[code];
    this.upstreamMessage = opts?.upstreamMessage;
    this.httpStatus = opts?.httpStatus;
  }

  /** TOKEN_INVALID เป็นเคสเดียวที่ต้องไปเปลี่ยนสถานะการเชื่อมต่อของร้าน (BR-ISHIP-14) */
  get invalidatesConnection(): boolean {
    return this.code === "TOKEN_INVALID";
  }

  /**
   * ล้มเหลวแบบ "กดลองใหม่แล้วมีโอกาสสำเร็จ" — ใช้ตัดสินว่าจะโชว์ปุ่มลองใหม่ไหม
   *
   * REJECTED_BY_CARRIER ไม่อยู่ในนี้โดยเจตนา: ข้อมูลยังไม่ครบ กดกี่ครั้งก็ได้ผลเดิม
   * ต้องแก้ข้อมูลก่อนเท่านั้น การโชว์ปุ่มลองใหม่ในเคสนี้คือการหลอกให้ร้านเสียเวลา
   */
  get retryable(): boolean {
    return (
      this.code === "UPSTREAM_TIMEOUT" ||
      this.code === "UPSTREAM_ERROR" ||
      this.code === "COURIER_UNAVAILABLE"
    );
  }
}

/**
 * classifyRetryUX — "หน้าจอควรเชียร์ให้ร้านทำอะไรก่อน" เมื่อพัสดุใบนี้ FAILED
 *
 * อยู่ไฟล์เดียวกับ IShipError.retryable โดยเจตนา: เกณฑ์ "กดซ้ำแล้วมีโอกาสผ่านไหม" ต้องมี
 * ที่มาที่เดียว ถ้าปล่อยให้ component ตัดสินเองจะ drift จาก getter ข้างบนทันทีที่มีคนเพิ่ม code ใหม่
 *
 * รับ string ไม่ใช่ IShipErrorCode เพราะฝั่งหน้าจออ่านจาก `OrderShipment.lastErrorCode`
 * ซึ่งเป็นคอลัมน์ String — ค่าที่ไม่รู้จัก (รวม null) ตกเป็น "retry" ตามพฤติกรรมเดิม
 * ไม่ใช่ไปบล็อกร้าน เพราะ classifyUpstream เตือนตัวเองไว้ว่า keyword matching พลาดได้
 */
export type RetryUXKind = "retry" | "fix-data" | "balance";

export function classifyRetryUX(code: string | null | undefined): RetryUXKind {
  if (code === "INSUFFICIENT_BALANCE") return "balance";
  // กดกี่ครั้งก็ได้ผลเดิมจนกว่าจะแก้ข้อมูล/แก้การเชื่อมต่อ — allow-list ไม่ใช่ deny-list
  //
  // COURIER_UNAVAILABLE อยู่ในนี้ทั้งที่ `retryable` ข้างบนบอกว่า true โดยเจตนา: สองตัวนี้
  // ตอบคนละคำถาม — `retryable` = "ยิงซ้ำแล้วระบบอาจตอบต่างเดิมไหม" ส่วนตัวนี้ = "ควรเชียร์ให้
  // ร้านทำอะไรก่อน" และข้อความที่ร้านเห็นสั่งตรง ๆ ว่า "กรุณาเลือกขนส่งเจ้าอื่น" ซึ่งทำได้ที่ฟอร์ม
  // เท่านั้น การชูปุ่ม "ลองใหม่" ในเคสนี้คือการชวนให้ยิงขนส่งเจ้าเดิมซ้ำสวนคำแนะนำของตัวเอง
  if (
    code === "ADDRESS_INVALID" ||
    code === "REJECTED_BY_CARRIER" ||
    code === "TOKEN_INVALID" ||
    code === "COURIER_UNAVAILABLE"
  ) {
    return "fix-data";
  }
  return "retry";
}

/**
 * redactToken — ตัด token ออกจากข้อความก่อนเขียน log/DB
 *
 * ข้อควรระวัง: BR-ISHIP-12: token ห้ามโผล่ใน log ทุกกรณี. ข้อความ error จาก fetch/upstream
 * บางครั้งสะท้อน request header กลับมา จึงต้องกรองที่ "ทางออกทุกทาง" ไม่ใช่หวังว่า
 * upstream จะไม่ส่งกลับมา
 */
export function redactToken(text: string, token?: string): string {
  let out = text;
  if (token && token.length >= 8) {
    out = out.split(token).join("[REDACTED]");
  }
  // กันกรณี token โผล่มาในรูป header ที่เราไม่ได้ส่งค่าเข้ามาเทียบ
  return out.replace(/Bearer\s+[A-Za-z0-9._-]{16,}/g, "Bearer [REDACTED]");
}

/**
 * classifyUpstream — แปลงคำตอบของ iShip เป็น IShipErrorCode
 *
 * ลำดับการตัดสิน (สำคัญ — อย่าสลับ):
 *   1. HTTP status ที่บอกความหมายชัด (401/403 = สิทธิ์)
 *   2. field ที่เป็นโครงสร้างจาก payload
 *   3. คำสำคัญในข้อความ — ใช้เป็นทางเลือกสุดท้ายเท่านั้น เพราะผู้ให้บริการแก้คำได้
 */
export function classifyUpstream(
  httpStatus: number,
  rawMessage?: string,
): IShipErrorCode {
  if (httpStatus === 401 || httpStatus === 403) return "TOKEN_INVALID";

  const msg = (rawMessage ?? "").toLowerCase();

  // keyword matching — ทน 2 ภาษา เพราะ iShip ตอบไทยบ้างอังกฤษบ้าง
  // ใช้คำเดี่ยวที่เป็นแก่นของความหมาย ไม่ผูกกับโครงประโยค
  if (/(unauthor|invalid token|token.*(expire|invalid)|ไม่มีสิทธิ|โทเคน)/.test(msg))
    return "TOKEN_INVALID";
  // "เครดิต" เดี่ยว ๆ พอ — ห้ามผูกกับ "ไม่พอ" ท้ายประโยค: iShip ตอบจริงว่า "เครดิตไม่เพียงพอ"
  // ซึ่งไม่มีสตริง "ไม่พอ" อยู่เลย (ไ-ม-่-เ-พ-ี-ย-ง-พ-อ) แพตเทิร์นเดิมจึงพลาดทั้งที่ดูเหมือนครอบคลุม
  // → ตกไปเป็น UPSTREAM_ERROR = บอกร้านว่า "ระบบขนส่งขัดข้อง กรุณาลองใหม่" แล้วโชว์ปุ่มลองใหม่
  // ทั้งที่กดกี่ครั้งก็ไม่ผ่านจนกว่าจะเติมเงิน (เคสจริง prod 2026-08-06 DP256908A896B1BE กด 3 ครั้ง)
  if (/(insufficient|balance|ยอดเงิน|เครดิต|เงินไม่พอ|เงินไม่เพียงพอ)/.test(msg))
    return "INSUFFICIENT_BALANCE";
  if (/(address|zipcode|postcode|ที่อยู่|รหัสไปรษณีย์|ตำบล|อำเภอ)/.test(msg))
    return "ADDRESS_INVALID";
  if (/(courier|service.*not.*avail|ขนส่ง.*(ไม่|ปิด)|ไม่รองรับพื้นที่)/.test(msg))
    return "COURIER_UNAVAILABLE";
  if (/(cannot cancel|already.*(picked|accept)|ยกเลิกไม่ได้|รับพัสดุแล้ว)/.test(msg))
    return "SHIPMENT_NOT_CANCELLABLE";

  // ปฏิเสธเพราะข้อมูลไม่ครบ/ไม่ผ่านเงื่อนไข — ต้องอยู่ท้ายสุดของ keyword ทั้งหมด
  // เพราะเป็นตัวดักกว้าง ถ้าอยู่บนจะไปกลืนเคสที่เจาะจงกว่า (เช่น ที่อยู่/ยอดเงิน)
  //
  // เคสจริงที่พาให้เพิ่มอันนี้: iShip ตอบ "กรุณากรอก สีสินค้า …" แล้วเราเหมาเป็น
  // UPSTREAM_ERROR → บอกร้านว่า "ระบบขนส่งขัดข้อง กรุณาลองใหม่" ทั้งที่ระบบไม่ได้ขัดข้อง
  // และกดใหม่ก็ไม่มีวันผ่าน
  if (/(กรุณากรอก|กรุณาระบุ|จำเป็นต้อง|ไม่ถูกต้อง|is required|required field|validation|invalid )/.test(msg))
    return "REJECTED_BY_CARRIER";

  // 422 = ปฏิเสธเชิงความหมาย ไม่ใช่ระบบล่ม — ถือเป็นข้อมูลไม่ผ่านไว้ก่อน
  if (httpStatus === 422) return "REJECTED_BY_CARRIER";

  return "UPSTREAM_ERROR";
}
