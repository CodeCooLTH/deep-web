// public-view.ts — แปลงข้อมูลตรวจสอบเป็น DTO ที่ "ปลอดหลักฐานปิดเชิงชนิด" (feature 00060 · T7)
//
// 🛑 ทำไมต้องเป็นชนิด ไม่ใช่แค่ "ไม่ render":
//    หน้าโปรไฟล์อยู่ใต้ client layout ⇒ **ทุกค่าที่ข้ามเส้น RSC ถูก serialize ลง HTML เสมอ
//    แม้ component จะไม่ render มัน** การ "ส่งไปแล้วเลือกไม่แสดง" คือการปล่อยบัตรประชาชน
//    และโฉนดไว้ให้เปิด view-source อ่านได้ (บทเรียน feedback_rsc_pii_neutralize_at_source)
//    ⇒ ชนิดของ DTO ในไฟล์นี้ต้องไม่มีที่ให้ใส่ฟิลด์ลับตั้งแต่แรก
//
// 🛑 และ "ไม่ผ่าน" ต้องถูกลบทิ้งตั้งแต่ที่นี่ ไม่ใช่ให้ component เลือกไม่แสดง
//    AC-INS-18-1/18-2 บังคับว่าห้ามมีป้ายและห้ามมีคำว่า "ไม่ผ่าน" บนหน้าสาธารณะ
//    ถ้าปล่อย FAIL ข้ามเส้นไป ใครเปิด view-source ก็รู้ว่าร้านไหนตรวจไม่ผ่านข้อไหน

import {
  INSPECTION_CHECKS, INSPECTION_STEP_LABEL_TH, checksForStep,
  type InspectionCheckKey, type InspectionStep,
} from './checks'
import {
  resolveResultStatus, latestResultPerCheck, resultScopeKey,
  DISPLAY_STATUS_LABEL_TH, type InspectionResultRow,
} from './result-status'

/**
 * สถานะที่ **ผู้ซื้อ** เห็นได้ — มี 4 ค่า ไม่ใช่ 5
 * `FAIL` ถูกยุบเข้า `NO_DATA` ตั้งแต่ที่นี่โดยเจตนา: ผู้ซื้อไม่ควรแยกออกว่า "ยังไม่ตรวจ"
 * กับ "ตรวจแล้วไม่ผ่าน" ต่างกันอย่างไร (การฉ้อโกงจริงไปทางฐาน /check ต่างหาก ไม่ใช่ทางนี้)
 */
export type PublicCheckStatus = 'PASS' | 'RECHECK' | 'NO_DATA' | 'NOT_APPLICABLE'

export type PublicCheckLine = {
  checkKey: InspectionCheckKey
  labelTh: string
  status: PublicCheckStatus
  statusLabelTh: string
  /** "ตรวจล่าสุดเมื่อไร" — มาจาก lastConfirmedAt เสมอ ไม่ใช่ checkedAt (TFR-022) */
  lastVerifiedAt: Date | null
}

export type PublicRoundEntry = {
  id: string
  step: InspectionStep
  stepLabelTh: string
  /** วันที่รอบนี้เสร็จ — รอบที่ยังไม่เสร็จไม่ถูกส่งออกมาเลย */
  completedAt: Date
  inspectorDisplayName: string
  /** เฉพาะหลักฐานที่ visibility = PUBLIC */
  photoFileIds: string[]
  lat: number | null
  lng: number | null
}

export type PublicRoomSection = { roomId: string; roomName: string; checks: PublicCheckLine[] }

export type PublicInspectionView = {
  /** true = ยังอยู่ในแผน · false = แถบเทา "ไม่ได้อยู่ในแผนการตรวจสอบต่อเนื่องแล้ว" */
  active: boolean
  step: InspectionStep
  stepLabelTh: string
  /** วันที่ข้อมูลล่าสุดของทั้งร้าน — ใช้บนแถบเทาตอนพ้นแผน (MAX ของ lastConfirmedAt) */
  dataAsOf: Date | null
  shopChecks: PublicCheckLine[]
  rooms: PublicRoomSection[]
  timeline: PublicRoundEntry[]
}

/** ยุบ FAIL เข้า NO_DATA — ทำที่นี่ที่เดียว ห้ามให้ component ตัดสิน */
export function toPublicStatus(s: ReturnType<typeof resolveResultStatus>): PublicCheckStatus {
  return s === 'FAIL' ? 'NO_DATA' : s
}

