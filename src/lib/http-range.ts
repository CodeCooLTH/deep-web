/**
 * HTTP Range request parsing (RFC 7233 §3.1) สำหรับ /api/files
 *
 * ทำไมต้องมี: iOS (Safari/WKWebView) เล่น <video>/<audio> ได้ก็ต่อเมื่อเซิร์ฟเวอร์
 * ตอบ `206 Partial Content` ให้กับ Range request เท่านั้น — มันยิง `Range: bytes=0-1`
 * ไปถามก่อนเสมอ ถ้าได้ `200` พร้อมไฟล์ทั้งก้อนกลับมา มันจะทิ้งแล้วไม่เล่นเลย
 * (ผู้ใช้เห็นกล่องดำ + ปุ่ม play ที่กดไม่ติด) ต่างจาก Chrome/Android ที่ยอมรับ 200
 * จึงเป็นบั๊กที่โผล่เฉพาะ iOS
 */

/** ช่วงไบต์แบบ inclusive ทั้งสองฝั่ง (ตรงกับ semantics ของ HTTP Range) */
export type ByteRange = { start: number; end: number };

/**
 * เพดานขนาดต่อ 1 response ของ range request
 *
 * range แบบเปิดท้าย (`bytes=0-`) ตามสเปกแปลว่า "ถึงท้ายไฟล์" ซึ่งจะดึงไฟล์ทั้งก้อน
 * เข้า memory — เสียประโยชน์ของการทำ range ไปทั้งหมด. การตอบสั้นกว่าที่ขอมาเป็น
 * พฤติกรรมที่ถูกต้องตามสเปก (client จะขอส่วนที่เหลือต่อเอง) จึง cap ไว้
 *
 * 4MB: ไฟล์แนบสูงสุด 25MB (Supabase bucket limit) → อย่างมาก ~7 request ต่อวิดีโอ
 * ซึ่งยังอยู่ใต้ rate-limit ของ /api/files สบาย ๆ
 */
export const MAX_RANGE_CHUNK = 4 * 1024 * 1024;

export type RangeParseResult =
  /** ไม่มี Range header หรือรูปแบบที่เราไม่รองรับ → ให้ caller ตอบ 200 ทั้งไฟล์ตามเดิม */
  | { kind: "none" }
  /** ขอช่วงที่อยู่นอกไฟล์ → caller ต้องตอบ 416 */
  | { kind: "unsatisfiable" }
  | { kind: "ok"; range: ByteRange };

function parseCount(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * แปลง Range header เป็นช่วงไบต์ที่ใช้ได้จริงกับไฟล์ขนาด `size`
 *
 * รองรับเฉพาะ single range (`bytes=a-b`, `bytes=a-`, `bytes=-n`) — multi-range
 * ต้องตอบเป็น multipart/byteranges ซึ่งไม่มี client ตัวไหนในระบบเราต้องการ
 * จึง degrade เป็น 200 ทั้งไฟล์ (ถูกต้องตามสเปก: เซิร์ฟเวอร์ไม่จำเป็นต้องรองรับ)
 */
export function parseRangeHeader(
  header: string | null | undefined,
  size: number,
): RangeParseResult {
  if (!header) return { kind: "none" };

  const match = /^bytes=(.+)$/i.exec(header.trim());
  if (!match) return { kind: "none" };

  const specs = match[1].split(",");
  if (specs.length !== 1) return { kind: "none" };

  const spec = specs[0].trim();
  const dash = spec.indexOf("-");
  if (dash < 0) return { kind: "none" };

  const rawStart = spec.slice(0, dash).trim();
  const rawEnd = spec.slice(dash + 1).trim();

  // ไฟล์ว่าง — ไม่มีช่วงไหน satisfiable ได้เลย
  if (size <= 0) return { kind: "unsatisfiable" };

  let start: number;
  let end: number;

  if (rawStart === "") {
    // suffix range: `bytes=-N` = N ไบต์สุดท้าย
    const suffix = parseCount(rawEnd);
    if (suffix === null) return { kind: "none" };
    if (suffix === 0) return { kind: "unsatisfiable" };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    const parsedStart = parseCount(rawStart);
    if (parsedStart === null) return { kind: "none" };
    start = parsedStart;
    // เริ่มเลยท้ายไฟล์ → 416 (ห้ามตอบ 200 เพราะ client จะเข้าใจผิดว่าได้ของครบ)
    if (start >= size) return { kind: "unsatisfiable" };

    if (rawEnd === "") {
      end = size - 1;
    } else {
      const parsedEnd = parseCount(rawEnd);
      if (parsedEnd === null) return { kind: "none" };
      // ขอเกินท้ายไฟล์ได้ ให้ clamp ลงมา (สเปกบอกให้ถือว่าเป็นไบต์สุดท้าย)
      end = Math.min(parsedEnd, size - 1);
    }

    if (end < start) return { kind: "unsatisfiable" };
  }

  if (end - start + 1 > MAX_RANGE_CHUNK) {
    end = start + MAX_RANGE_CHUNK - 1;
  }

  return { kind: "ok", range: { start, end } };
}

/** ค่า Content-Range header ของ response 206 */
export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}
