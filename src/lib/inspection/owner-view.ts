// owner-view.ts — ประกอบภาพ "แผนการตรวจสอบของร้านฉัน" ให้ฝั่งผู้ขาย (feature 00060 · T9)
//
// 🛑 **"ผลปัจจุบันต่อข้อ" กับ "ไทม์ไลน์รอบย้อนหลัง" เป็นคนละก้อน ห้ามยุบรวม** (API §4.1)
//    สองก้อนนี้ตอบคนละคำถาม: ผลปัจจุบันตอบว่า *วันนี้ข้อนี้เป็นอย่างไร* · ไทม์ไลน์ตอบว่า
//    *ร้านนี้ถูกตรวจมากี่ครั้ง แต่ละครั้งได้อะไร* — และเพราะแถวใหม่เกิดเฉพาะตอนผลเปลี่ยน
//    จำนวนแถวจึงไม่เท่ากับจำนวนรอบ ⇒ ก้อนเดียวบังคับให้หน้าจอเดาเองว่าแถวไหนคือของปัจจุบัน
//    ซึ่งคือการย้ายสูตร derive ออกจาก server ไปอยู่ที่ client (Hard Rule 16)

import {
  INSPECTION_CHECKS,
  INSPECTION_CHECK_KEYS,
  type InspectionCheckKey,
  type InspectionStep,
} from './checks'
import { SYSTEM_INSPECTOR_NAME } from './round-planning'
import {
  latestResultPerCheck,
  resolveResultStatus,
  resultScopeKey,
  type InspectionDisplayStatus,
  type InspectionOutcome,
  type InspectionResultRow,
} from './result-status'

/**
 * ชื่อสถานะที่ใช้ใน payload ของ API
 * 🛑 `RECHECK` ภายใน = `RECHECK_DUE` ใน API (สัญญาที่ประกาศไว้ใน API.md §3.2 ค) — แปลที่นี่
 *    ที่เดียว ห้ามให้แต่ละ route แปลเอง
 */
export type ApiDisplayStatus = 'PASS' | 'FAIL' | 'RECHECK_DUE' | 'NO_DATA' | 'NOT_APPLICABLE'

const DISPLAY_STATUS_TO_API: Record<InspectionDisplayStatus, ApiDisplayStatus> = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  RECHECK: 'RECHECK_DUE',
  NO_DATA: 'NO_DATA',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
}

export function toApiDisplayStatus(status: InspectionDisplayStatus): ApiDisplayStatus {
  return DISPLAY_STATUS_TO_API[status]
}

export type OwnerResultRow = InspectionResultRow & { roundId: string | null }

export type OwnerRoundRow = {
  id: string
  roomId: string | null
  step: number
  method: string
  assignedAt: Date
  completedAt: Date | null
  inspectorDisplayName: string
}

export type OwnerRoom = { id: string; name: string }

export type CheckResultView = {
  checkKey: InspectionCheckKey
  displayStatus: ApiDisplayStatus
  /** "ตรวจล่าสุด" — มาจาก `lastConfirmedAt` 🛑 ห้ามสลับกับ outcomeSince */
  lastCheckedAt: Date | null
  /** "ผลเป็นแบบนี้ตั้งแต่" — มาจาก `checkedAt` */
  outcomeSince: Date | null
  expiresAt: Date | null
  inspectorDisplayName: string | null
}

export type TimelineEntry = {
  roundId: string
  step: number
  method: string
  roomId: string | null
  roomName: string | null
  completedAt: Date
  inspectorDisplayName: string
  changedResults: { checkKey: InspectionCheckKey; outcome: InspectionOutcome; outcomeSince: Date }[]
  confirmedCheckKeys: InspectionCheckKey[]
}

export type PendingRoundView = {
  roundId: string
  step: number
  method: string
  roomId: string | null
  roomName: string | null
  assignedAt: Date
  inspectorDisplayName: string
}

export type OwnerInspectionSections = {
  shopResults: CheckResultView[]
  roomResults: { roomId: string; roomName: string; results: CheckResultView[] }[]
  timeline: TimelineEntry[]
  pendingRounds: PendingRoundView[]
}

const SHOP_CHECK_KEYS = INSPECTION_CHECK_KEYS.filter((k) => INSPECTION_CHECKS[k].scope === 'SHOP')
const ROOM_CHECK_KEYS = INSPECTION_CHECK_KEYS.filter((k) => INSPECTION_CHECKS[k].scope === 'ROOM')

/**
 * ข้อตรวจที่รอบหนึ่งครอบ — ต้องตรงกับ `checkKeysOfRound()` ฝั่ง service เป๊ะ
 * (คนละไฟล์กันเพราะฝั่งนั้นแตะ Prisma ไม่ได้ในชั้นนี้ — สูตรเดียวกันเสมอ)
 */
function checkKeysOfRound(step: number, method: string): InspectionCheckKey[] {
  return INSPECTION_CHECK_KEYS.filter(
    (k) => INSPECTION_CHECKS[k].step === step && INSPECTION_CHECKS[k].method === method,
  )
}

