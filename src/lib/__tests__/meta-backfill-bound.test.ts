import { describe, expect, it } from 'vitest'
import { decideBackfillStep, MAX_BACKFILL_PAGES } from '@/lib/meta-backfill-bound'

const created = new Date('2026-09-01T00:00:00.000Z')

describe('[blocker] ขอบเขตการไล่ย้อนจาก Meta', () => {
  it('ไล่ถึงใบที่เก่ากว่าวันสร้างเธรดแล้ว = หยุดและปักธงว่าครบ', () => {
    expect(
      decideBackfillStep({
        oldestInPage: new Date('2026-08-31T23:00:00.000Z'),
        conversationCreatedAt: created,
        pageNo: 3,
        hasNextPage: true,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: true, markComplete: true })
  })

  it('Meta ไม่มีหน้าถัดไปแล้ว = หยุดและปักธง (เธรดสั้นกว่าที่คิด)', () => {
    expect(
      decideBackfillStep({
        oldestInPage: new Date('2026-09-05T00:00:00.000Z'),
        conversationCreatedAt: created,
        pageNo: 2,
        hasNextPage: false,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: true, markComplete: true })
  })

  it('ชนเพดานหน้า = หยุดแต่ห้ามปักธง (ยังไม่ครบ — รอบหน้าเริ่มหน้า 1 ใหม่ ไม่ได้ไล่ต่อ)', () => {
    expect(
      decideBackfillStep({
        oldestInPage: new Date('2026-09-05T00:00:00.000Z'),
        conversationCreatedAt: created,
        pageNo: MAX_BACKFILL_PAGES,
        hasNextPage: true,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: true, markComplete: false })
  })

  it('ยังไม่ถึงวันสร้างและยังมีหน้าถัดไป = ไปต่อ', () => {
    expect(
      decideBackfillStep({
        oldestInPage: new Date('2026-09-05T00:00:00.000Z'),
        conversationCreatedAt: created,
        pageNo: 1,
        hasNextPage: true,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: false, markComplete: false })
  })

  it('หน้าว่างเปล่าและไม่มีหน้าถัดไป = หยุดและปักธง (ไม่มีอะไรให้ไล่ต่อ)', () => {
    expect(
      decideBackfillStep({
        oldestInPage: null,
        conversationCreatedAt: created,
        pageNo: 1,
        hasNextPage: false,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: true, markComplete: true })
  })

  // เอกสาร Graph: "a page may be empty but contain a next paging link. Stop paging when the next
  // link no longer appears." — หน้าว่างไม่ใช่หลักฐานว่าจบ
  it('หน้าว่างแต่ Meta ยังให้ next = ไปต่อ ห้ามปักธง', () => {
    expect(
      decideBackfillStep({
        oldestInPage: null,
        conversationCreatedAt: created,
        pageNo: 1,
        hasNextPage: true,
        maxPages: MAX_BACKFILL_PAGES,
      }),
    ).toEqual({ stop: false, markComplete: false })
  })
})
