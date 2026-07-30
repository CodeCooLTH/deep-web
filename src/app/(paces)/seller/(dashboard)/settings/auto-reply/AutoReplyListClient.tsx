'use client'

/**
 * AutoReplyListClient — รายการกลุ่มคำ + สวิตช์ระดับร้าน (feature 00023, S-13 หน้า 1)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/UI-DESIGN-SPEC.md §3
 *
 * Base (สวิตช์ `form-switch` controlled + description row): src/app/(paces)/seller/(dashboard)/
 *   business/[shopId]/invites/components/FinanceVisibilityToggle.tsx ซึ่ง Base เดิมมาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx:71
 * Base (stat card ด้านบน): src/app/(paces)/seller/(dashboard)/products/components/ProductStats.tsx
 *   — import ตัวเดิมมาใช้ ไม่ก๊อปโครงซ้ำ (การ์ดตัวนี้ไม่มีอะไรผูกกับสินค้าเลย นอกจากชื่อไฟล์)
 * Base (ตาราง + toolbar + pagination): ./AutoReplyListing.tsx ซึ่ง Base = products/components/
 *   ProductsListing.tsx (user 2026-07-29: "หน้า lists ไม่เห็นเหมือนหน้า products เลย")
 *
 * toast ใช้ pacesToast เท่านั้น (Hard Rule 9) — หน้านี้อยู่ใน (paces)
 * canEdit=false (STAFF) → ทุก control เขียนหาย เหลืออ่านอย่างเดียว (AC-004-02) แต่ความปลอดภัยจริง
 * อยู่ที่ API ซึ่งตรวจ role ฝั่ง server ซ้ำเสมอ (AC-004-03)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import ProductStats, { type StatType } from '../../products/components/ProductStats'
import AutoReplyListing, { type KeywordRow } from './AutoReplyListing'

type ConfigView = { isEnabled: boolean }

type Props = {
  initialConfig: ConfigView
  initialKeywords: KeywordRow[]
  canEdit: boolean
}

export default function AutoReplyListClient({ initialConfig, initialKeywords, canEdit }: Props) {
  const [config, setConfig] = useState(initialConfig)
  const [keywords] = useState(initialKeywords)
  const [busy, setBusy] = useState(false)

  async function toggleShopSwitch(next: boolean) {
    if (!canEdit || busy) return
    setBusy(true)
    // optimistic — คืนค่าเดิมถ้าพัง เพื่อไม่ให้ UI โกหกว่าเปิดอยู่ทั้งที่เซิร์ฟเวอร์ปฏิเสธ
    const prev = config.isEnabled
    setConfig((c) => ({ ...c, isEnabled: next }))
    try {
      const res = await fetch('/api/shops/auto-reply/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ isEnabled: next }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'บันทึกไม่สำเร็จ')
      pacesToast.success(next ? 'เปิดการตอบอัตโนมัติแล้ว' : 'ปิดการตอบอัตโนมัติแล้ว')
    } catch (e) {
      setConfig((c) => ({ ...c, isEnabled: prev }))
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const liveCount = keywords.filter((k) => k.status === 'LIVE').length
  const testCount = keywords.filter((k) => k.status === 'TEST').length
  const offlineCount = keywords.filter((k) => k.status === 'OFFLINE').length
  const phraseTotal = keywords.reduce((sum, k) => sum + k.phraseCount, 0)

  const statData: StatType[] = [
    {
      title: 'กลุ่มคำทั้งหมด',
      value: keywords.length,
      change: 0,
      icon: 'message-2-bolt',
      iconClassName: 'bg-primary/15 text-primary',
      bulletClassName: 'text-primary',
      metric: 'คำตรวจจับรวม',
      metricValue: String(phraseTotal),
    },
    {
      title: 'ตอบลูกค้าจริง',
      value: liveCount,
      change: 0,
      icon: 'broadcast',
      iconClassName: 'bg-success/15 text-success',
      bulletClassName: 'text-success',
      metric: 'ทำงานกับทุกแชท',
      metricValue: String(liveCount),
    },
    {
      title: 'อยู่ระหว่างทดสอบ',
      value: testCount,
      change: 0,
      icon: 'flask',
      iconClassName: 'bg-warning/15 text-warning',
      bulletClassName: 'text-warning',
      metric: 'ตอบเฉพาะแชทที่ระบุ',
      metricValue: String(testCount),
    },
    {
      title: 'ยังไม่ใช้งาน',
      value: offlineCount,
      change: 0,
      icon: 'circle-off',
      iconClassName: 'bg-default-200 text-default-500',
      bulletClassName: 'text-default-400',
      metric: 'ไม่ตอบใครเลย',
      metricValue: String(offlineCount),
    },
  ]

  return (
    <>
      {/* stat card — โครง/สัดส่วนเดียวกับหน้าสินค้าเป๊ะ (grid-cols-1 md:2 lg:4 + gap-1.25)
          change=0 ทุกใบเพราะยังไม่มีข้อมูลย้อนหลังให้เทียบ (หน้าสินค้าก็ส่ง 0 ด้วยเหตุผลเดียวกัน) */}
      <div className="mb-1.25 grid grid-cols-1 gap-1.25 md:grid-cols-2 lg:grid-cols-4">
        {statData.map((stat) => (
          <ProductStats key={stat.title} stat={stat} />
        ))}
      </div>

      {/* สวิตช์ระดับร้าน — แยกการ์ดจากตาราง เพราะเป็นสวิตช์ตัวเดียวที่คุมทุกกลุ่มคำ
          ถ้ายัดเข้า card-header ของตารางจะดูเป็นแค่ตัวกรองอีกตัวหนึ่ง */}
      <div className="card">
        <div className="card-body flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h5 className="text-default-800 mb-0.5 text-base font-semibold">ตอบแชทอัตโนมัติ</h5>
            <p className="text-default-500 mb-0 text-sm">
              ตั้งกลุ่มคำที่ลูกค้ามักถาม แล้วกำหนดคำตอบไว้ล่วงหน้า ระบบจะตอบให้ทันทีที่ลูกค้าทักเข้ามา
            </p>
          </div>
          <label className="flex flex-none items-center gap-2">
            <span className={`text-sm ${config.isEnabled ? 'text-success' : 'text-default-500'}`}>
              {config.isEnabled ? 'เปิดใช้งาน' : 'ปิดอยู่'}
            </span>
            <input
              type="checkbox"
              className="form-switch"
              checked={config.isEnabled}
              disabled={!canEdit || busy}
              onChange={(e) => toggleShopSwitch(e.target.checked)}
              aria-label="เปิดใช้งานการตอบแชทอัตโนมัติ"
            />
          </label>
        </div>
        {!config.isEnabled && (
          <div className="border-default-200 border-t px-4 py-3">
            <p className="text-default-600 mb-0 text-sm">
              ตอนนี้ปิดอยู่ — ตั้งค่าล่วงหน้าได้ แต่ระบบจะยังไม่ตอบลูกค้าจนกว่าจะเปิดสวิตช์นี้
            </p>
          </div>
        )}
      </div>

      <AutoReplyListing keywords={keywords} canEdit={canEdit} />

    </>
  )
}
