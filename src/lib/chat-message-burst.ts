/**
 * chat-message-burst — กฎการจัดกลุ่ม "ข้อความที่ติดกัน" ในเธรดแชท (2026-08-10)
 *
 * burst = ชุดข้อความติดกันที่มาจากผู้ส่งคนเดียวในช่วงเวลาใกล้กัน. UI แสดง **เวลา + รูปผู้ส่ง
 * เฉพาะข้อความท้าย burst** (user สั่ง 2026-07-23: ไม่ต้องโชว์เวลาทุกบรรทัด)
 *
 * ทำไมอยู่ใน `src/lib` ไม่ใช่ในไฟล์ ChatThread.tsx: มันคือ boolean ที่ตัดสินว่า UI จะแสดงอะไร
 * ถ้าเขียนกลับด้านหรือเทียบผิดฟิลด์จะไม่มีอะไรฟ้องเลย (`tsc`/build/detector ผ่านหมด เพราะทุกค่า
 * ถูกตามชนิด) — ดู `docs/conventions/ui-boolean-needs-a-testable-home.md`
 *
 * เคสจริงที่ทำให้ต้องแยกไฟล์นี้: เดิมขอบ burst ตัดด้วย `senderRole` อย่างเดียว ซึ่งมองพนักงาน
 * ร้านทุกคนเป็นคนเดียวกัน → ร้านที่มีแอดมินหลายคนตอบสลับกัน ข้อความของคนแรกไม่ใช่ท้าย burst
 * จึงไม่มีทั้งรูปผู้ตอบและเวลา (user เจอเองบน prod)
 */

export type BurstMessage = {
  id: string
  senderRole: 'BUYER' | 'SHOP'
  /** null = ไม่มี "คน" กดส่ง (echo จาก Business Suite / บอท) → UI แสดงรูปเพจ */
  senderUserId?: string | null
  createdAt: string | Date
}

/** ช่วงเวลาที่ยังถือว่า "ติดกัน" — เกินนี้ขึ้นเวลาใหม่ (user 2026-07-23) */
export const BURST_GAP_MS = 5 * 60 * 1000

/**
 * ตัวตนของผู้ส่งสำหรับการจัดกลุ่ม
 *
 * ใช้ `senderUserId` ไม่ใช่ชื่อที่แสดง — ชื่อซ้ำกันได้ และสิ่งที่ต้องแยกคือคนละบัญชี
 * ฝั่งผู้ซื้อไม่ต้องแยกรายคน (เธรดหนึ่งมีผู้ซื้อคนเดียวอยู่แล้ว) จึงคืน role ตรง ๆ
 */
export function burstIdentity(m: BurstMessage): string {
  return m.senderRole === 'SHOP' ? `SHOP:${m.senderUserId ?? ''}` : m.senderRole
}

/**
 * id ของข้อความที่เป็น "ท้าย burst" — ตัดกลุ่มเมื่อ **ผู้ส่งเปลี่ยน** หรือเว้นช่วงเกิน gap
 * ข้อความสุดท้ายของเธรดเป็นท้าย burst เสมอ
 */
export function computeBurstEndIds(
  messages: readonly BurstMessage[],
  gapMs: number = BURST_GAP_MS,
): Set<string> {
  const ends = new Set<string>()
  for (let i = 0; i < messages.length; i++) {
    const cur = messages[i]
    const nxt = messages[i + 1]
    if (
      !nxt ||
      burstIdentity(nxt) !== burstIdentity(cur) ||
      new Date(nxt.createdAt).getTime() - new Date(cur.createdAt).getTime() > gapMs
    ) {
      ends.add(cur.id)
    }
  }
  return ends
}
