// serialize.ts — แปลง OwnerInspectionView (Date object จาก service) → JSON shape ข้าม RSC boundary
// (feature 00060 · T12)
//
// ทำไมต้องมีไฟล์นี้: `getInspectionForOwner()` คืน `Date | null` ตรง ๆ (ดู inspection-owner.service.ts)
// ส่ง object ที่มี Date ข้ามไปยัง client component ได้จริงใน React Flight แต่ทำให้ type ของ client
// component ผูกกับรูปร่างของ service โดยไม่ตั้งใจ — แปลงเป็น ISO string ที่นี่ที่เดียวแล้ว client
// component ทั้งหมดใช้ type เดียวกับ payload ของ POST subscribe/upgrade/cancel (types.ts) ได้เลย
// (มิเรอร์ pattern serializeRoom ที่แปลง Decimal → string ก่อนข้าม RSC boundary)

import type { OwnerInspectionView } from '@/services/inspection-owner.service'
import type {
  ApiLapsedReason,
  CheckResultJSON,
  OwnerInspectionViewJSON,
  PendingRoundJSON,
  RoomResultJSON,
  TimelineEntryJSON,
} from './types'

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString())

function toApiLapsedReason(value: string | null): ApiLapsedReason | null {
  return value === 'RENEWAL_FAILED' || value === 'OWNER_CANCELLED' ? value : null
}

function serializeResult(r: OwnerInspectionView['shopResults'][number]): CheckResultJSON {
  return {
    checkKey: r.checkKey,
    displayStatus: r.displayStatus,
    lastCheckedAt: iso(r.lastCheckedAt),
    outcomeSince: iso(r.outcomeSince),
    expiresAt: iso(r.expiresAt),
    inspectorDisplayName: r.inspectorDisplayName,
  }
}

export function serializeOwnerInspectionView(view: OwnerInspectionView): OwnerInspectionViewJSON {
  const shopResults = view.shopResults.map(serializeResult)

  const roomResults: RoomResultJSON[] = view.roomResults.map((r) => ({
    roomId: r.roomId,
    roomName: r.roomName,
    results: r.results.map(serializeResult),
  }))

  const timeline: TimelineEntryJSON[] = view.timeline.map((t) => ({
    roundId: t.roundId,
    step: t.step as TimelineEntryJSON['step'],
    method: t.method,
    roomId: t.roomId,
    roomName: t.roomName,
    completedAt: t.completedAt.toISOString(),
    inspectorDisplayName: t.inspectorDisplayName,
    changedResults: t.changedResults.map((c) => ({
      checkKey: c.checkKey,
      outcome: c.outcome,
      outcomeSince: c.outcomeSince.toISOString(),
    })),
    confirmedCheckKeys: t.confirmedCheckKeys,
  }))

  const pendingRounds: PendingRoundJSON[] = view.pendingRounds.map((p) => ({
    roundId: p.roundId,
    step: p.step as PendingRoundJSON['step'],
    method: p.method,
    roomId: p.roomId,
    roomName: p.roomName,
    assignedAt: p.assignedAt.toISOString(),
    inspectorDisplayName: p.inspectorDisplayName,
  }))

  return {
    plan:
      view.plan === null
        ? null
        : {
            step: view.plan.step,
            status: view.plan.status,
            termsAcceptedAt: iso(view.plan.termsAcceptedAt),
            // service ประกาศคอลัมน์เป็น string | null (Prisma enum ไม่ตายตัว) — allow-list ค่าที่
            // API สัญญาไว้จริง (§4.4) ค่าอื่นถือว่าไม่ทราบเหตุผล (ไม่ใช่ throw เพราะฝั่งอ่านนี้
            // เป็นแค่การแสดงผล ไม่ใช่ด่านสิทธิ์)
            lapsedReason: toApiLapsedReason(view.plan.lapsedReason),
            effectiveAt: iso(view.plan.effectiveAt),
            nextRenewalAt: iso(view.plan.nextRenewalAt) as string,
            graceUntil: iso(view.plan.graceUntil),
            graceDaysLeft: view.plan.graceDaysLeft,
          },
    canManage: view.canManage,
    shopResults,
    roomResults,
    timeline,
    pendingRounds,
    intake: {
      stepAvailable: view.intake.stepAvailable,
      nextOpenAt: iso(view.intake.nextOpenAt),
    },
  }
}