export type PublicViewInput = {
  plan: { step: InspectionStep; active: boolean } | null
  /** แถวผลตรวจทั้งหมดของร้าน (ทั้ง shop-scope และทุกห้อง) — ผู้เรียกดึงมาครั้งเดียว ไม่ N+1 */
  results: readonly InspectionResultRow[]
  rooms: readonly { id: string; name: string }[]
  /** รอบตรวจที่ **เสร็จแล้วเท่านั้น** — ผู้เรียกต้องกรอง completedAt != null มาก่อน */
  rounds: readonly {
    id: string
    step: InspectionStep
    completedAt: Date | null
    inspectorDisplayName: string
    evidence: readonly { visibility: 'PUBLIC' | 'PRIVATE'; fileId: string | null; lat: number | null; lng: number | null }[]
  }[]
  now: Date
}

/**
 * 🛑 วนจาก **ชุดคีย์ 18 ข้อ** ไม่ใช่จากแถวที่มีในฐานข้อมูล
 *    ถ้าวนจากแถว ข้อที่ยังไม่เคยตรวจจะหายไปจากหน้าจอเงียบ ๆ แทนที่จะขึ้น "ยังไม่มีข้อมูล"
 *    ซึ่งทำให้ผู้ซื้อเข้าใจว่าร้านถูกตรวจครบแล้วทั้งที่ตรวจไปแค่ครึ่งเดียว
 */
export function toPublicInspectionView(input: PublicViewInput): PublicInspectionView | null {
  const { plan, results, rooms, rounds, now } = input
  if (plan === null) return null // ไม่เคยสมัครแผนเลย = ไม่ render บล็อกทั้งก้อน

  const latest = latestResultPerCheck(results)
  const keys = checksForStep(plan.step)

  const line = (checkKey: InspectionCheckKey, roomId: string | null): PublicCheckLine => {
    const row = latest.get(resultScopeKey(checkKey, roomId)) ?? null
    const status = toPublicStatus(resolveResultStatus(row, now))
    return {
      checkKey,
      labelTh: INSPECTION_CHECKS[checkKey].labelTh,
      status,
      statusLabelTh: DISPLAY_STATUS_LABEL_TH[status],
      // 🛑 ส่งวันที่เฉพาะข้อที่ผ่านหรือรอตรวจซ้ำ — ข้อที่ยังไม่มีข้อมูลต้องไม่มีวันที่ติดไป
      //    ไม่งั้นข้อที่ "ไม่ผ่าน" (ถูกยุบเป็น NO_DATA แล้ว) จะยังแยกออกได้จากการมีวันที่
      lastVerifiedAt: status === 'PASS' || status === 'RECHECK' ? (row?.lastConfirmedAt ?? null) : null,
    }
  }

  const shopChecks = keys.filter((k) => INSPECTION_CHECKS[k].scope === 'SHOP').map((k) => line(k, null))
  const roomKeys = keys.filter((k) => INSPECTION_CHECKS[k].scope === 'ROOM')
  const roomSections: PublicRoomSection[] = rooms.map((r) => ({
    roomId: r.id,
    roomName: r.name,
    checks: roomKeys.map((k) => line(k, r.id)),
  }))

  const timeline: PublicRoundEntry[] = rounds
    .filter((r): r is typeof r & { completedAt: Date } => r.completedAt !== null)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .map((r) => {
      const pub = r.evidence.filter((e) => e.visibility === 'PUBLIC')
      const geo = pub.find((e) => e.lat !== null && e.lng !== null)
      return {
        id: r.id,
        step: r.step,
        stepLabelTh: INSPECTION_STEP_LABEL_TH[r.step],
        completedAt: r.completedAt,
        inspectorDisplayName: r.inspectorDisplayName,
        photoFileIds: pub.map((e) => e.fileId).filter((f): f is string => f !== null),
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
      }
    })

  // 🛑 "ข้อมูลล่าสุด" ต้องมาจาก lastConfirmedAt ไม่ใช่ checkedAt — ร้านที่ถูกตรวจต่อเนื่อง
  //    มาตลอดจะขึ้นวันที่ของการเปลี่ยนผลครั้งสุดท้าย ดูเหมือนถูกทิ้งร้างมานาน (TFR-015)
  const stamps = [...latest.values()].map((r) => r.lastConfirmedAt.getTime())
  const dataAsOf = stamps.length > 0 ? new Date(Math.max(...stamps)) : null

  return {
    active: plan.active,
    step: plan.step,
    stepLabelTh: INSPECTION_STEP_LABEL_TH[plan.step],
    dataAsOf,
    shopChecks,
    rooms: roomSections,
    timeline,
  }
}
