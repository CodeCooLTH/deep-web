import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  CANCEL_REASONS_BY_VERTICAL,
  SYSTEM_CANCEL_REASONS,
  DRAFT_DISCARD_REASON,
  DRAFT_EXPIRED_REASON,
  isDraftLifecycleCancelReason,
  isValidCancelReason,
  cancelReasonLabel,
} from '@/lib/cancel-reasons'
import { BUYER_FAULT_CANCEL_REASONS } from '@/lib/cancel-reason-buyer-fault'

/**
 * 00061 — เหตุผลยกเลิก 3 ค่าใหม่ (มติ OD-ACO-01 + มติ user 2026-09-05)
 *
 * `DUPLICATE_ORDER`  ผู้ขายกดยกเลิกใบเก่าจากการ์ด "มาแทนใบก่อนหน้า" → อยู่ในดรอปดาวน์
 * `DRAFT_DISCARDED`  ผู้ขายกดปุ่ม "ทิ้งร่างนี้"                    → ระบบตั้ง ไม่อยู่ในดรอปดาวน์
 * `DRAFT_EXPIRED`    ระบบเก็บกวาดร่างค้างเกิน 7 วัน                 → ระบบตั้ง ไม่อยู่ในดรอปดาวน์
 */
describe('เหตุผลยกเลิกที่เพิ่มใน 00061', () => {
  it('[blocker] DUPLICATE_ORDER ต้องไม่อยู่ใน BUYER_FAULT_CANCEL_REASONS', () => {
    // ระบบสร้างใบซ้ำเองไม่ใช่ความผิดลูกค้า — เพิ่มเข้าไปเมื่อไหร่ = ติดตราลูกค้าจากเหตุที่
    // เขาไม่ได้ก่อ ซึ่งเป็นคลาสที่ไฟล์นั้นบันทึกไว้เองว่าเคยเกิดบน prod แล้ว
    expect(BUYER_FAULT_CANCEL_REASONS as readonly string[]).not.toContain('DUPLICATE_ORDER')
  })

  it('[blocker] เหตุผลของวงจรร่างต้องไม่อยู่ใน BUYER_FAULT_CANCEL_REASONS', () => {
    expect(BUYER_FAULT_CANCEL_REASONS as readonly string[]).not.toContain(DRAFT_DISCARD_REASON)
    expect(BUYER_FAULT_CANCEL_REASONS as readonly string[]).not.toContain(DRAFT_EXPIRED_REASON)
  })

  it('[blocker] เหตุผลของวงจรร่าง "ร้านเลือกเองไม่ได้" — ต้องไม่อยู่ในดรอปดาวน์ของ vertical ใดเลย', () => {
    // นี่คือด่านที่ทำให้การกรองใน getShopProfileStats ไม่ละเมิด BR-OSM-05:
    // สิ่งที่ถูกกรองต้องเป็นค่าที่ *ระบบตั้งเท่านั้น* ไม่ใช่ค่าที่ร้านเลือกได้
    for (const reason of Object.keys(SYSTEM_CANCEL_REASONS)) {
      for (const [vertical, options] of Object.entries(CANCEL_REASONS_BY_VERTICAL)) {
        expect(
          options.map((o) => o.value),
          `${reason} ต้องไม่อยู่ในดรอปดาวน์ของ ${vertical}`,
        ).not.toContain(reason)
      }
      expect(isValidCancelReason('ONLINE_SALES', reason)).toBe(false)
      expect(isValidCancelReason('SERVICE_QUEUE', reason)).toBe(false)
      expect(isValidCancelReason('LODGING', reason)).toBe(false)
    }
  })

  it('[blocker] isDraftLifecycleCancelReason ครอบทั้ง 2 ค่าและไม่ครอบค่าอื่น', () => {
    expect(isDraftLifecycleCancelReason(DRAFT_DISCARD_REASON)).toBe(true)
    expect(isDraftLifecycleCancelReason(DRAFT_EXPIRED_REASON)).toBe(true)
    // 🛑 NULL คือเคสส่วนใหญ่ของฐาน (ออเดอร์เก่าที่ไม่เคยเก็บเหตุผล) — ต้องไม่ถูกกรองทิ้ง
    expect(isDraftLifecycleCancelReason(null)).toBe(false)
    expect(isDraftLifecycleCancelReason(undefined)).toBe(false)
    expect(isDraftLifecycleCancelReason('DUPLICATE_ORDER')).toBe(false)
    expect(isDraftLifecycleCancelReason('BUYER_REQUESTED')).toBe(false)
    expect(isDraftLifecycleCancelReason('PARCEL_RETURNED')).toBe(false)
  })

  it('[blocker] 2 ค่านี้แยกกัน ห้ามยุบเป็นค่าเดียว — คำอธิบายบนจอต้องต่างกัน', () => {
    // "คุณกดทิ้งเอง" กับ "มันค้างมา 7 วัน" ตอบคนละคำถามเวลาร้านถามว่าร่างหายไปไหน
    expect(DRAFT_DISCARD_REASON).not.toBe(DRAFT_EXPIRED_REASON)
    expect(SYSTEM_CANCEL_REASONS[DRAFT_DISCARD_REASON]).not.toBe(
      SYSTEM_CANCEL_REASONS[DRAFT_EXPIRED_REASON],
    )
  })

  it('DUPLICATE_ORDER อยู่ในดรอปดาวน์ของ ONLINE_SALES เท่านั้น', () => {
    expect(isValidCancelReason('ONLINE_SALES', 'DUPLICATE_ORDER')).toBe(true)
    expect(isValidCancelReason('SERVICE_QUEUE', 'DUPLICATE_ORDER')).toBe(false)
    expect(isValidCancelReason('LODGING', 'DUPLICATE_ORDER')).toBe(false)
  })

  it('cancelReasonLabel ต้องถอยไปดู SYSTEM_CANCEL_REASONS — ไม่ใช่คืน null', () => {
    expect(cancelReasonLabel('ONLINE_SALES', DRAFT_DISCARD_REASON)).toBe(
      SYSTEM_CANCEL_REASONS[DRAFT_DISCARD_REASON],
    )
    expect(cancelReasonLabel('LODGING', DRAFT_EXPIRED_REASON)).toBe(
      SYSTEM_CANCEL_REASONS[DRAFT_EXPIRED_REASON],
    )
    expect(cancelReasonLabel('ONLINE_SALES', 'ไม่รู้จัก')).toBeNull()
  })

  it('[blocker] migration ต้องเพิ่มทั้ง 3 ค่าเข้า CHECK ในคอมมิตเดียวกัน', () => {
    // ค่าที่มีในโค้ดแต่ไม่มีใน CHECK = 23514 บน prod ทันทีที่มีคนกดใช้จริง
    // (เกิดมาแล้ว 2026-08-12 — docs/conventions/migration-check-constraint-additive.md)
    const sql = readFileSync(
      'prisma/migrations/20260905120000_auto_create_order_from_chat/migration.sql',
      'utf8',
    )
    for (const v of ['DUPLICATE_ORDER', DRAFT_EXPIRED_REASON, DRAFT_DISCARD_REASON]) {
      expect(sql, `${v} ต้องอยู่ใน migration`).toContain(v)
    }
    // ต้องเป็นแบบ additive: อ่านนิยามเดิมจากฐานมาต่อ ไม่ hardcode รายชื่อทั้งชุด
    expect(sql).toContain('pg_get_constraintdef')
  })
})
