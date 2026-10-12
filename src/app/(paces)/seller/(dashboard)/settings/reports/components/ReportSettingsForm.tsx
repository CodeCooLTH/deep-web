'use client'

/**
 * ฟอร์มตั้งค่ารายงานการเงิน (feature 00073 เฟส B · FR-010 · ดีไซน์บอร์ด 8)
 *
 * Base: src/app/(paces)/seller/(dashboard)/public-profile/components/PriceVisibilityToggleClient.tsx
 *   — การ์ด Paces + form-switch controlled + optimistic + revert เมื่อ PATCH ล้ม + pacesToast (HR9)
 *   Adapt: หลายสวิตช์ในการ์ดเดียว (รายการแบบ list-group ของ Paces) · ตัวเลือกรูปแบบกราฟ/ช่วงเวลาเป็นปุ่มกลุ่ม
 *
 * บันทึกทีละช่องทันทีที่กด (ไม่มีปุ่มบันทึก) — ช่องที่ไม่ได้แตะไม่ถูกส่ง (API รวมกับค่าเดิมให้)
 */
import { useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import {
  DEFAULT_REPORT_SETTINGS,
  isDefaultReportSettings,
  type ReportChartStyle,
  type ReportHeadline,
  type ReportRange,
  type ReportSettings,
} from '@/lib/report-settings'

type BoolKey = 'receivables' | 'advanceDeposit' | 'jobCount' | 'partCost' | 'shopExpense' | 'pnl'

const CHART_STYLE_LABEL: Record<ReportChartStyle, string> = {
  STACKED: 'แท่งซ้อน',
  GROUPED: 'แท่งคู่',
  LINE: 'เส้น',
  AREA: 'พื้นที่',
}
/** ตัวเลขหลักบนการ์ดยอดขาย — ตัวที่สวิตช์ต้นทางปิดอยู่เลือกไม่ได้ (บอกเหตุผลใต้ปุ่ม) */
const HEADLINE_OPTIONS: { key: ReportHeadline; label: string; needs?: 'receivables' | 'pnl'; needsLabel?: string }[] = [
  { key: 'SALES', label: 'ยอดขาย' },
  { key: 'RECEIVED', label: 'รับเงินแล้ว', needs: 'receivables', needsLabel: 'ต้องเปิด "รับเงินแล้ว / ค้างรับ" ก่อน' },
  { key: 'NET_PROFIT', label: 'กำไรสุทธิ', needs: 'pnl', needsLabel: 'ต้องเปิด "กำไรขาดทุน" ก่อน' },
]

const RANGE_LABEL: Record<ReportRange, string> = {
  MONTH: 'เดือนนี้ (รายวัน)',
  M3: '3 เดือน',
  M6: '6 เดือน',
  M12: '12 เดือน',
  YEAR: 'ปีนี้',
}

export default function ReportSettingsForm({ initial, costNoun }: { initial: ReportSettings; costNoun: string }) {
  const [s, setS] = useState<ReportSettings>(initial)
  const [pending, setPending] = useState<string | null>(null)

  const save = async (patch: Partial<ReportSettings>, key: string) => {
    const prev = s
    setS({ ...s, ...patch }) // optimistic
    setPending(key)
    try {
      const res = await fetch('/api/shops/current/report-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(String(res.status))
      setS((await res.json()) as ReportSettings)
      pacesToast.success('บันทึกตั้งค่ารายงานแล้ว')
    } catch {
      setS(prev) // revert
      pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setPending(null)
    }
  }

  const rows: { key: BoolKey; icon: string; label: string; on: string; off: string }[] = [
    {
      key: 'receivables',
      icon: 'cash',
      label: 'รับเงินแล้ว / ค้างรับ',
      on: 'แยกยอดขายเป็นเงินที่รับแล้วกับค้างรับ · มีรายการ "ต้องตามเก็บ"',
      off: 'แสดงแค่ยอดขาย · การ์ดค้างรับและรายการต้องตามเก็บถูกซ่อน',
    },
    {
      key: 'advanceDeposit',
      icon: 'wallet',
      label: 'มัดจำรับล่วงหน้า',
      on: 'แสดงการ์ดเงินมัดจำของงานที่ยังไม่ปิด (ไม่ปนยอดขาย)',
      off: 'ไม่แสดงมัดจำของงานที่ยังไม่ปิด',
    },
    {
      key: 'jobCount',
      icon: 'list-numbers',
      label: 'จำนวนงาน',
      on: 'แสดงจำนวนงานที่ปิด · เฉลี่ยต่องาน · จำนวนงานในกล่องยอดของกราฟ',
      off: 'ซ่อนจำนวนงานและค่าเฉลี่ยต่องาน',
    },
    {
      key: 'partCost',
      icon: 'tool',
      label: costNoun,
      on: `แสดง${costNoun} และหักในกำไร`,
      off: `ซ่อนทุกจุดที่พูดถึง${costNoun} · กำไรไม่หัก${costNoun} (มีป้ายบอก)`,
    },
    {
      key: 'shopExpense',
      icon: 'receipt-2',
      label: 'ค่าใช้จ่ายร้าน',
      on: 'มีแท็บ/เมนูค่าใช้จ่าย และหักในกำไร',
      off: 'แท็บและเมนูค่าใช้จ่ายหาย · กำไรไม่หักค่าใช้จ่ายร้าน (ข้อมูลเดิมไม่ถูกลบ)',
    },
    {
      key: 'pnl',
      icon: 'chart-line',
      label: 'กำไรขาดทุน',
      on: 'มีแท็บกำไรขาดทุน และการ์ดกำไรในหน้างาน',
      off: 'ซ่อนแท็บกำไรขาดทุนและการ์ดกำไรในหน้างาน',
    },
  ]

  return (
    <div className="grid gap-base lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="card mb-base">
          <div className="card-header">
            <h4 className="card-title">ตัวเลขที่แสดง</h4>
          </div>
          <div className="card-body">
            <ul className="divide-default-200 divide-y">
              {/* ยอดขายเปิดเสมอ — เป็นแกนของทุกรายงาน (PRD §3.6) */}
              <li className="flex items-start gap-3 pb-3">
                <Icon icon="chart-bar" className="text-default-500 mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <label htmlFor="rs-sales" className="text-default-900 text-sm font-medium">
                    ยอดขาย (งานที่ร้านปิดแล้ว)
                  </label>
                  <p className="text-default-600 mt-0.5 text-xs">เปิดเสมอ — เป็นแกนของทุกรายงาน</p>
                </div>
                <input id="rs-sales" type="checkbox" className="form-switch mt-0.5 shrink-0" checked disabled readOnly />
              </li>
              {rows.map((r) => (
                <li key={r.key} className="flex items-start gap-3 py-3 last:pb-0">
                  <Icon icon={r.icon} className="text-default-500 mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`rs-${r.key}`} className="text-default-900 text-sm font-medium">
                      {r.label}
                    </label>
                    <p className="text-default-600 mt-0.5 text-xs">{s[r.key] ? r.on : r.off}</p>
                  </div>
                  <input
                    id={`rs-${r.key}`}
                    type="checkbox"
                    className="form-switch mt-0.5 shrink-0"
                    checked={s[r.key]}
                    disabled={pending !== null}
                    onChange={(e) => void save({ [r.key]: e.target.checked }, r.key)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card mb-base">
          <div className="card-header">
            <h4 className="card-title">การ์ดและกราฟ</h4>
          </div>
          <div className="card-body space-y-4">
            {/* ตัวเลขหลักบนการ์ด (มติ user 2026-10-12) — ตัวที่เลือกไว้แต่สวิตช์ต้นทางปิดภายหลัง จอถอยเป็นยอดขายเอง (resolveHeadline) */}
            <fieldset>
              <legend className="text-default-900 mb-2 text-sm font-medium">ตัวเลขหลักบนการ์ดยอดขาย</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ตัวเลขหลักบนการ์ดยอดขาย">
                {HEADLINE_OPTIONS.map((o) => {
                  const blocked = o.needs != null && !s[o.needs]
                  const selected = s.headline === o.key && !blocked
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={pending !== null || blocked}
                      title={blocked ? o.needsLabel : undefined}
                      onClick={() => s.headline !== o.key && void save({ headline: o.key }, 'headline')}
                      className={`btn min-h-11 ${selected ? 'bg-primary text-white' : 'border-default-300 text-default-700 hover:bg-default-100'} ${blocked ? 'opacity-50' : ''}`}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-default-600 mt-1.5 text-xs">
                การ์ดยอดขายหน้าแรก (มือถือ) และภาพรวมร้าน (คอม) · เลือกกำไรสุทธิ ชีตการเงินจะเปิดที่แท็บกำไรขาดทุนก่อน
                {HEADLINE_OPTIONS.filter((o) => o.needs && !s[o.needs]).map((o) => (
                  <span key={o.key} className="block">
                    {o.label}: {o.needsLabel}
                  </span>
                ))}
              </p>
            </fieldset>
            <fieldset>
              <legend className="text-default-900 mb-2 text-sm font-medium">รูปแบบกราฟ</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="รูปแบบกราฟ">
                {(Object.keys(CHART_STYLE_LABEL) as ReportChartStyle[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={s.chartStyle === k}
                    disabled={pending !== null}
                    onClick={() => s.chartStyle !== k && void save({ chartStyle: k }, 'chartStyle')}
                    className={`btn min-h-11 ${s.chartStyle === k ? 'bg-primary text-white' : 'border-default-300 text-default-700 hover:bg-default-100'}`}
                  >
                    {CHART_STYLE_LABEL[k]}
                  </button>
                ))}
              </div>
              <p className="text-default-600 mt-1.5 text-xs">ตั้งครั้งเดียว ใช้ทุกกราฟการเงินของร้าน</p>
            </fieldset>
            <fieldset>
              <legend className="text-default-900 mb-2 text-sm font-medium">ช่วงเวลาเริ่มต้นของกราฟ</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ช่วงเวลาเริ่มต้นของกราฟ">
                {(Object.keys(RANGE_LABEL) as ReportRange[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={s.defaultRange === k}
                    disabled={pending !== null}
                    onClick={() => s.defaultRange !== k && void save({ defaultRange: k }, 'defaultRange')}
                    className={`btn min-h-11 ${s.defaultRange === k ? 'bg-primary text-white' : 'border-default-300 text-default-700 hover:bg-default-100'}`}
                  >
                    {RANGE_LABEL[k]}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-header">
            <h4 className="card-title">ตั้งค่านี้ทำอะไร</h4>
          </div>
          <div className="card-body">
            <ul className="text-default-700 list-disc space-y-2 ps-4 text-sm">
              <li>ใช้ทั้งร้าน — เห็นและแก้ได้เฉพาะเจ้าของร้าน</li>
              <li>ปิด = ซ่อนจากจอของร้าน ไม่ลบข้อมูล เปิดกลับมาได้ครบ</li>
              <li>เปลี่ยนแค่ “แสดงอะไร แบบไหน” — วิธีนับเงินไม่เปลี่ยน (ยอดขายนับตอนร้านปิดงาน)</li>
              <li>รายงานเข้ากลุ่ม LINE ไม่เปลี่ยน — แต่ละกลุ่มตั้งของตัวเองแยก</li>
            </ul>
            <button
              type="button"
              className="btn border-default-300 text-default-700 hover:bg-default-100 mt-4 min-h-11 w-full"
              disabled={pending !== null || isDefaultReportSettings(s)}
              onClick={() => void save({ ...DEFAULT_REPORT_SETTINGS }, 'reset')}
            >
              <Icon icon="refresh" className="size-4" aria-hidden="true" />
              คืนค่าเริ่มต้น
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
