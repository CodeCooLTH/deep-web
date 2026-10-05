/**
 * retry-key.ts — X-Line-Retry-Key ที่คงที่ข้าม retry (LINE-API-Facts §3: ต้องเป็น UUID, กันซ้ำ 24 ชม.)
 * UUIDv5 จาก (groupId, slotKey) ⇒ slot เดียวกัน = key เดียวกันเสมอ
 */
import { v5 } from 'uuid'

/** namespace คงที่ของฟีเจอร์นี้ — ห้ามเปลี่ยน: เปลี่ยนแล้ว key ของ slot ที่ค้างอยู่จะต่างจากที่ส่งไปแล้ว */
export const LINE_REPORT_NS = '6f1d2c4e-8a3b-4e7a-9c5d-1b2a3c4d5e6f'

export function retryKeyFor(groupId: string, slotKey: string): string {
  return v5(`${groupId}|${slotKey}`, LINE_REPORT_NS)
}
