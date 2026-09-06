/**
 * inspection-view-vm — แปลง `PublicInspectionView` (จาก `inspection-public.service.ts`) ให้เป็น
 * รูปที่ข้าม RSC boundary ได้ปลอดภัย + ฟังก์ชันช่วยจัดกลุ่ม/คัดเลือกสำหรับหน้าจอ (feature 00060 · T14)
 *
 * ไม่มี `'use client'` โดยตั้งใจ — ไฟล์นี้ต้อง import ได้ทั้งจาก Server Component (`page.tsx`
 * เรียก `toInspectionViewVM` ตอน render ฝั่งเซิร์ฟเวอร์) และจาก Client Component (`InspectionBlock`/
 * `ShopExtraPages` เรียกฟังก์ชันจัดกลุ่ม/คัดเลือกตอน render ฝั่งไคลเอ็นต์) เป็น pure module ล้วน
 *
 * 🛑 `Date` ห้ามข้าม RSC boundary ดิบ — แปลงเป็น ISO string ที่นี่ที่เดียว (ตามแบบ `createdAtIso`
 * ที่ไฟล์อื่นในโฟลเดอร์นี้ทำอยู่แล้ว) ผู้อ่านปลายทางใช้ `formatDateTH`/`formatDateTimeTH` ซึ่งรับ
 * ISO string ได้อยู่แล้ว
 *
 * 🛑 ไฟล์นี้ **อ่าน** ชนิด/ค่าคงที่จาก `src/lib/inspection/*` เท่านั้น (allow-list ของคีย์/ขั้น/
 * ขอบเขต/วิธีตรวจ) — ไม่คำนวณสถานะเอง (`resolveResultStatus` ยังอยู่ที่ server เท่านั้น) และไม่แก้
 * ไฟล์ใน `src/lib/inspection/**` เลย (นอกขอบเขตของ T14)
 */
import { toFileUrl } from '@/lib/file-url'
import { INSPECTION_CHECKS, INSPECTION_STEP_LABEL_TH, type InspectionCheckKey, type InspectionStep } from '@/lib/inspection/checks'
import type { PublicCheckStatus, PublicInspectionView } from '@/lib/inspection/public-view'

export type InspectionCheckLineVM = {
  checkKey: InspectionCheckKey
  labelTh: string
  status: PublicCheckStatus
  statusLabelTh: string
  /** ISO string — null เมื่อยังไม่มีข้อมูล/ไม่เกี่ยวข้อง (ดู public-view.ts) */
  lastVerifiedAt: string | null
}

export type InspectionRoomSectionVM = {
  roomId: string
  roomName: string
  checks: InspectionCheckLineVM[]
}

export type InspectionRoundVM = {
  id: string
  step: InspectionStep
  stepLabelTh: string
  /** ISO string เสมอ — รอบที่ยังไม่เสร็จไม่ถูกส่งมาตั้งแต่ service (public-view.ts) */
  completedAt: string
  inspectorDisplayName: string
  /** URL ที่ resolve แล้ว (toFileUrl) — ไม่ใช่ fileId ดิบ */
  photoUrls: string[]
}

export type InspectionViewVM = {
  active: boolean
  step: InspectionStep
  stepLabelTh: string
  /** ISO string — null เมื่อยังไม่มีผลตรวจข้อไหนเลย */
  dataAsOf: string | null
  shopChecks: InspectionCheckLineVM[]
  rooms: InspectionRoomSectionVM[]
  timeline: InspectionRoundVM[]
}

/** null เข้า null ออก — ร้านที่ไม่เคยสมัครแผนเลย/ไม่ใช่ LODGING ไม่มีอะไรให้แปลง */
export function toInspectionViewVM(view: PublicInspectionView | null): InspectionViewVM | null {
  if (view === null) return null

  const line = (l: {
    checkKey: InspectionCheckKey
    labelTh: string
    status: PublicCheckStatus
    statusLabelTh: string
    lastVerifiedAt: Date | null
  }): InspectionCheckLineVM => ({
    checkKey: l.checkKey,
    labelTh: l.labelTh,
    status: l.status,
    statusLabelTh: l.statusLabelTh,
    lastVerifiedAt: l.lastVerifiedAt ? l.lastVerifiedAt.toISOString() : null,
  })

  return {
    active: view.active,
    step: view.step,
    stepLabelTh: view.stepLabelTh,
    dataAsOf: view.dataAsOf ? view.dataAsOf.toISOString() : null,
    shopChecks: view.shopChecks.map(line),
    rooms: view.rooms.map((r) => ({ roomId: r.roomId, roomName: r.roomName, checks: r.checks.map(line) })),
    timeline: view.timeline.map((t) => ({
      id: t.id,
      step: t.step,
      stepLabelTh: t.stepLabelTh,
      completedAt: t.completedAt.toISOString(),
      inspectorDisplayName: t.inspectorDisplayName,
      // 🛑 fileId → URL ที่นี่ที่เดียว (ไม่ใช่ที่ component) — ตามแบบรูปสินค้า/วิดีโอ/โลโก้ร้าน
      // ทั้งหมดในหน้านี้ที่ resolve เป็น URL ตอน server ก่อนข้าม RSC boundary
      photoUrls: t.photoFileIds.map((f) => toFileUrl(f)).filter((u): u is string => u !== null),
    })),
  }
}

