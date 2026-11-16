// ตรรกะตัดสินของ UI บอทติดตามยอดขาย (00095) — pure · client-safe · ทดสอบใน __tests__/follow-bot-ui.test.ts
// (convention ui-boolean-needs-a-testable-home: boolean ที่ตัดสินจอต้องมีที่ให้เทสจับ)
import { isFollowBotKind } from '@/lib/auto-reply-constants'

type BubbleLike = { id: string; autoReplyKind?: string | null; followStep?: number | null }

/**
 * id ของฟอง AUTO_FOLLOW ที่ต้องติดป้ายเกยขอบ — ติดเฉพาะ "ฟองแรกของรอบ"
 * รอบ "ข้อความ + รูป" ออกมา 2 ฟองติดกัน: ถ้าฟองก่อนหน้าเป็น AUTO_FOLLOW ที่ followStep เดียวกัน = ไม่ซ้ำ
 * shortcut: ไม่มี followStep (ข้อมูลเก่า) ถือว่ารอบเดียวกัน — ฟอง AUTO_FOLLOW ติดกันสองรอบจริงจะเห็นป้ายแค่ใบแรก
 * ต้องส่ง messages เรียงเก่า→ใหม่ (ลำดับเดียวกับที่ thread วาด)
 */
export function followBotBadgeIds(messages: readonly BubbleLike[]): Set<string> {
  const ids = new Set<string>()
  messages.forEach((m, i) => {
    if (!isFollowBotKind(m.autoReplyKind)) return
    const prev = messages[i - 1]
    if (prev && isFollowBotKind(prev.autoReplyKind) && (prev.followStep ?? null) === (m.followStep ?? null)) return
    ids.add(m.id)
  })
  return ids
}

export type CapsuleSegment = 'sent' | 'next' | 'rest'

/** ช่องของแคปซูลในแถวกล่องแชท: ส่งแล้ว · รอบถัดไป · ที่เหลือ (ค่านอกช่วงถูกหนีบ — ไม่เชื่อ input) */
export function capsuleSegments(sentRounds: number, totalRounds: number): CapsuleSegment[] {
  const total = Math.max(0, Math.floor(totalRounds) || 0)
  const sent = Math.min(total, Math.max(0, Math.floor(sentRounds) || 0))
  return Array.from({ length: total }, (_, i) => (i < sent ? 'sent' : i === sent ? 'next' : 'rest'))
}
