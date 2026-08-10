/**
 * [blocker] เหตุการณ์ instrumentation ต้องไม่โผล่ในไทม์ไลน์ที่ผู้ใช้เห็น — feature 00041 (TFR-013)
 *
 * `AUTH_FLOW_STARTED`/`AUTH_FLOW_COMPLETED` มีไว้วัด Login Completion Rate อย่างเดียว
 * ถ้าหลุดเข้าไทม์ไลน์ ประวัติออเดอร์ของร้านจะรกด้วยเหตุการณ์ที่ไม่มีความหมายกับเขาเลย
 * (และ guest ที่กดปุ่ม login ซ้ำ ๆ จะยิ่งถมเข้าไป — ฝั่งนั้นไม่ dedupe โดยตั้งใจ)
 *
 * กรองที่ `getOrderEvents()` จุดเดียวเพราะเป็นทางเดียวที่ UI ดึงไทม์ไลน์ไปแสดง
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
vi.mock('@/lib/prisma', () => ({
  prisma: { orderEvent: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

import { getOrderEvents } from '@/services/order-event.service'
import { ORDER_EVENT_TYPES, ORDER_EVENT_META } from '@/lib/order-event'

beforeEach(() => {
  vi.clearAllMocks()
  findMany.mockResolvedValue([])
})

describe('instrumentation event', () => {
  it('ทั้งสองชนิดถูกประกาศไว้ใน ORDER_EVENT_TYPES', () => {
    expect(ORDER_EVENT_TYPES).toContain('AUTH_FLOW_STARTED')
    expect(ORDER_EVENT_TYPES).toContain('AUTH_FLOW_COMPLETED')
  })

  it('มี META ครบ (TypeScript บังคับอยู่แล้ว แต่ล็อกไว้กันคนลบทิ้งตอน refactor)', () => {
    expect(ORDER_EVENT_META.AUTH_FLOW_STARTED?.label).toBeTruthy()
    expect(ORDER_EVENT_META.AUTH_FLOW_COMPLETED?.label).toBeTruthy()
  })

  // 🛑 หัวใจของไฟล์นี้
  it('getOrderEvents กรอง instrumentation ออกจาก query เสมอ', async () => {
    await getOrderEvents('ord_1')

    const where = findMany.mock.calls[0][0].where as {
      orderId: string
      type?: { notIn?: string[] }
    }
    expect(where.orderId).toBe('ord_1')
    expect(where.type?.notIn).toEqual(
      expect.arrayContaining(['AUTH_FLOW_STARTED', 'AUTH_FLOW_COMPLETED']),
    )
  })

  it('ไม่กรองชนิดอื่นทิ้งไปด้วย', async () => {
    await getOrderEvents('ord_1')
    const notIn = (findMany.mock.calls[0][0].where.type?.notIn ?? []) as string[]

    // ทุกชนิดที่ "ไม่ใช่ instrumentation" ต้องยังแสดงได้ — กันเคสที่ใครเผลอใส่ชื่อผิดลง notIn
    for (const t of ORDER_EVENT_TYPES) {
      if (t === 'AUTH_FLOW_STARTED' || t === 'AUTH_FLOW_COMPLETED') continue
      expect(notIn).not.toContain(t)
    }
  })
})
