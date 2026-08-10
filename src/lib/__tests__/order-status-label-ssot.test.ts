/**
 * [blocker] ป้ายสถานะออเดอร์ต้องมาจาก SSOT เดียวทั้งระบบ — feature 00041 (FR-020 / BR-BOE-24 / HR16)
 *
 * ที่มา: ก่อนรอบนี้มีชุด label ประกาศแยกกัน **อย่างน้อย 10 จุด** ข้ามทั้ง buyer/admin
 * (`OrderDetailMobile`, `views/apps/ecommerce/orders/list`, `views/apps/ecommerce/dashboard/Orders`,
 * `m/orders` ×2, `m/settings/profile`, `admin/orders/OrdersTable` ×2, `getStatusPill` ที่ไม่มีผู้เรียก)
 * ผลคือ **ออเดอร์ใบเดียวกันอ่านคนละคำ**: ฝั่งร้านเห็น "กำลังจัดส่ง" ผู้ซื้อเห็น "จัดส่งแล้ว"
 * ซึ่งไม่ใช่แค่ผิดกฎ แต่ผิดความหมายจริง — SHIPPED = ของออกจากร้านแล้วแต่ยังไม่ถึงมือ
 *
 * ทำไมต้องเป็นเทสไม่ใช่คอมเมนต์: ของเดิมมีคอมเมนต์กำกับอยู่แล้วว่า "frozen ถ้าแก้ต้องแก้ทั้งคู่
 * พร้อมกัน" — แล้วมันก็เพี้ยนจริงอยู่ดี วินัยคนคุมไม่ใช่ SSOT
 *
 * 🛑 แดง = มีใครสร้างชุด label ที่ 11 ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ORDER_STATUS_META } from '@/lib/order-display'
import { resolveOrderStatusBadge } from '@/lib/order-stage'

const SRC = join(process.cwd(), 'src')
const STATUS_KEYS = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'] as const

/**
 * ไฟล์ที่ได้รับยกเว้น — ต้องมีเหตุผลเฉพาะตัว ไม่ใช่ "แก้ไม่ทัน"
 * (ถ้ารายการนี้ยาวขึ้นเรื่อย ๆ แปลว่าเทสกำลังกลายเป็นพิธีกรรม ไม่ใช่ด่าน)
 */
const ALLOWED = new Set([
  // SSOT ตัวจริง
  'lib/order-display.ts',
  // เทสตัวนี้เอง (มีชื่อสถานะ + คำไทยปนกันเป็นธรรมดา)
  'lib/__tests__/order-status-label-ssot.test.ts',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      walk(full, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('SSOT ของป้ายสถานะออเดอร์', () => {
  it('ORDER_STATUS_META เป็นแหล่งเดียวและ SHIPPED ต้องอ่านว่า "กำลังจัดส่ง"', () => {
    // ค่าที่ user เคาะไว้ 2026-08-05 — SHIPPED เป็นสถานะ "ระหว่างทาง" ไม่ใช่สถานะจบ
    expect(ORDER_STATUS_META.SHIPPED.label).toBe('กำลังจัดส่ง')
    expect(ORDER_STATUS_META.PENDING.label).toBe('รอดำเนินการ')
    expect(ORDER_STATUS_META.CONFIRMED.label).toBe('สำเร็จ')
    expect(ORDER_STATUS_META.CANCELLED.label).toBe('ยกเลิก')
  })

  it('resolveOrderStatusBadge คืนคำเดียวกับ SSOT เมื่อไม่ระบุ stage', () => {
    for (const key of STATUS_KEYS) {
      expect(resolveOrderStatusBadge(key).label).toBe(ORDER_STATUS_META[key].label)
    }
  })

  // 🛑 หัวใจของไฟล์นี้: สแกน "ซอร์สจริง" ไม่ hardcode รายชื่อไฟล์ — ไฟล์ใหม่ที่ทำผิดแบบเดิม
  // จะถูกจับทันทีโดยไม่มีใครต้องจำมาอัปเดตเทส
  //
  // ขอบเขตที่จับได้จริง (พูดตรง ๆ ว่าจับอะไรไม่ได้ ดีกว่าให้คนเข้าใจว่ากันครบ):
  //   จับ = บรรทัดที่มีคำว่า SHIPPED คู่กับ label ภาษาไทยที่พิมพ์เอง
  //   ไม่จับ = ชุดที่ผิดเฉพาะ PENDING/CONFIRMED/CANCELLED โดยไม่แตะ SHIPPED
  // เหตุผลที่ยึด SHIPPED: เป็นคีย์เดียวที่มีเฉพาะโดเมนออเดอร์ — ส่วน PENDING/CONFIRMED/CANCELLED
  // ถูกใช้โดยโดเมนอื่นเต็มไปหมด (ยืนยันตัวตน, การจอง, เติมเงิน, สถานะพัสดุ) ถ้าจับด้วยจะได้
  // false positive จำนวนมากจนเทสถูกปิดทิ้งในที่สุด ซึ่งแย่กว่าเทสที่จับแคบแต่แม่น
  // และ SHIPPED คือคีย์ที่เพี้ยนจริงในเหตุการณ์นี้ทุกจุด
  it('ไม่มีไฟล์ไหนจับคู่ SHIPPED กับ label ที่พิมพ์เองเป็นภาษาไทย', () => {
    const offenders: string[] = []

    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/')
      if (ALLOWED.has(rel)) continue

      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // ข้ามคอมเมนต์ — ไฟล์ที่ทำถูกกฎมักอธิบายกฎไว้ในคอมเมนต์ ถ้าไม่ข้ามจะแดงตลอดกาล
          // (บทเรียน HR9: gate ที่ match คำเปล่า ๆ ถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิดเลย)
          const code = line.trim()
          if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return

          if (!/\bSHIPPED\b/.test(line)) return

          // label: 'ข้อความไทย'  ← คือรูปแบบที่ทำให้เกิดชุดที่สอง
          // (ต้องมีอักษรไทยจริง — `label: statusLabel(x)` หรือ `label: META.X.label` ผ่าน)
          if (/\blabel\s*:\s*['"][^'"]*[\u0E00-\u0E7F][^'"]*['"]/.test(line)) {
            offenders.push(`${rel}:${i + 1}  ${code}`)
          }
        })
    }

    expect(offenders, `พบชุด label ที่พิมพ์เอง — ต้องอ่านจาก ORDER_STATUS_META แทน:\n${offenders.join('\n')}`).toEqual([])
  })
})
