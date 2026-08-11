/**
 * การแสดงผล "อัตราการตอบแชท" บนหน้าร้านสาธารณะ — SSOT ของ **เกณฑ์ว่าจะโชว์ไหม + คำที่ใช้**
 *
 * ตัวเลขดิบมาจาก `chat-metrics.service.ts` (cron คำนวณไว้ล่วงหน้า) ส่วนไฟล์นี้ตอบ 2 คำถามที่
 * ฝั่งหน้าจอต้องตอบให้ตรงกันทุกจุด: **"ข้อมูลพอจะพูดหรือยัง"** และ **"พูดว่าอะไร"**
 *
 * 🛑 ทำไมต้องแยกออกมา: เดิมตรรกะนี้เขียนอยู่ใน `AboutOverview.tsx` ที่เดียว พอ user สั่งย้าย
 * ตัวเลขขึ้นไปอยู่บนโปรไฟล์ (2026-08-10: "อัตราตอบกลับ ต้องอยู่บน Profile ห้ามเอาไปไว้ใน About")
 * ถ้าก็อปฟังก์ชันไปวางใน hero จะได้ **สองนิยามของคำเดียวกัน** ทันที — และเป็นชนิดที่ไม่มี gate ไหน
 * จับได้เลย เพราะทั้งสองฝั่ง "ถูก" ในตัวเอง ต่างกันแค่เส้นแบ่งนาที/ชั่วโมงหรือ sample gate
 * (Hard Rule 16)
 */

/** FR-RESP-04 — ต่ำกว่านี้ไม่โชว์อะไรเลย ไม่ใช่โชว์ 0% หรือ "ไม่มีข้อมูล" */
export const CHAT_RESPONSE_MIN_SAMPLE = 3;

export type ChatResponseInput = {
  chatResponseRate?: number | null;
  chatMedianResponseSec?: number | null;
  chatResponseSampleSize?: number | null;
};

/**
 * FR-RESP-06 — เวลาตอบเฉลี่ยเป็นข้อความไทย
 *
 * ใช้คำเต็มแทนสัญลักษณ์ (`~` / `+` / "ชม.") เพราะกลุ่มผู้ใช้ที่ PRODUCT.md ผูกไว้
 * (ผู้สูงวัย / digital-literacy ต่ำ) ไม่จำเป็นต้องคุ้นเครื่องหมายพวกนี้
 *
 * 🛑 2026-08-10 ตัดคำว่า "ประมาณ" ออก — เดิมมีไว้บอกว่าเป็นค่าเฉลี่ยไม่ใช่เวลาที่รับประกัน แต่ตอนนี้
 * ค่านี้ถูกประกอบเป็นประโยคเดียวกับ % ("ตอบกลับ 100% ใน 1 นาที") คำว่า "ใน" ข้างหน้าทำหน้าที่
 * เดียวกันอยู่แล้ว เก็บทั้งสองคำจะยาวเกินที่ช่องรับได้ · caller เดียวคือ ProfileHero
 * แก้ที่นี่ที่เดียวจึงไม่เกิดนิยามที่สอง (HR16)
 */
export function formatChatResponseTime(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} นาที`;
  if (seconds < 86400) return `${Math.max(1, Math.round(seconds / 3600))} ชั่วโมง`;
  if (seconds < 172800) return "1 วัน";
  // 🛑 "2 วันขึ้นไป" ไม่ใช่ "มากกว่า 2 วัน" — ประโยคเต็มคือ "ตอบกลับ 60% ใน …" และ
  // "ใน มากกว่า 2 วัน" อ่านสะดุดในภาษาไทย (คำบุพบทชนคำเปรียบเทียบ) ส่วน "ใน 2 วันขึ้นไป" ลื่น
  return "2 วันขึ้นไป";
}

/**
 * แปลงข้อมูลดิบเป็นสิ่งที่หน้าจอ render ได้ตรง ๆ — `null` = ยังไม่มีอะไรให้พูด (ซ่อนทั้งบรรทัด)
 *
 * คืน `ratePercent` เป็นจำนวนเต็มไปเลย ไม่ให้ฝั่ง UI ปัดเศษเอง เพราะการปัดคนละที่คือทางที่
 * ตัวเลขเดียวกันจะกลายเป็น 94% กับ 95% บนจอเดียว
 */
export function resolveChatResponse(
  data: ChatResponseInput,
): { ratePercent: number; timeLabel: string | null } | null {
  const { chatResponseRate, chatMedianResponseSec, chatResponseSampleSize } = data;
  if (chatResponseSampleSize == null || chatResponseSampleSize < CHAT_RESPONSE_MIN_SAMPLE) return null;
  if (chatResponseRate == null) return null;

  return {
    ratePercent: Math.round(chatResponseRate),
    timeLabel: formatChatResponseTime(chatMedianResponseSec),
  };
}