function viewOf(
  checkKey: InspectionCheckKey,
  row: OwnerResultRow | null,
  roundNameById: ReadonlyMap<string, string>,
  now: Date,
): CheckResultView {
  if (row === null) {
    return {
      checkKey,
      displayStatus: 'NO_DATA',
      lastCheckedAt: null,
      outcomeSince: null,
      expiresAt: null,
      inspectorDisplayName: null,
    }
  }
  // ผลที่ไม่มีรอบผูกอยู่ = ระบบตรวจเอง (ข้อ AUTO) — ไม่ใช่ข้อมูลหาย
  const name =
    row.roundId === null
      ? INSPECTION_CHECKS[checkKey].method === 'AUTO'
        ? SYSTEM_INSPECTOR_NAME
        : null
      : (roundNameById.get(row.roundId) ?? null)

  return {
    checkKey,
    displayStatus: toApiDisplayStatus(resolveResultStatus(row, now)),
    lastCheckedAt: row.lastConfirmedAt,
    outcomeSince: row.checkedAt,
    expiresAt: row.expiresAt,
    inspectorDisplayName: name,
  }
}

export function buildOwnerInspectionSections(input: {
  rooms: readonly OwnerRoom[]
  results: readonly OwnerResultRow[]
  rounds: readonly OwnerRoundRow[]
  now: Date
}): OwnerInspectionSections {
  const { rooms, results, rounds, now } = input

  const latest = latestResultPerCheck(results)
  const latestOwner = (checkKey: InspectionCheckKey, roomId: string | null): OwnerResultRow | null =>
    (latest.get(resultScopeKey(checkKey, roomId)) as OwnerResultRow | undefined) ?? null

  const roundNameById = new Map(rounds.map((r) => [r.id, r.inspectorDisplayName]))
  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]))

  const shopResults = SHOP_CHECK_KEYS.map((k) => viewOf(k, latestOwner(k, null), roundNameById, now))

  const roomResults = rooms.map((room) => ({
    roomId: room.id,
    roomName: room.name,
    results: ROOM_CHECK_KEYS.map((k) => viewOf(k, latestOwner(k, room.id), roundNameById, now)),
  }))

  // แถวที่ "รอบนี้ทำให้ผลเปลี่ยน" = แถวที่ผูก roundId ของรอบนั้น
  const changedByRound = new Map<string, TimelineEntry['changedResults']>()
  for (const row of results) {
    if (row.roundId === null) continue
    const list = changedByRound.get(row.roundId) ?? []
    list.push({ checkKey: row.checkKey, outcome: row.outcome, outcomeSince: row.checkedAt })
    changedByRound.set(row.roundId, list)
  }

  const timeline: TimelineEntry[] = rounds
    .filter((r): r is OwnerRoundRow & { completedAt: Date } => r.completedAt !== null)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .map((r) => {
      const changedResults = changedByRound.get(r.id) ?? []
      const changedKeys = new Set(changedResults.map((c) => c.checkKey))
      return {
        roundId: r.id,
        step: r.step,
        method: r.method,
        roomId: r.roomId,
        roomName: r.roomId === null ? null : (roomNameById.get(r.roomId) ?? null),
        completedAt: r.completedAt,
        inspectorDisplayName: r.inspectorDisplayName,
        changedResults,
        // 🛑 รอบที่ตรวจแล้วผลเหมือนเดิม **ไม่มีแถวเป็นของตัวเองเลยสักแถว** ⇒ ถ้าไทม์ไลน์แสดง
        //    เฉพาะแถวที่ผูกรอบ บรรทัดนั้นจะว่าง ซึ่งอ่านได้ว่า "ผู้ตรวจมาแล้วไม่ได้ทำอะไร"
        //    ทั้งที่ความจริงคือ "มาแล้วยืนยันว่าทุกอย่างยังเหมือนเดิม"
        confirmedCheckKeys: checkKeysOfRound(r.step, r.method).filter((k) => !changedKeys.has(k)),
      }
    })

  const pendingRounds: PendingRoundView[] = rounds
    .filter((r) => r.completedAt === null)
    .sort((a, b) => a.assignedAt.getTime() - b.assignedAt.getTime())
    .map((r) => ({
      roundId: r.id,
      step: r.step,
      method: r.method,
      roomId: r.roomId,
      roomName: r.roomId === null ? null : (roomNameById.get(r.roomId) ?? null),
      assignedAt: r.assignedAt,
      inspectorDisplayName: r.inspectorDisplayName,
    }))

  return { shopResults, roomResults, timeline, pendingRounds }
}

/** ขั้นที่ยังเปิดรับสมัครในรอบเดือนนี้ — ไม่มีแถวโควตา = ปิดรับ ไม่ใช่ไม่จำกัด */
export function availableIntakeSteps(
  quotas: readonly { step: number; capacity: number; usedCount: number }[],
): InspectionStep[] {
  return quotas
    .filter((q) => q.usedCount < q.capacity)
    .map((q) => q.step)
    .filter((s): s is InspectionStep => s === 1 || s === 2 || s === 3 || s === 4)
    .sort((a, b) => a - b)
}