/** จำนวนข้อตรวจทั้งหมดที่ร้านนี้ต้องผ่าน ณ ขั้นปัจจุบัน — ใช้ในข้อความ CTA "({N} ข้อ)" */
export function totalCheckCount(vm: InspectionViewVM): number {
  // 🛑 นับ **ทุกหลัง** ไม่ใช่หลังแรกหลังเดียว — CTA เขียนว่า "ผลครบทุกข้อ (N ข้อ)" แล้วพาไปหน้า
  //    ที่แสดงข้อของทุกหลังจริง ⇒ ร้านที่มีที่พัก 3 หลังเคยได้ตัวเลขต่ำกว่าความจริงราวหนึ่งในสาม
  //    โดยไม่มีอะไรบอก · ตัวเลขที่ต่ำกว่าจริงบนป้ายความน่าเชื่อถือ = การรายงานต่ำกว่าที่ตรวจไปแล้ว
  return vm.shopChecks.length + vm.rooms.reduce((sum, r) => sum + r.checks.length, 0)
}

/**
 * บรรทัดหลักฐาน "เด่น" สูงสุด `max` ข้อ สำหรับพรีวิวบนการ์ดย่อ
 *
 * 🛑 เกณฑ์ที่เลือก (การตัดสินใจของ UI ที่สเปกไม่ได้ระบุอัลกอริทึมตายตัว — ดูรายงานถึง Controller):
 *   - เฉพาะข้อที่ `status === 'PASS'` (ข้ออื่นไม่ใช่ "หลักฐาน" ที่ควรโชว์แบบย่อ)
 *   - ตัด `method === 'AUTO'` ออก (ขั้น 1 ระบบตรวจเองทุกวัน ไม่ใช่สิ่งที่ผู้ซื้ออยากเห็นก่อน
 *     เทียบกับข้อที่คนตรวจจริง/วิดีโอคอล/เอกสาร ซึ่งเป็นหลักฐานที่ "เด่น" กว่า)
 *   - เรียงร้าน (SHOP scope) ก่อนที่พักหลังแรก (ROOM scope ของ `rooms[0]`) — พรีวิวแสดงแค่หลังเดียว
 *     เพราะเป็นการ์ดย่อ ไม่ใช่ full sheet ที่มี room switcher
 */
export function pickNotableLines(
  vm: InspectionViewVM,
  max = 3,
): { line: InspectionCheckLineVM; roomName: string | null }[] {
  const room = vm.rooms[0] ?? null
  const candidates: { line: InspectionCheckLineVM; roomName: string | null }[] = [
    ...vm.shopChecks.map((l) => ({ line: l, roomName: null })),
    ...(room ? room.checks.map((l) => ({ line: l, roomName: room.roomName })) : []),
  ]
  return candidates
    .filter((c) => c.line.status === 'PASS' && INSPECTION_CHECKS[c.line.checkKey].method !== 'AUTO')
    .slice(0, max)
}

export type InspectionCheckGroupVM = { step: InspectionStep; stepLabelTh: string; lines: { line: InspectionCheckLineVM; roomName: string | null }[] }

/**
 * จัดกลุ่มข้อตรวจตามขั้น สำหรับ full sheet — รวมข้อของร้าน (SHOP) กับข้อของที่พักหลังที่เลือก
 * (ROOM) เข้าด้วยกันในกลุ่มขั้นเดียวกัน แต่ละบรรทัด ROOM จะพ่วง `roomName` มาด้วยเสมอ (แม้มีหลังเดียว
 * ก็ยังบอก "· หลังไหน" ตาม UX spec §Section breakdown "ผูกรายหลัง")
 *
 * ตัดกลุ่มที่ไม่มีบรรทัดเลยทิ้ง (เช่นขั้นที่ยังไม่มีทั้งข้อร้านและข้อที่พัก)
 */
export function groupChecksForFullSheet(vm: InspectionViewVM, selectedRoomIdx: number): InspectionCheckGroupVM[] {
  const room = vm.rooms[selectedRoomIdx] ?? null
  const steps: InspectionStep[] = ([1, 2, 3, 4] as const).filter((s) => s <= vm.step)

  return steps
    .map((step) => {
      const shopLines = vm.shopChecks
        .filter((l) => INSPECTION_CHECKS[l.checkKey].step === step)
        .map((l) => ({ line: l, roomName: null as string | null }))
      const roomLines = room
        ? room.checks
            .filter((l) => INSPECTION_CHECKS[l.checkKey].step === step)
            .map((l) => ({ line: l, roomName: room.roomName as string | null }))
        : []
      return { step, stepLabelTh: INSPECTION_STEP_LABEL_TH[step], lines: [...shopLines, ...roomLines] }
    })
    .filter((g) => g.lines.length > 0)
}
