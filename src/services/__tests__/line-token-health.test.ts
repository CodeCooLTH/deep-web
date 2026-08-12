import { describe, it, expect } from 'vitest'
import { crossedAlertThreshold } from '@/services/line-token-health.service'
import { TOKEN_EXPIRY_ALERT_DAYS } from '@/lib/line/constants'

// (00025 ส่วนขยาย 2026-08-12 — AC-CH-07)
//
// เกณฑ์เตือน 14/7/3/1 วัน ต้องยิง **หนึ่งครั้งต่อการข้ามเกณฑ์** ไม่ใช่ทุกวัน —
// ถ้ายิงทุกวันผู้ขายจะปิดแจ้งเตือนทิ้งภายในสัปดาห์เดียว แล้วพลาดของจริงรอบหน้า

describe('crossedAlertThreshold', () => {
  it('[blocker] ข้ามเกณฑ์วันนี้ → คืนเกณฑ์นั้น · วันถัดไปที่ยังอยู่ช่วงเดิม → ไม่เตือนซ้ำ', () => {
    // mutation: ถอดเงื่อนไข `daysLeftBefore > t` ออก → ข้อที่สองแดง (จะเตือนทุกวัน)
    expect(crossedAlertThreshold(14, 15)).toBe(14)
    expect(crossedAlertThreshold(13, 14)).toBeNull()
    expect(crossedAlertThreshold(8, 9)).toBeNull()
  })

  it('[blocker] ยังไม่เคยรู้ค่าเดิม (null) และวันนี้อยู่ในเกณฑ์ → เตือน', () => {
    // เกิดจริงตอนช่องทางเพิ่งถูกอ่านอายุครั้งแรก — ถ้าไม่เตือนจะเงียบไปจนถึงเกณฑ์ถัดไป
    //
    // คืน 14 ไม่ใช่ 7: ฟังก์ชันคืน **เกณฑ์ใหญ่สุดที่ข้าม** เสมอ (สม่ำเสมอกับเคส cron ขาดหลายวัน
    // ด้านล่าง) — ค่าที่คืนใช้ตัดสินแค่ "ข้ามอะไรใหม่ไหม" ส่วนข้อความที่ผู้ขายเห็นใช้ `daysLeft`
    // จริงเสมอ จึงยังอ่านว่า "อีก 5 วัน" ไม่ใช่ "อีก 14 วัน"
    expect(crossedAlertThreshold(5, null)).toBe(14)
  })

  it('[blocker] ยังไม่เคยรู้ค่าเดิม แต่ยังไม่ถึงเกณฑ์ไหนเลย → เงียบ', () => {
    expect(crossedAlertThreshold(30, null)).toBeNull()
  })

  it('[blocker] ร้านวาง token ใหม่กลางคัน (เหลือ 3 → 30) แล้วลดลงมาอีกครั้ง ต้องเตือนใหม่ได้', () => {
    // 🛑 นี่คือเหตุผลที่ไม่เก็บธง "เคยเตือนแล้ว" เป็นคอลัมน์ — ธงจะค้างแล้วรอบใหม่จะเงียบตลอดไป
    expect(crossedAlertThreshold(14, 30)).toBe(14)
  })

  it('[blocker] ตกหลายเกณฑ์รวดเดียว (cron ไม่ได้รันไปหลายวัน) → คืนเกณฑ์ที่ใหญ่ที่สุดที่ข้าม', () => {
    // เตือนครั้งเดียวด้วยจำนวนวันจริง ดีกว่ายิงรัว 4 ใบพร้อมกัน
    expect(crossedAlertThreshold(1, 20)).toBe(TOKEN_EXPIRY_ALERT_DAYS[0])
  })

  it('[blocker] หมดอายุไปแล้ว (0 วัน) ยังต้องเตือน ไม่ใช่เงียบเพราะสายไปแล้ว', () => {
    expect(crossedAlertThreshold(0, 2)).toBe(1)
  })
})
