/**
 * [blocker] การจัดกลุ่มข้อความติดกัน — ตัวตัดสินว่า "บับเบิลไหนได้รูปผู้ตอบ + เวลา"
 *
 * ที่มา 2026-08-10 (user เจอเองบน prod): ร้านที่มีแอดมินหลายคนตอบสลับกันในห้องเดียว
 * ข้อความของแอดมินคนแรก **ไม่มีทั้งรูปโปรไฟล์ผู้ตอบและเวลา** เพราะขอบ burst ตัดด้วย
 * `senderRole` อย่างเดียว (BUYER/SHOP) ซึ่งมองพนักงานทุกคนเป็นคนเดียวกัน
 *
 * ไม่มี gate ไหนจับได้: ทุกค่าถูกตามชนิด และหน้าจอยัง render ครบทุกข้อความ — ที่หายไปคือ
 * *ข้อมูลว่าใครตอบ* ซึ่งเป็นเหตุผลทั้งหมดที่ฟีเจอร์นี้ถูกสร้าง (user สั่ง 2026-08-02)
 *
 * เทสนี้แดง = ร้านหลายแอดมินกลับไปอ่านไม่ออกว่าใครตอบข้อความไหน ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import {
  BURST_GAP_MS,
  burstIdentity,
  computeBurstEndIds,
  type BurstMessage,
} from '@/lib/chat-message-burst'

const t0 = new Date('2026-08-10T03:00:00.000Z').getTime()
const at = (ms: number) => new Date(t0 + ms).toISOString()

const shop = (id: string, userId: string | null, offsetMs = 0): BurstMessage => ({
  id,
  senderRole: 'SHOP',
  senderUserId: userId,
  createdAt: at(offsetMs),
})
const buyer = (id: string, offsetMs = 0): BurstMessage => ({
  id,
  senderRole: 'BUYER',
  createdAt: at(offsetMs),
})

describe('burstIdentity', () => {
  it('แอดมินคนละคน = ตัวตนคนละตัว (ต้นเหตุของบั๊ก)', () => {
    expect(burstIdentity(shop('a', 'admin-1'))).not.toBe(burstIdentity(shop('b', 'admin-2')))
  })

  it('แอดมินคนเดียวกัน = ตัวตนเดียวกัน', () => {
    expect(burstIdentity(shop('a', 'admin-1'))).toBe(burstIdentity(shop('b', 'admin-1')))
  })

  it('ข้อความฝั่งร้านที่ไม่มีคนกดส่ง (echo/บอท) รวมกลุ่มกันเอง — ทุกใบใช้รูปเพจเหมือนกันหมด', () => {
    expect(burstIdentity(shop('a', null))).toBe(burstIdentity(shop('b', null)))
    // แต่ต้องไม่รวมกับแอดมินตัวจริง
    expect(burstIdentity(shop('a', null))).not.toBe(burstIdentity(shop('b', 'admin-1')))
  })

  it('ฝั่งผู้ซื้อไม่แยกรายคน (เธรดหนึ่งมีผู้ซื้อคนเดียว)', () => {
    expect(burstIdentity(buyer('a'))).toBe(burstIdentity(buyer('b')))
    expect(burstIdentity(buyer('a'))).not.toBe(burstIdentity(shop('b', 'admin-1')))
  })
})

describe('computeBurstEndIds', () => {
  it('แอดมิน 2 คนตอบติดกัน → **ทั้งคู่** เป็นท้าย burst (ต่างคนต้องเห็นรูปของตัวเอง)', () => {
    const ends = computeBurstEndIds([shop('m1', 'admin-1', 0), shop('m2', 'admin-2', 1000)])
    expect(ends.has('m1')).toBe(true)
    expect(ends.has('m2')).toBe(true)
  })

  it('แอดมินคนเดียวตอบติดกัน → เฉพาะใบสุดท้าย (พฤติกรรมเดิมต้องไม่เปลี่ยน)', () => {
    const ends = computeBurstEndIds([
      shop('m1', 'admin-1', 0),
      shop('m2', 'admin-1', 1000),
      shop('m3', 'admin-1', 2000),
    ])
    expect([...ends]).toEqual(['m3'])
  })

  it('เว้นช่วงเกิน 5 นาทีก็ตัด แม้เป็นคนเดิม', () => {
    const ends = computeBurstEndIds([
      shop('m1', 'admin-1', 0),
      shop('m2', 'admin-1', BURST_GAP_MS + 1),
    ])
    expect(ends.has('m1')).toBe(true)
    expect(ends.has('m2')).toBe(true)
  })

  it('สลับฝั่ง ผู้ซื้อ ↔ ร้าน ยังตัดตามเดิม', () => {
    const ends = computeBurstEndIds([
      buyer('b1', 0),
      shop('s1', 'admin-1', 1000),
      buyer('b2', 2000),
    ])
    expect([...ends].sort()).toEqual(['b1', 'b2', 's1'])
  })

  it('ข้อความสุดท้ายของเธรดเป็นท้าย burst เสมอ · รายการว่างไม่พัง', () => {
    expect([...computeBurstEndIds([shop('only', 'admin-1')])]).toEqual(['only'])
    expect(computeBurstEndIds([]).size).toBe(0)
  })
})
