'use client'

/**
 * BuilderToolbar — แถบบนของตัวจัดหน้าร้าน (feature 00035, Task 7)
 *
 * Base: src/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader.tsx (ใช้ prop `toolbarExtra`
 *   ที่เพิ่มไว้แล้วสำหรับฟีเจอร์นี้โดยเฉพาะ — SDS TD-008) — เนื้อหาใน toolbarExtra (input-group ลิงก์
 *   +คัดลอก / สวิตช์เผยแพร่ / ปุ่มดูหน้าร้านจริง) คัดลอก markup จาก:
 *   Base: docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html
 *     หัวข้อ "1 · จอหลัก (Desktop 1440)" แถว toolbar (บรรทัด input-group/switch/ปุ่ม "ดูหน้าร้านจริง")
 *   หมายเหตุ: mockup วาง input-group ชิดซ้ายถัดจาก title เพราะเป็น bespoke header — แต่
 *   FullscreenPageHeader ให้ title เป็น flex-1 เสมอ (D-6/TD-008 บังคับใช้ component เดิมไม่แก้ layout
 *   ของมัน) ผลคือ input-group/switch/ปุ่ม จะไปรวมกันชิดขวาก่อนปุ่ม Save แทน — ยอมรับ trade-off นี้
 *   ตาม TD-008 (ใช้ shared header ชนะการเลียนตำแหน่ง pixel-exact ของ mockup)
 *
 * สวิตช์เผยแพร่ — ตรรกะ optimistic/confirm-before-off/revert-on-fail ยกมาจาก:
 *   Base: src/app/(paces)/seller/(dashboard)/public-profile/components/PublishToggleClient.tsx
 *   Adapt: ตัดการ์ด/label บรรยายยาวออก เหลือ label สั้น + switch เดียว ให้พอดีกับแถบ toolbar แนวนอน
 *   (endpoint เดียวกันทั้งสองจุด — PATCH .../publish, API.md §4.4 — sync สถานะกันเองเพราะคนละ state
 *   ไม่ได้ผูก React state ร่วมกัน แต่ทั้งคู่อ่าน DB ค่าล่าสุดตอน mount เสมอ)
 *
 * ปุ่มคัดลอก — Base: src/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton.tsx
 *   (iconOnly variant — ตรงกับปุ่มไอคอนสี่เหลี่ยมใน mockup)
 *
 * รื้อ canvas (2026-08-07 รอบสอง): เพิ่ม isDirty/onDiscard — render DraftDirtyBar ผ่าน
 * `belowContent` ของ FullscreenPageHeader แทนที่จะเป็น sibling แยกใน BuilderClient.tsx (เดิมทับกัน
 * 32px บน prod — ดู comment หัวไฟล์ DraftDirtyBar.tsx) และผูก disableSave={saving || !isDirty}
 * (เดิมกดบันทึกได้ตลอดแม้ไม่มีอะไรเปลี่ยน)
 */
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'
import FullscreenPageHeader from '@/app/(paces)/seller/(fullscreen)/_shared/FullscreenPageHeader'

import DraftDirtyBar from './DraftDirtyBar'

export type BuilderToolbarProps = {
  /** "deepthailand.app/u/" หรือ "deepthailand.app/b/" — โชว์เป็น prefix อ่านอย่างเดียวใน input-group */
  handlePrefix: string
  /** ค่าท้าย path (username หรือ slug) — โชว์ในช่อง input readonly */
  handle: string
  /** URL เต็มของหน้าร้านจริง — ใช้ทั้งคัดลอกและปุ่ม "ดูหน้าร้านจริง" */
  publicUrl: string
  initialIsPublished: boolean
  saveFormId: string
  saving: boolean
  /** ยังไม่บันทึก — คุมทั้งปุ่ม Save (disable เมื่อไม่ dirty) และ DraftDirtyBar (แสดงเมื่อ dirty) */
  isDirty: boolean
  onDiscard: () => void
}

export default function BuilderToolbar({
  handlePrefix,
  handle,
  publicUrl,
  initialIsPublished,
  saveFormId,
  saving,
  isDirty,
  onDiscard,
}: BuilderToolbarProps) {
  const [published, setPublished] = useState(initialIsPublished)
  const [publishPending, setPublishPending] = useState(false)

  const patchPublish = async (next: boolean) => {
    setPublishPending(true)
    try {
      const res = await fetch('/api/shops/current/page-builder/publish', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: next }),
      })
      if (!res.ok) {
        setPublished(!next)
        pacesToast.error('ไม่สามารถเปลี่ยนสถานะการเผยแพร่ได้')
        return
      }
      pacesToast.success(next ? 'เผยแพร่หน้าร้านแล้ว' : 'ปิดการแสดงผลหน้าร้านแล้ว')
    } catch {
      setPublished(!next)
      pacesToast.error('ไม่สามารถเปลี่ยนสถานะการเผยแพร่ได้')
    } finally {
      setPublishPending(false)
    }
  }

  const handlePublishChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setPublished(next) // optimistic

    if (!next) {
      const confirmed = await pacesConfirm.warning(
        'ปิดการแสดงผลหน้าร้าน?',
        'ผู้เยี่ยมชมทั่วไปจะมองไม่เห็นหน้าร้านของคุณ จนกว่าคุณจะเปิดอีกครั้ง',
        { confirmButtonText: 'ปิดการแสดงผล' },
      )
      if (!confirmed) {
        setPublished(true)
        return
      }
    }
    await patchPublish(next)
  }

  return (
    <FullscreenPageHeader
      title="ตัวจัดหน้าร้าน"
      backHref="/public-profile"
      isDirty={isDirty}
      saveLabel="บันทึก"
      saveFormId={saveFormId}
      disableSave={saving || !isDirty}
      toolbarLeading={
        <div className="input-group max-w-sm">
          <span className="input-group-text text-xs">{handlePrefix}</span>
          <input className="form-input text-sm" value={handle} readOnly aria-label="ลิงก์หน้าร้าน" />
          <CopyLinkButton value={publicUrl} iconOnly label="คัดลอกลิงก์หน้าร้าน" successMessage="คัดลอกลิงก์หน้าร้านแล้ว" />
        </div>
      }
      toolbarExtra={
        <>
          {/* min-h-11 ที่ label ทั้งก้อน (ไม่ใช่แค่ switch ตัวเล็ก) — คลิก/แตะที่ข้อความก็สลับสวิตช์ได้
              อยู่แล้วโดยธรรมชาติของ <label> ห่อ <input>; ขยายพื้นที่แนวตั้งให้ ≥44px ตามด้วย */}
          <label className="text-default-600 flex min-h-11 shrink-0 items-center gap-2 text-sm">
            เผยแพร่หน้าร้าน
            <input
              type="checkbox"
              className="form-switch shrink-0"
              checked={published}
              disabled={publishPending}
              onChange={handlePublishChange}
              aria-label="เผยแพร่หน้าร้านสาธารณะ"
            />
          </label>

          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn border-default-300 text-default-900 hover:bg-default-50 min-h-11 border shrink-0"
          >
            <Icon icon="external-link" className="me-1 text-base" aria-hidden="true" />
            ดูหน้าร้านจริง
          </a>
        </>
      }
      belowContent={isDirty ? <DraftDirtyBar formId={saveFormId} saving={saving} onDiscard={onDiscard} /> : null}
    />
  )
}
