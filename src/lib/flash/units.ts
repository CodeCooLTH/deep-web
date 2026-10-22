// feature 00084 — หน่วยเงิน/น้ำหนักของ Flash (TFR-FLASH-002): ส่งสตางค์/กรัมเป็นจำนวนเต็มเท่านั้น

export class FlashUnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlashUnitError";
  }
}

/** ค่า ≥0 ทศนิยม ≤2 ตำแหน่ง → จำนวนเต็มหน่วย 1/100 (ผ่านสตริง ไม่คูณ float ตรง ๆ) */
function toHundredths(x: unknown, what: string): number {
  let s: string;
  if (typeof x === "number") {
    if (!Number.isFinite(x) || x < 0) throw new FlashUnitError(`${what}: ค่าไม่ถูกต้อง`);
    s = x.toFixed(2);
    // toFixed ปัดเงียบ → ถ้าเพี้ยนเกิน float noise แปลว่ามีทศนิยมเกิน 2 ตำแหน่ง
    if (Math.abs(Number(s) - x) > 1e-7) throw new FlashUnitError(`${what}: ทศนิยมเกิน 2 ตำแหน่ง`);
  } else {
    s = String(x).trim(); // รองรับ Prisma Decimal / string
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new FlashUnitError(`${what}: ค่าไม่ถูกต้อง`);
  const n = Number(m[1] + (m[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(n)) throw new FlashUnitError(`${what}: ค่าใหญ่เกินไป`);
  return n;
}

export const bahtToSatang = (baht: unknown): number => toHundredths(baht, "baht");
export const kgToGram = (kg: unknown): number => toHundredths(kg, "kg") * 10;

/** ขาเข้า: รับเฉพาะจำนวนเต็มไม่ติดลบ (สตริง /^\d+$/ หรือ number integer) ไม่งั้น null */
export function parseSatangStrict(v: unknown): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\d+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

export function satangToBaht(v: unknown): number {
  const n = parseSatangStrict(v);
  if (n === null) throw new FlashUnitError("satang: ต้องเป็นจำนวนเต็มไม่ติดลบ");
  return n / 100;
}

/** กรัม → กก. ปัดครึ่งขึ้นที่ 2 ตำแหน่ง (DB Decimal(6,2)) */
export function gramToKg(v: unknown): number {
  const g = parseSatangStrict(v);
  if (g === null) throw new FlashUnitError("gram: ต้องเป็นจำนวนเต็มไม่ติดลบ");
  return Math.floor((g + 5) / 10) / 100;
}
