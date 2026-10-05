/**
 * presenter — boolean/ป้ายที่ UI ของรายงานเข้ากลุ่ม LINE ตัดสิน (feature 00070 · SDS §3.1)
 *
 * ทำไมอยู่ใน lib ไม่ใช่ในคอมโพเนนต์: boolean ที่ตัดสินว่าปุ่มกดได้/แบนเนอร์ขึ้นไหมต้องมีที่ให้เทส mutation จับ
 * (convention `ui-boolean-needs-a-testable-home`) · copy/สี/ไอคอนยึด UX spec 2026-10-05
 *
 * 🛑 `paused` ("แพ็กเกจหยุด") คำนวณสดจากสถานะแพ็กเกจของเจ้าของ แล้วส่งเข้ามา — ห้ามอ่านจากธงในแถวกลุ่ม
 * (`stored-flag-vs-owner-truth`) · ไฟล์นี้ pure: ไม่แตะ prisma/headers
 */
import { hasInAppPurchase, isPaymentRestricted, type AppShell } from '@/lib/app-shell'
import type { LineReportGroupStatus } from '@/lib/line-report/types'

/** เพดานส่งทดสอบต่อวัน — ตรงกับ `TEST_QUOTA_EXCEEDED` ที่ send.service ("ครบ 5 ครั้งวันนี้แล้ว") */
export const TEST_SEND_DAILY_LIMIT = 5

