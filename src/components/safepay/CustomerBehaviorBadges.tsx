/**
 * CustomerBehaviorBadges — markup กลางของ "ป้ายพฤติกรรมลูกค้า" (feature 00057)
 *
 * เกณฑ์/คำ/ไอคอน มาจาก `src/lib/customer-behavior.ts` (SSOT เดิม) — ไฟล์นี้คุมแค่ **หน้าตา**
 * ให้ป้ายเดียวกันดูเหมือนกันทุกจอ
 *
 * 🛑 ทำไมต้องสกัดออกมา: markup 2 ทรงนี้เคยถูกก็อปไว้ 2 ที่ (`OrdersTable.tsx` แบบไอคอนล้วน
 * และ `CustomerPanel.tsx` แบบมีคำ) — พอฟีเจอร์ 00057 เพิ่มอีก 2 จุด (ลิสต์ลูกค้า + หน้าโปรไฟล์)
 * จะกลายเป็น **4 จุดที่ต้องเหมือนกันเป๊ะโดยไม่มีอะไรบังคับ** ซึ่งเป็นรูปร่างเดียวกับบั๊กที่เคยเกิด
 * ตอนเพิ่มป้าย `CANCELLED_BY_BUYER` (2026-08-11) ที่ต้องไล่แก้ 2 ไฟล์พร้อมกันแล้วเกือบลืมไปหนึ่ง
 *
 * 🛑 คืน fragment ไม่ใช่ container — **layout เป็นของหน้าที่เรียก** (บางที่อยู่ในบรรทัดชื่อ
 * บางที่เป็นแถบเต็มความกว้างมีเส้นคั่น) สิ่งที่ต้องไม่ drift คือ *ตัวป้าย* ไม่ใช่กล่องที่ห่อมัน
 *
 * กติกาสีมาจาก `customer-behavior.ts` โดยตรง: `warning` = ควรระวัง · `info` = เป็นกลาง/บวก
 * **ห้ามมี success/เขียว และ danger/แดง** — ทั้งหมดคือ "ควรระวัง" ไม่ใช่ "ห้ามขาย"
 */
import Icon from '@/components/wrappers/Icon'
import type { CustomerBadge } from '@/lib/customer-behavior'

/**
 * โทนสีของป้าย — เขียนที่เดียว ทั้งสองทรงใช้ร่วมกัน
 * (เดิม 2 ไฟล์เขียนเทอร์นารีชุดนี้ซ้ำกันคนละบรรทัด)
 */
function toneClass(tone: CustomerBadge['tone']): string {
  return tone === 'warning' ? 'bg-warning/15 text-warning-ink' : 'bg-info/15 text-info-ink'
}

/**
 * ทรงไอคอนล้วน — ใช้ในที่ที่พื้นที่ต่อแถวจำกัด (ตาราง `/orders`, ลิสต์ `/customers`)
 *
 * 🛑 `role="img"` + `aria-label` บังคับ: `<span>` เปล่าไม่รองรับ "ชื่อจากผู้เขียน" screen reader
 * ที่ทำตามสเปกจะทิ้ง label ทิ้ง (`docs/conventions/aria-name-requires-supporting-role.md`)
 * และ `title=` อย่างเดียวไม่พอเพราะมือถือไม่มี hover — ต้องมีคู่กันเสมอ
 */
export function CustomerBehaviorIcons({ badges }: { badges: CustomerBadge[] }) {
  if (badges.length === 0) return null
  return (
    <>
      {badges.map((b) => (
        <span
          key={b.key}
          role="img"
          aria-label={b.detail ?? b.label}
          title={b.detail ?? b.label}
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${toneClass(b.tone)}`}
        >
          <Icon icon={b.icon} className="text-sm" aria-hidden="true" />
        </span>
      ))}
    </>
  )
}

/**
 * ทรงมีคำ — ใช้ในที่ที่มีพื้นที่พอให้อ่านได้ (แผงลูกค้าในแชท, หน้าโปรไฟล์ลูกค้า)
 * ยังต้องมี `role="img"`/`aria-label` เพราะไอคอนข้างในต้องไม่ถูกอ่านเป็นอักขระประหลาด
 */
export function CustomerBehaviorPills({ badges }: { badges: CustomerBadge[] }) {
  if (badges.length === 0) return null
  return (
    <>
      {badges.map((b) => (
        <span
          key={b.key}
          role="img"
          aria-label={b.detail ?? b.label}
          title={b.detail ?? b.label}
          className={`badge inline-flex items-center gap-1 text-2xs ${toneClass(b.tone)}`}
        >
          <Icon icon={b.icon} className="text-xs" aria-hidden="true" />
          {b.label}
        </span>
      ))}
    </>
  )
}
