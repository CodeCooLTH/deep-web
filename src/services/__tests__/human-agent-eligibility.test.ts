/**
 * `canUseHumanAgent` — SSOT ของ "PSID/IGSID นี้ใช้สิทธิ์ Human Agent (ตอบเกิน 24 ชม.) ได้ไหม"
 * (feature 00043, SDS §8.1)
 *
 * 🛑 fail-closed คือหัวใจของฟังก์ชันนี้ (BR-HA-07): env ที่ไม่ได้ตั้งค่าเลย (สถานะปัจจุบันบน prod)
 * ต้องแปลว่า "ปิด" เสมอ — พลาดแล้วเผลอเปิด (fail-open) ความเสี่ยงคือแอปทั้งระบบถูก Meta ระงับ
 *
 * ทำไมต้อง save/restore process.env รอบทุกเคส: ฟังก์ชันนี้อ่าน `process.env` ตรง ๆ (ไม่รับ config
 * ผ่าน parameter) — ถ้าเคสหนึ่งตั้งค่าแล้วไม่คืน ค่านั้นจะรั่วไปเคสถัดไปในไฟล์เดียวกัน (vitest รัน
 * เทสในไฟล์เดียวกันแบบ sequential แต่ env เป็น global mutable state ข้ามเคสได้ตามปกติ)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { canUseHumanAgent } from '@/services/channel-chat.service'

const ENV_ENABLED = 'META_HUMAN_AGENT_ENABLED'
const ENV_TEST_PSIDS = 'META_HUMAN_AGENT_TEST_PSIDS'

describe('canUseHumanAgent', () => {
  let savedEnabled: string | undefined
  let savedTestPsids: string | undefined

  beforeEach(() => {
    savedEnabled = process.env[ENV_ENABLED]
    savedTestPsids = process.env[ENV_TEST_PSIDS]
    delete process.env[ENV_ENABLED]
    delete process.env[ENV_TEST_PSIDS]
  })

  afterEach(() => {
    // คืนค่าเดิมเป๊ะ (ไม่ใช่แค่ delete) — กันเคสอื่นในรันเดียวกัน (ไฟล์อื่น) ที่อาจพึ่ง env ตัวนี้
    if (savedEnabled === undefined) delete process.env[ENV_ENABLED]
    else process.env[ENV_ENABLED] = savedEnabled
    if (savedTestPsids === undefined) delete process.env[ENV_TEST_PSIDS]
    else process.env[ENV_TEST_PSIDS] = savedTestPsids
  })

  it('#1 สวิตช์ใหญ่เปิด, ไม่มี PSID (null) → true', () => {
    process.env[ENV_ENABLED] = 'true'
    expect(canUseHumanAgent(null)).toBe(true)
  })

  it('#2 สวิตช์ใหญ่เปิด, PSID ไม่อยู่ใน allow-list → true (สวิตช์ใหญ่ชนะ ไม่ต้องพึ่ง allow-list)', () => {
    process.env[ENV_ENABLED] = 'true'
    process.env[ENV_TEST_PSIDS] = 'psidA,psidB'
    expect(canUseHumanAgent('psidZ')).toBe(true)
  })

  it('[blocker] #3 env ทั้งคู่ไม่ได้ตั้งค่า (unset) → false (fail-closed)', () => {
    expect(canUseHumanAgent('psidA')).toBe(false)
    expect(canUseHumanAgent(null)).toBe(false)
  })

  it('#4 สวิตช์ปิด, allow-list มี psidA,psidB, PSID=psidA → true', () => {
    process.env[ENV_TEST_PSIDS] = 'psidA,psidB'
    expect(canUseHumanAgent('psidA')).toBe(true)
  })

  it('#5 สวิตช์ปิด, allow-list มีค่า, PSID=psidC (ไม่อยู่ในลิสต์) → false', () => {
    process.env[ENV_TEST_PSIDS] = 'psidA,psidB'
    expect(canUseHumanAgent('psidC')).toBe(false)
  })

  it('#6 allow-list รูปแบบเลอะ ( \' psidA ,, psidB ,\' ) → parse ได้ถูกต้อง ไม่ throw', () => {
    process.env[ENV_TEST_PSIDS] = ' psidA ,, psidB ,'
    expect(() => canUseHumanAgent('psidA')).not.toThrow()
    expect(canUseHumanAgent('psidA')).toBe(true)
    expect(canUseHumanAgent('psidB')).toBe(true)
    // ช่องว่างล้วน/คอมมาซ้อนต้องไม่ถูกนับเป็น PSID ที่ match ได้
    expect(canUseHumanAgent('')).toBe(false)
  })

  it('#7 PSID เป็น undefined/"" , สวิตช์ปิด → false', () => {
    process.env[ENV_TEST_PSIDS] = 'psidA'
    expect(canUseHumanAgent(undefined)).toBe(false)
    expect(canUseHumanAgent('')).toBe(false)
  })
})