export type PresenterGroup = {
  status: LineReportGroupStatus
  /** ทุกร้านในกลุ่มถูกล็อก/ลบ → ไม่มีร้านให้ส่ง */
  allShopsLocked?: boolean
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral'

export type GroupBadge = {
  key: 'BOUND' | 'PENDING' | 'BOT_REMOVED' | 'PACKAGE_PAUSED' | 'REMOVED'
  label: string
  /** ชื่อ tabler (ไม่มี prefix) */
  icon: string
  tone: Tone
}

/** แพ็กเกจหยุดชนะสถานะอื่นทุกแถว (UX spec E2: "ทุกแถว หยุดส่งเพราะแพ็กเกจ") ยกเว้นกลุ่มที่ยกเลิกไปแล้ว */
export function groupBadge(group: PresenterGroup, paused: boolean): GroupBadge {
  if (group.status === 'REMOVED') return { key: 'REMOVED', label: 'ยกเลิกการผูกแล้ว', icon: 'circle-x', tone: 'neutral' }
  if (paused) return { key: 'PACKAGE_PAUSED', label: 'หยุดส่งเพราะแพ็กเกจ', icon: 'lock', tone: 'warning' }
  switch (group.status) {
    case 'ACTIVE':
      return { key: 'BOUND', label: 'ผูกแล้ว', icon: 'circle-check', tone: 'success' }
    case 'INACTIVE':
      return { key: 'BOT_REMOVED', label: 'บอทถูกนำออก', icon: 'link-off', tone: 'danger' }
    default:
      return { key: 'PENDING', label: 'รอผูก', icon: 'clock', tone: 'warning' }
  }
}

/** ส่งทดสอบได้ต่อเมื่อผูกอยู่ + แพ็กเกจใช้งาน + มีร้านให้ส่ง + ยังไม่ครบโควตาวันนี้ */
export function canTest(group: PresenterGroup, paused: boolean, testsToday: number): boolean {
  return group.status === 'ACTIVE' && !paused && !group.allShopsLocked && testsToday < TEST_SEND_DAILY_LIMIT
}

export function testsLeft(testsToday: number): number {
  return Math.max(0, TEST_SEND_DAILY_LIMIT - testsToday)
}

/** แก้ตั้งค่าได้เมื่อแพ็กเกจใช้งาน (PATCH/PUT shops เป็นด่านระดับ L2) · กลุ่ม REMOVED = 404 */
export function canEdit(group: PresenterGroup, paused: boolean): boolean {
  return !paused && group.status !== 'REMOVED'
}

export type LockedCta = { label: string; href: string }

/**
 * ปุ่มบนหน้าล็อก/แบนเนอร์ ตามเปลือก (TFR-LGS-02)
 * เว็บ → /business · iOS → หน้าซื้อ IAP · Android → null (ไม่มี IAP: ห้ามมีปุ่ม/ราคา/ลิงก์)
 * 🛑 ห้ามใช้ `isPaidFeatureRestricted` ที่นี่ — ฟีเจอร์นี้เปิดทุกเปลือก (AC-02-5)
 */
export function lockedCta(shell: AppShell, reason: 'NEVER' | 'RENEWAL_FAILED' = 'NEVER'): LockedCta | null {
  if (!isPaymentRestricted(shell)) {
    return { label: reason === 'RENEWAL_FAILED' ? 'ต่ออายุแพ็กเกจ' : 'ดูแพ็กเกจธุรกิจ', href: '/business' }
  }
  return hasInAppPurchase(shell) ? { label: 'ดูแพ็กเกจธุรกิจ', href: '/business/subscribe' } : null
}

export type GroupBanner = {
  key: 'PACKAGE_PAUSED' | 'BOT_REMOVED' | 'ALL_SHOPS_LOCKED'
  tone: Tone
  message: string
  /** ผูกใหม่ = ปุ่มในหน้า (ไม่ใช่ลิงก์) · cta = ลิงก์ไปหน้าแพ็กเกจตามเปลือก */
  action: { kind: 'REBIND'; label: string } | { kind: 'LINK'; label: string; href: string } | null
}

const MSG = {
  PAUSED_WEB:
    'รายงานหยุดส่งไว้ก่อนเพราะแพ็กเกจธุรกิจไม่ได้ใช้งาน ค่าที่ตั้งไว้ยังอยู่ครบ ต่อแพ็กเกจแล้วรายงานจะกลับมาส่งเองในรอบถัดไป',
  PAUSED_APP: 'รายงานหยุดส่งไว้ก่อนเพราะบัญชีนี้ยังไม่ได้เปิดใช้แพ็กเกจธุรกิจ ค่าที่ตั้งไว้ยังอยู่ครบ',
  BOT_REMOVED:
    'บอทไม่อยู่ในกลุ่มนี้แล้ว รายงานจึงยังไม่ถูกส่ง เชิญ Deep รายงานยอดกลับเข้ากลุ่ม แล้วกด “ผูกใหม่” เพื่อรับโค้ดใหม่',
  ALL_LOCKED: 'ทุกร้านในกลุ่มนี้ถูกล็อก รายงานจึงยังไม่ถูกส่ง',
} as const

/**
 * แบนเนอร์บนสุดของหน้ากลุ่ม (เฉพาะมีปัญหา) — ลำดับ: แพ็กเกจหยุด > บอทถูกนำออก > ร้านถูกล็อกหมด
 * แพ็กเกจหยุดมาก่อนเพราะแก้บอท/ร้านไปก็ยังส่งไม่ได้ · ข้อความผันตามเปลือกเพราะแอปห้ามพูดถึงการจ่ายเงิน
 */
export function bannerFor(
  group: PresenterGroup,
  paused: boolean,
  shell: AppShell,
  reason: 'NEVER' | 'RENEWAL_FAILED' = 'RENEWAL_FAILED',
): GroupBanner | null {
  if (group.status === 'REMOVED') return null
  if (paused) {
    const cta = lockedCta(shell, reason)
    return {
      key: 'PACKAGE_PAUSED',
      tone: 'warning',
      message: isPaymentRestricted(shell) ? MSG.PAUSED_APP : MSG.PAUSED_WEB,
      action: cta ? { kind: 'LINK', ...cta } : null,
    }
  }
  if (group.status === 'INACTIVE') {
    return { key: 'BOT_REMOVED', tone: 'danger', message: MSG.BOT_REMOVED, action: { kind: 'REBIND', label: 'ผูกใหม่' } }
  }
  if (group.status === 'ACTIVE' && group.allShopsLocked) {
    return { key: 'ALL_SHOPS_LOCKED', tone: 'warning', message: MSG.ALL_LOCKED, action: null }
  }
  return null
}

/**
 * แปลง DTO ของกลุ่ม (GET /groups/{id}) เป็น PresenterGroup — adapter เดียว ห้ามคำนวณ allShopsLocked ในคอมโพเนนต์
 * กลุ่มไม่มีร้านเลย = ไม่ถือว่า "ล็อกหมด" (ข้อมูลผิดปกติคนละเรื่องกับแพ็กเกจล็อก)
 */
export function toPresenterGroup(dto: { status: LineReportGroupStatus; shops: readonly { state: string }[] }): PresenterGroup {
  return { status: dto.status, allShopsLocked: dto.shops.length > 0 && dto.shops.every((s) => s.state !== 'OK') }
}

/**
 * เหตุที่ปุ่ม "ส่งทดสอบ" กดไม่ได้ — null = กดได้ (ตรงกับ `canTest` เป๊ะ · เทสคุม invariant)
 * ลำดับ: แพ็กเกจหยุด > ยังไม่ผูก/บอทถูกนำออก > ร้านล็อกหมด > ครบโควตา (เลือกประโยคเดียว ไม่ซ้อนหลายเหตุ)
 */
export function testBlockedReason(group: PresenterGroup, paused: boolean, testsToday: number): string | null {
  if (paused) return 'ส่งทดสอบไม่ได้ขณะแพ็กเกจหยุดใช้งาน'
  if (group.status === 'INACTIVE') return 'ส่งทดสอบไม่ได้จนกว่ากลุ่มจะผูกใหม่'
  if (group.status !== 'ACTIVE') return 'ส่งทดสอบไม่ได้จนกว่ากลุ่มจะผูกสำเร็จ'
  if (group.allShopsLocked) return 'ทุกร้านในกลุ่มนี้ถูกล็อกหรือถูกลบ รายงานจึงยังไม่ถูกส่ง'
  if (testsToday >= TEST_SEND_DAILY_LIMIT) return `ครบ ${TEST_SEND_DAILY_LIMIT} ครั้งวันนี้แล้ว ส่งทดสอบได้อีกครั้งพรุ่งนี้`
  return null
}
