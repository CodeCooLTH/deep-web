// inspection-round.service.test.ts — [blocker] ตัวเปิดรอบตรวจ = กลไกที่ทำให้ "ตรวจต่อเนื่อง" จริง
//
// 🛑 ถ้าไฟล์นี้ผิด ระบบจะ **ทำงานถูกทุกบรรทัด ไม่มี error สักตัว** แล้วฟีเจอร์เสื่อมเองเงียบ ๆ
//    เพราะไม่มีใครถูกส่งไปตรวจ — ป้ายของร้านที่จ่ายเงินต่อเนื่องจะร่วงทีละข้อตามอายุผล

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { UNASSIGNED_INSPECTOR_NAME } from '@/lib/inspection/round-planning'
import { createDueRoundsForShop } from '@/services/inspection-round.service'

const roomFindMany = vi.fn()
const resultFindMany = vi.fn()
const roundFindMany = vi.fn()
const roundCreateMany = vi.fn()

const tx = {
  room: { findMany: (...a: unknown[]) => roomFindMany(...a) },
  inspectionResult: { findMany: (...a: unknown[]) => resultFindMany(...a) },
  inspectionRound: {
    findMany: (...a: unknown[]) => roundFindMany(...a),
    createMany: (...a: unknown[]) => roundCreateMany(...a),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const NOW = new Date('2026-09-01T03:00:00.000Z')
const SHOP = 'shop-1'
const rowsOf = () => (roundCreateMany.mock.calls[0]?.[0]?.data ?? []) as Array<Record<string, unknown>>

beforeEach(() => {
  vi.clearAllMocks()
  roomFindMany.mockResolvedValue([{ id: 'room-a' }, { id: 'room-b' }])
  resultFindMany.mockResolvedValue([])
  roundFindMany.mockResolvedValue([])
  roundCreateMany.mockResolvedValue({ count: 0 })
})

describe('createDueRoundsForShop', () => {
  it('ขั้น 1 ไม่เปิดรอบเลย — เป็นข้อตรวจอัตโนมัติที่ cron ทำเองทุกวัน', async () => {
    expect(await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 1, now: NOW })).toBe(0)
    expect(roundCreateMany).not.toHaveBeenCalled()
  })

  it('🛑 mutation: เอาที่พักที่ปิดรับจองมาตรวจด้วย (ถอด isActive) → เคสนี้ต้องแดง', async () => {
    await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })
    expect(roomFindMany.mock.calls[0]?.[0]).toMatchObject({ where: { shopId: SHOP, isActive: true } })
  })

  it('🛑 mutation: จัดกลุ่มรอบด้วย (roomId, step) โดยไม่มี method → เคสนี้ต้องแดง', async () => {
    // ขั้น 3 มี 2 วิธีตรวจอยู่ด้วยกัน — กันซ้ำด้วย step อย่างเดียวจะทำให้รอบที่สอง
    // ไม่มีวันถูกสร้าง แล้วข้อของวิธีนั้นค้างเป็น "รอตรวจซ้ำ" ตลอดกาล
    await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 3, now: NOW })
    const methods = new Set(rowsOf().map((r) => r.method))
    expect(methods.size).toBeGreaterThan(1)
  })

  it('🛑 mutation: ถอดการเช็ค openRoundKeys → เคสนี้ต้องแดง (รอบค้างข้ามวันจะถูกสร้างซ้ำทุกวัน)', async () => {
    const first = await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })
    expect(first).toBeGreaterThan(0)

    // รอบที่สร้างไปแล้วยังเปิดค้างอยู่ ⇒ รอบถัดไปต้องไม่สร้างอะไรเพิ่ม
    roundFindMany.mockResolvedValue(
      rowsOf().map((r) => ({ roomId: r.roomId, step: r.step, method: r.method })),
    )
    roundCreateMany.mockClear()
    expect(await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })).toBe(0)
    expect(roundCreateMany).not.toHaveBeenCalled()
  })

  it('ข้อที่ผูกรายหลังต้องกระจายครบทุกหลัง — หลังที่เพิ่งเปิดใหม่ได้รอบของตัวเอง', async () => {
    await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })
    const roomIds = rowsOf().map((r) => r.roomId)
    expect(roomIds).toContain('room-a')
    expect(roomIds).toContain('room-b')
  })

  it('🛑 mutation: ให้ NOT_APPLICABLE เปิดรอบด้วย → เคสนี้ต้องแดง', async () => {
    // ส่งผู้ตรวจไปดูสิ่งที่ประกาศแล้วว่าไม่เกี่ยวกับที่พักหลังนี้ = เผางบของร้านที่จ่ายเงิน
    const base = {
      checkedAt: new Date('2026-08-01T00:00:00.000Z'),
      lastConfirmedAt: new Date('2026-08-01T00:00:00.000Z'),
      expiresAt: null,
      invalidatedAt: null,
    }
    const planned = await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })
    const sample = rowsOf()[0]
    expect(sample).toBeDefined()

    // ทำให้ "ทุกข้อของหลัง room-a" เป็น NOT_APPLICABLE แล้วรอบของหลังนั้นต้องหายไป
    const { checksForStep, checkScope } = await import('@/lib/inspection/checks')
    resultFindMany.mockResolvedValue(
      checksForStep(2)
        .filter((k) => checkScope(k) === 'ROOM')
        .map((checkKey, i) => ({ ...base, id: `r${i}`, checkKey, roomId: 'room-a', outcome: 'NOT_APPLICABLE' })),
    )
    roundCreateMany.mockClear()
    const after = await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })
    expect(after).toBeLessThan(planned)
    expect(rowsOf().map((r) => r.roomId)).not.toContain('room-a')
  })

  it('ผลที่ยังผ่านและอีกนานกว่าจะหมดอายุ = ยังไม่เปิดรอบ', async () => {
    const far = new Date(NOW.getTime() + 200 * 86_400_000)
    const { checksForStep } = await import('@/lib/inspection/checks')
    resultFindMany.mockResolvedValue(
      checksForStep(2).flatMap((checkKey, i) =>
        [null, 'room-a', 'room-b'].map((roomId, j) => ({
          id: `r${i}-${j}`,
          checkKey,
          roomId,
          outcome: 'PASS',
          checkedAt: NOW,
          lastConfirmedAt: NOW,
          expiresAt: far,
          invalidatedAt: null,
        })),
      ),
    )
    expect(await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })).toBe(0)
  })

  it('🛑 รอบที่ยังไม่มอบหมายต้องมีชื่อที่อ่านรู้เรื่อง ไม่ใช่สตริงว่าง', async () => {
    await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })
    for (const row of rowsOf()) {
      expect(row.inspectorUserId).toBeNull()
      expect(row.inspectorDisplayName).toBe(UNASSIGNED_INSPECTOR_NAME)
      expect(String(row.inspectorDisplayName).trim().length).toBeGreaterThan(0)
    }
  })

  it('🛑 mutation: ถอด tie-break id ออกจาก orderBy ของผลตรวจ → เคสนี้ต้องแดง', async () => {
    // ต้องเรียงให้ตรงกับ latestResultPerCheck ฝั่ง TS เป๊ะ ไม่งั้น "แถวล่าสุด" คนละแถวกัน
    await createDueRoundsForShop(tx, { shopId: SHOP, planStep: 2, now: NOW })
    expect(resultFindMany.mock.calls[0]?.[0]?.orderBy).toEqual([{ checkedAt: 'desc' }, { id: 'desc' }])
  })
})
