'use client'

/**
 * AutoReplyListClient — รายการกลุ่มคำ + สวิตช์ระดับร้าน (feature 00023, S-13 หน้า 1)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/UI-DESIGN-SPEC.md §3
 *
 * Base (สวิตช์ `form-switch` controlled + description row): src/app/(paces)/seller/(dashboard)/
 *   business/[shopId]/invites/components/FinanceVisibilityToggle.tsx ซึ่ง Base เดิมมาจาก
 *   theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx:71
 * Base (ตาราง `table` + `table-responsive`): theme/paces/Admin/TS/src/app/(admin)/tables/static/page.tsx
 * Base (ช่องค้นหา `form-input`): theme/paces/Admin/TS/src/app/(admin)/form/elements/components/
 *   InputTextfieldType.tsx
 *
 * toast ใช้ pacesToast เท่านั้น (Hard Rule 9) — หน้านี้อยู่ใน (paces)
 * canEdit=false (STAFF) → ทุก control เขียนหาย เหลืออ่านอย่างเดียว (AC-004-02) แต่ความปลอดภัยจริง
 * อยู่ที่ API ซึ่งตรวจ role ฝั่ง server ซ้ำเสมอ (AC-004-03)
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { formatDateTime } from '@/lib/format-date'
import ChoiceSelect from '@/components/wrappers/ChoiceSelect'
import TestModeCard from './TestModeCard'

type ConfigView = {
  isEnabled: boolean
  testMode: boolean
  testModeExpiresAt: string | null
}

type KeywordRow = {
  id: string
  name: string
  matchType: string
  priority: number
  isActive: boolean
  phraseCount: number
  ruleCount: number
  updatedAt: string
}

type Props = {
  initialConfig: ConfigView
  initialKeywords: KeywordRow[]
  canEdit: boolean
}

/** ป้ายภาษาคนของรูปแบบการตรวจจับ — ต้องไม่โชว์ค่าดิบอย่าง CONTAINS ให้ผู้ใช้เห็น */
const MATCH_TYPE_LABEL: Record<string, string> = {
  EXACT: 'ตรงทั้งข้อความ',
  CONTAINS: 'มีคำอยู่ในประโยค',
  STARTS_WITH: 'ขึ้นต้นด้วยคำ',
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'

export default function AutoReplyListClient({ initialConfig, initialKeywords, canEdit }: Props) {
  const [config, setConfig] = useState(initialConfig)
  const [keywords, setKeywords] = useState(initialKeywords)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return keywords.filter((k) => {
      if (statusFilter === 'ACTIVE' && !k.isActive) return false
      if (statusFilter === 'INACTIVE' && k.isActive) return false
      if (q && !k.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [keywords, query, statusFilter])

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

  async function bulkSetActive(isActive: boolean) {
    if (!canEdit || selected.size === 0 || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/shops/auto-reply/keywords/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ keywordIds: [...selected], isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'บันทึกไม่สำเร็จ')

      const ok = new Set<string>(data.succeeded ?? [])
      setKeywords((rows) => rows.map((r) => (ok.has(r.id) ? { ...r, isActive } : r)))
      setSelected(new Set())

      // รายงานแยกรายตัว — กลุ่มที่เปิดไม่ได้เพราะยังไม่มีคำตรวจจับ/คำตอบ ต้องบอกให้รู้
      // ไม่ใช่เงียบแล้วให้ผู้ใช้งงว่าทำไมบางแถวไม่เปลี่ยน
      if (data.failed?.length) {
        pacesToast.warning(
          `สำเร็จ ${ok.size} กลุ่ม · เปิดไม่ได้ ${data.failed.length} กลุ่ม (ต้องมีคำตรวจจับและคำตอบก่อน)`,
        )
      } else {
        pacesToast.success(`${isActive ? 'เปิด' : 'ปิด'}ใช้งาน ${ok.size} กลุ่มแล้ว`)
      }
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const testModeOn = config.testMode

  return (
    <>
      {/* แถบโหมดทดสอบ — ต้องเห็นตลอดไม่ใช่ toast ที่หายไป (AC-021-07)
          ความเสี่ยงที่กันอยู่: ร้านลืมปิดแล้วเข้าใจว่าระบบทำงานอยู่ ทั้งที่ตอบแค่เธรดทดสอบ */}
      {testModeOn && (
        <div className="card border-warning bg-warning/10 mb-4">
          <div className="card-body flex flex-wrap items-center gap-3">
            <Icon icon="alert-triangle" className="text-warning text-xl" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-default-800 font-semibold">กำลังอยู่ในโหมดทดสอบ</p>
              <p className="text-default-600 text-sm">
                ระบบจะตอบเฉพาะเธรดที่เลือกไว้เท่านั้น ลูกค้าคนอื่นจะไม่ได้รับคำตอบอัตโนมัติ
                {config.testModeExpiresAt
                  ? ` (หมดอายุ ${formatDateTime(new Date(config.testModeExpiresAt))})`
                  : ' (ไม่ได้ตั้งเวลาหมดอายุไว้)'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <h5 className="text-default-800 text-base font-semibold">ตอบแชทอัตโนมัติ</h5>
          <label className="flex items-center gap-2">
            <span className="text-default-600 text-sm">เปิดใช้งาน</span>
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

        <div className="card-body">
          <p className="text-default-600 mb-4 text-sm">
            ตั้งกลุ่มคำที่ลูกค้ามักถาม แล้วกำหนดคำตอบไว้ล่วงหน้า ระบบจะตอบให้ทันทีที่ลูกค้าทักเข้ามา
            โดยเลือกคำตอบตามเพจ โฆษณา หรือสินค้าที่ลูกค้าเข้ามา
          </p>

          {!config.isEnabled && (
            <div className="border-default-200 bg-default-50 mb-4 rounded border border-dashed p-3">
              <p className="text-default-600 text-sm">
                ตอนนี้ปิดอยู่ — ตั้งค่าล่วงหน้าได้ แต่ระบบจะยังไม่ตอบลูกค้าจนกว่าจะเปิดสวิตช์ด้านบน
              </p>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="input-group max-w-xs flex-1">
              <input
                type="search"
                className="form-input"
                placeholder="ค้นหากลุ่มคำ"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="ค้นหากลุ่มคำ"
              />
            </div>
            <div className="w-40">
              <ChoiceSelect
                options={[
                  { value: 'ALL', label: 'ทั้งหมด' },
                  { value: 'ACTIVE', label: 'เปิดใช้งาน' },
                  { value: 'INACTIVE', label: 'ปิดอยู่' },
                ]}
                value={statusFilter}
                search={false}
                onChange={(v) => setStatusFilter(v as StatusFilter)}
                ariaLabel="กรองตามสถานะ"
              />
            </div>
            {canEdit && (
              <Link href="/settings/auto-reply/new" className="btn btn-primary ms-auto">
                <Icon icon="plus" className="me-1" aria-hidden="true" />
                สร้างกลุ่มคำ
              </Link>
            )}
          </div>

          {selected.size > 0 && canEdit && (
            <div className="border-default-200 mb-3 flex flex-wrap items-center gap-2 rounded border p-2">
              <span className="text-default-600 text-sm">เลือก {selected.size} รายการ</span>
              <button className="btn btn-sm btn-soft-success" disabled={busy} onClick={() => bulkSetActive(true)}>
                เปิดใช้งาน
              </button>
              <button className="btn btn-sm btn-soft-default" disabled={busy} onClick={() => bulkSetActive(false)}>
                ปิด
              </button>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="py-10 text-center">
              <Icon
                icon="message-2-search"
                className="text-default-400 mb-3 text-4xl"
                aria-hidden="true"
              />
              <p className="text-default-700 font-medium">
                {keywords.length === 0 ? 'ยังไม่มีกลุ่มคำ' : 'ไม่พบกลุ่มคำที่ค้นหา'}
              </p>
              <p className="text-default-500 mt-1 text-sm">
                {keywords.length === 0
                  ? 'ตอนนี้ระบบจะยังไม่ตอบข้อความใดเลย เริ่มจากสร้างกลุ่มคำแรกที่ลูกค้ามักถาม'
                  : 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง'}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    {canEdit && (
                      <th className="w-10">
                        <input
                          type="checkbox"
                          className="form-checkbox"
                          aria-label="เลือกทั้งหมด"
                          checked={selected.size === visible.length && visible.length > 0}
                          onChange={(e) =>
                            setSelected(e.target.checked ? new Set(visible.map((k) => k.id)) : new Set())
                          }
                        />
                      </th>
                    )}
                    <th>ชื่อกลุ่ม</th>
                    <th className="text-center">คำตรวจจับ</th>
                    <th className="text-center">กฎคำตอบ</th>
                    <th>รูปแบบ</th>
                    <th>สถานะ</th>
                    <th>แก้ไขล่าสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((k) => (
                    <tr key={k.id}>
                      {canEdit && (
                        <td>
                          <input
                            type="checkbox"
                            className="form-checkbox"
                            aria-label={`เลือก ${k.name}`}
                            checked={selected.has(k.id)}
                            onChange={(e) => {
                              const next = new Set(selected)
                              if (e.target.checked) next.add(k.id)
                              else next.delete(k.id)
                              setSelected(next)
                            }}
                          />
                        </td>
                      )}
                      <td>
                        <Link href={`/settings/auto-reply/${k.id}`} className="text-primary font-medium">
                          {k.name}
                        </Link>
                      </td>
                      <td className="text-center">{k.phraseCount}</td>
                      <td className="text-center">{k.ruleCount}</td>
                      <td className="text-default-600 text-sm">
                        {MATCH_TYPE_LABEL[k.matchType] ?? k.matchType}
                      </td>
                      <td>
                        {/* Verified-Means-Green: เขียว = ทำงานอยู่จริง ตรงกับที่ระบบใช้ทั้งแพลตฟอร์ม */}
                        <span className={`badge ${k.isActive ? 'bg-success/15 text-success' : 'bg-default-200 text-default-600'}`}>
                          {k.isActive ? 'เปิดใช้งาน' : 'ปิดอยู่'}
                        </span>
                      </td>
                      <td className="text-default-500 text-sm">
                        {formatDateTime(new Date(k.updatedAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* โหมดทดสอบอยู่ท้ายหน้า — เป็นเครื่องมือก่อนเปิดใช้จริง ไม่ใช่สิ่งที่ต้องเห็นทุกวัน
          แต่ตอนเปิดอยู่จะมีแถบเตือนค้างด้านบนสุดของหน้าเสมอ (AC-021-07) */}
      <TestModeCard
        canEdit={canEdit}
        testMode={config.testMode}
        testModeExpiresAt={config.testModeExpiresAt}
        onChanged={(next) => setConfig((c) => ({ ...c, ...next }))}
      />
    </>
  )
}
