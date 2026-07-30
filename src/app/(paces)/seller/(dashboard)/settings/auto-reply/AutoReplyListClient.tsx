'use client'

/**
 * AutoReplyListClient — รายการกลุ่มคำ + สวิตช์ระดับร้าน (feature 00023, S-13 หน้า 1)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/UI-DESIGN-SPEC.md §3
 *
 * Base (สวิตช์ `form-switch` controlled): src/app/(paces)/seller/(dashboard)/
 *   business/[shopId]/invites/components/FinanceVisibilityToggle.tsx ซึ่ง Base เดิมมาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx:71
 *
 * user 2026-07-30 "ทำไมการตั้งค่ามันมาอยู่หน้าลิส" — เดิมมีการ์ดสวิตช์ระดับร้านคั่นระหว่าง
 * stat card กับตาราง ซึ่งซ้ำชื่อหน้า (breadcrumb ก็บอกว่า "ตอบแชทอัตโนมัติ" อยู่แล้ว) และกิน
 * 3 แถวก่อนจะถึงรายการ ย้ายสวิตช์เข้าไปอยู่ในหัวตารางแทน — หน้านี้เป็น "หน้ารายการ" ไม่ใช่
 * "หน้าตั้งค่า" ตามที่ user ขอให้เหมือนหน้าสินค้า
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

      <AutoReplyListing
        keywords={keywords}
        canEdit={canEdit}
        shopEnabled={config.isEnabled}
        shopSwitchBusy={busy}
        onShopSwitch={toggleShopSwitch}
      />

    </>
  )
}
