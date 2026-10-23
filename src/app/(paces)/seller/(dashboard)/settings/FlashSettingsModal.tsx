'use client'

/**
 * FlashSettingsModal — "ตั้งค่าการจัดส่ง Flash" 3 แท็บ (Design-Spec §3.8)
 *
 * ท่าเดียวกับโมดัลตั้งค่าของ ShippingSettingsRow: ทุกแท็บ mount ค้าง (ซ่อนด้วย hidden) กันค่าที่กรอกหาย,
 * error พาไปแท็บแรกที่ผิด, ปิดตอน dirty ถามก่อน · ต่างจาก iShip: ไม่มีขนส่ง/กล่อง, ขนาดไม่บังคับ,
 * มีขนาดใบปะหน้า + ปุ่มก๊อปที่อยู่ผู้ส่งจาก iShip · ไม่ใช่เจ้าของ = แถวอ่านค่า ไม่มีปุ่มบันทึก
 * กฎตรวจค่าอยู่ใน lib/shipping/flash-settings-view.ts (มีเทส)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/InputTextfieldType.tsx
 *       theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx
 *       settings/ShippingSettingsRow.tsx (โครงแท็บ ARIA + CREATE_MODES radio-card)
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import IShipModalShell from '@/components/safepay/iship/IShipModalShell'
import { NOTICE_BOX } from '@/components/safepay/iship/tone'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { ISHIP_CATEGORIES } from '@/lib/iship/mapping'
import AddressSearchSheet, {
  type SelectedLocality,
} from '@/app/(paces)/seller/(dashboard)/orders/new/components/AddressSearchSheet'
import {
  SETTINGS_FIELD_TAB,
  validateFlashSettings,
  hasSenderLocality,
  canCopyIshipSender,
  copyNeedsConfirm,
  pickSender,
  type SenderFields,
  type SettingsErrors,
  type SettingsTab,
} from '@/lib/shipping/flash-settings-view'
import type { FlashSettings } from '@/services/flash.service'
import { flashFetch, readFlashError } from './flash-fetch'
import FlashModePanel, { ReadRow } from './FlashModePanel'

interface Props {
  isOwner: boolean
  senderComplete: boolean
  initialSettings: FlashSettings
  ishipSender: SenderFields | null
  ishipConnected: boolean
  initialTab: SettingsTab
  onClose: () => void
}

const TABS: { key: SettingsTab; label: string; icon: string }[] = [
  { key: 'sender', label: 'ที่อยู่ผู้ส่ง', icon: 'map-pin' },
  { key: 'parcel', label: 'ค่าตั้งต้นพัสดุ', icon: 'package' },
  { key: 'mode', label: 'โหมดและใบปะหน้า', icon: 'settings-automation' },
]

const blankToNull = (v: string | null) => (v == null || v.trim() === '' ? null : v.trim())
const toNum = (v: string) => (v === '' ? null : Number(v))

export default function FlashSettingsModal({
  isOwner, senderComplete, initialSettings, ishipSender, ishipConnected, initialTab, onClose,
}: Props) {
  const router = useRouter()
  const [s, setS] = useState(initialSettings)
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [errors, setErrors] = useState<SettingsErrors>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addrOpen, setAddrOpen] = useState(false)
  const addrTriggerRef = useRef<HTMLButtonElement>(null)

  const patch = (p: Partial<FlashSettings>) => {
    setS((cur) => ({ ...cur, ...p }))
    setDirty(true)
  }

  const localityOn = hasSenderLocality(s)
  const tabHasError = (k: SettingsTab) =>
    (Object.keys(errors) as (keyof FlashSettings)[]).some((f) => SETTINGS_FIELD_TAB[f] === k)

  function onTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.key === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length
    setTab(TABS[next].key)
  }

  async function copyFromIship() {
    if (!ishipSender) return
    if (copyNeedsConfirm(s)) {
      const ok = await pacesConfirm.question('แทนที่ที่อยู่ผู้ส่งที่กรอกไว้?', undefined, {
        confirmButtonText: 'แทนที่',
        cancelButtonText: 'เก็บของเดิม',
      })
      if (!ok) return
    }
    patch(pickSender(ishipSender))
    pacesToast.success('คัดลอกที่อยู่ผู้ส่งจาก iShip แล้ว ตรวจแล้วกดบันทึก')
  }

  async function handleSave() {
    const found = validateFlashSettings(s)
    setErrors(found)
    const keys = Object.keys(found) as (keyof FlashSettings)[]
    if (keys.length > 0) {
      // พาไปแท็บแรกที่ผิด + โฟกัสช่องนั้น — ไม่งั้นกดบันทึกแล้วเงียบเพราะช่องที่ผิดอยู่แท็บที่มองไม่เห็น
      const firstTab = TABS.find((t) => keys.some((k) => SETTINGS_FIELD_TAB[k] === t.key))
      if (firstTab) {
        setTab(firstTab.key)
        pacesToast.error(`ตรวจสอบข้อมูลในแท็บ "${firstTab.label}" — มีบางช่องยังไม่ถูกต้อง`)
        const firstField = keys.find((k) => SETTINGS_FIELD_TAB[k] === firstTab.key)
        if (firstField) setTimeout(() => document.getElementById(`flash-${firstField}`)?.focus(), 0)
      }
      return
    }
    setSaving(true)
    try {
      const res = await flashFetch('/settings', 'PUT', {
        ...s,
        senderName: blankToNull(s.senderName),
        senderPhone: blankToNull(s.senderPhone),
        senderAddress: blankToNull(s.senderAddress),
        defaultRemark: blankToNull(s.defaultRemark),
      })
      if (!res.ok) {
        pacesToast.error((await readFlashError(res)).message ?? 'บันทึกไม่สำเร็จ ลองอีกครั้ง')
        return
      }
      setDirty(false)
      onClose()
      pacesToast.success('บันทึกการตั้งค่าแล้ว')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleClose() {
    if (dirty) {
      const ok = await pacesConfirm.warning('ปิดโดยไม่บันทึก?', 'การเปลี่ยนแปลงที่ยังไม่ได้บันทึกจะหายไป', {
        confirmButtonText: 'ปิดเลย',
        cancelButtonText: 'กลับไปแก้ไข',
      })
      if (!ok) return
    }
    onClose()
  }

  const fieldError = (k: keyof FlashSettings) =>
    errors[k] ? (
      <p id={`flash-${k}-err`} className="mb-0 mt-1 text-xs text-danger-ink">{errors[k]}</p>
    ) : null
  const inputCls = (k: keyof FlashSettings) => `form-input${errors[k] ? ' is-invalid' : ''}`
  const describedBy = (k: keyof FlashSettings) => (errors[k] ? `flash-${k}-err` : undefined)

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={handleClose}
        disabled={saving}
        className="btn inline-flex items-center justify-center border border-default-300 py-2.5 text-default-700 disabled:opacity-60"
      >
        ปิด
      </button>
      {isOwner && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn inline-flex items-center justify-center gap-2 bg-primary py-2.5 text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? (
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Icon icon="device-floppy" className="text-base" aria-hidden="true" />
          )}
          บันทึกการตั้งค่า
        </button>
      )}
    </div>
  )

  const categoryLabel = ISHIP_CATEGORIES.find((c) => c.id === s.defaultCategoryId)?.label ?? ''
  const extras = [
    s.optOnTime && 'ส่งตรงเวลา',
    s.optBoxShield && 'ประกันกล่องพัสดุ',
    s.optIsInsured && `ประกันสินค้า${s.optProductValue ? ` ฿${s.optProductValue}` : ''}`,
  ].filter(Boolean).join(' · ')
  const dims = [s.defaultWidth, s.defaultLength, s.defaultHeight].every((v) => v != null)
    ? `${s.defaultWidth}×${s.defaultLength}×${s.defaultHeight} ซม.`
    : ''

  return (
    <IShipModalShell
      title={isOwner ? 'ตั้งค่าการจัดส่ง Flash' : 'ค่าที่ตั้งไว้ของ Flash'}
      size="2xl"
      busy={saving}
      onClose={handleClose}
      footer={footer}
    >
      {!isOwner && (
        <p className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.secondary}`}>
          <Icon icon="lock" className="shrink-0 text-base" aria-hidden="true" />
          เฉพาะเจ้าของร้านแก้ไขได้
        </p>
      )}

      {/* 🛑 mt-0: .nav-tabs ของ Paces มี -my-3.75 ถ้าไม่ปิดบนจะถูกดึงขึ้นไปทับหัว (precedent ShippingSettingsRow) */}
      <div
        role="tablist"
        aria-label="หมวดการตั้งค่า"
        onKeyDown={onTabKeyDown}
        className="nav-tabs -mx-5 mt-0 mb-4 flex h-auto flex-nowrap gap-1 overflow-x-auto border-b border-default-200 px-5"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            aria-controls={`flash-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
              tab === t.key
                ? 'border-primary text-primary-ink'
                : 'border-transparent text-default-600 hover:text-default-900'
            }`}
          >
            <Icon icon={t.icon} className="text-base" aria-hidden="true" />
            {t.label}
            {tabHasError(t.key) && (
              <span role="img" className="size-1.5 rounded-full bg-danger" aria-label="มีข้อมูลที่ยังไม่ถูกต้อง" />
            )}
          </button>
        ))}
      </div>

      {/* ── แท็บ 1: ที่อยู่ผู้ส่ง ── */}
      <div id="flash-panel-sender" role="tabpanel" className={tab === 'sender' ? '' : 'hidden'}>
        {!isOwner ? (
          <div>
            <ReadRow label="ชื่อผู้ส่ง" value={s.senderName ?? ''} />
            <ReadRow label="เบอร์โทรผู้ส่ง" value={s.senderPhone ?? ''} />
            <ReadRow label="ที่อยู่" value={s.senderAddress ?? ''} />
            <ReadRow
              label="ตำบล / อำเภอ / จังหวัด"
              value={localityOn ? `ต.${s.senderSubdistrict || '—'} · อ.${s.senderDistrict || '—'} · ${s.senderProvince || '—'} ${s.senderPostcode || ''}` : ''}
            />
          </div>
        ) : (
          <>
            {!senderComplete && (
              <p className={`mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.warning}`}>
                <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
                กรอกที่อยู่ผู้ส่งให้ครบก่อน จึงจะเปิดพัสดุและเรียกรถได้
              </p>
            )}
            {canCopyIshipSender(isOwner, ishipSender) && (
              <button
                type="button"
                onClick={() => void copyFromIship()}
                className="btn btn-sm mb-4 inline-flex items-center gap-1.5 border border-default-300 py-2.5"
              >
                <Icon icon="copy" className="text-base" aria-hidden="true" />
                ใช้ที่อยู่ที่ตั้งไว้กับ iShip
              </button>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="flash-senderName">ชื่อผู้ส่ง</label>
                <input id="flash-senderName" type="text" className="form-input" maxLength={120}
                  value={s.senderName ?? ''} onChange={(e) => patch({ senderName: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor="flash-senderPhone">เบอร์โทรผู้ส่ง</label>
                <input id="flash-senderPhone" type="tel" inputMode="numeric" className={inputCls('senderPhone')}
                  aria-describedby={describedBy('senderPhone')}
                  value={s.senderPhone ?? ''} onChange={(e) => patch({ senderPhone: e.target.value })} />
                {fieldError('senderPhone')}
              </div>
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="flash-senderAddress">ที่อยู่ (บ้านเลขที่ / ถนน)</label>
                <input id="flash-senderAddress" type="text" className="form-input" maxLength={255}
                  value={s.senderAddress ?? ''} onChange={(e) => patch({ senderAddress: e.target.value })} />
              </div>
              {/* เลือกจากชุดข้อมูลครั้งเดียวเติม 4 ค่า — กันสลับตำบล/อำเภอ (ตำบล→DistrictName อำเภอ→CityName ของ Flash) */}
              <div className="sm:col-span-2">
                <label className="form-label" id="flash-sender-locality-label">
                  ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์
                </label>
                <button
                  ref={addrTriggerRef}
                  type="button"
                  onClick={() => setAddrOpen(true)}
                  aria-labelledby="flash-sender-locality-label"
                  className="flex w-full items-center gap-2 rounded-lg border border-default-300 px-3 py-2.5 text-left"
                >
                  <Icon icon="map-pin" className={`size-4 shrink-0 ${localityOn ? 'text-primary' : 'text-default-600'}`} aria-hidden="true" />
                  {localityOn ? (
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-semibold text-default-900">
                        ต.{s.senderSubdistrict || '—'} · อ.{s.senderDistrict || '—'}
                      </span>
                      <span className="block text-xs text-default-600">
                        {s.senderProvince || '—'} · {s.senderPostcode || '—'}
                      </span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 text-sm text-default-600">
                      แตะเพื่อเลือกตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์
                    </span>
                  )}
                  <Icon icon="chevron-right" className="size-4 shrink-0 text-default-600" aria-hidden="true" />
                </button>
                {fieldError('senderPostcode')}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── แท็บ 2: ค่าตั้งต้นพัสดุ ── */}
      <div id="flash-panel-parcel" role="tabpanel" className={tab === 'parcel' ? '' : 'hidden'}>
        {!isOwner ? (
          <div>
            <ReadRow label="ประเภทสินค้า" value={categoryLabel} />
            <ReadRow label="น้ำหนัก" value={s.defaultWeight != null ? `${s.defaultWeight} กก.` : ''} />
            <ReadRow label="ขนาดกล่อง (กว้าง×ยาว×สูง)" value={dims} />
            <ReadRow label="หมายเหตุถึงคนส่งของ" value={s.defaultRemark ?? ''} />
            <ReadRow label="บริการเสริม" value={extras} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="flash-defaultCategoryId">ประเภทสินค้า</label>
                <select id="flash-defaultCategoryId" className="form-select"
                  value={s.defaultCategoryId ?? ''}
                  onChange={(e) => patch({ defaultCategoryId: e.target.value === '' ? null : Number(e.target.value) })}>
                  <option value="">เลือกประเภท</option>
                  {ISHIP_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="flash-defaultWeight">น้ำหนัก (กก.)</label>
                <input id="flash-defaultWeight" type="number" step="0.1" min="0.01" className={inputCls('defaultWeight')}
                  aria-describedby={describedBy('defaultWeight')}
                  value={s.defaultWeight ?? ''} onChange={(e) => patch({ defaultWeight: toNum(e.target.value) })} />
                {fieldError('defaultWeight')}
              </div>
              <div className="sm:col-span-2">
                <p className="form-label">ขนาดกล่อง (ไม่บังคับ)</p>
                <div className="grid grid-cols-3 gap-2">
                  {([['defaultWidth', 'กว้าง'], ['defaultLength', 'ยาว'], ['defaultHeight', 'สูง']] as const).map(([k, label]) => (
                    <div key={k}>
                      <label className="form-label" htmlFor={`flash-${k}`}>{label} (ซม.)</label>
                      <input id={`flash-${k}`} type="number" step="any" min="1" className={inputCls(k)}
                        aria-describedby={describedBy(k)}
                        value={s[k] ?? ''} onChange={(e) => patch({ [k]: toNum(e.target.value) })} />
                    </div>
                  ))}
                </div>
                {(errors.defaultWidth || errors.defaultLength || errors.defaultHeight) && (
                  <p className="mb-0 mt-1 text-xs text-danger-ink">ต้องอยู่ระหว่าง 1–300 ซม. ทศนิยมไม่เกิน 2 ตำแหน่ง</p>
                )}
                <p className="mb-0 mt-1 text-xs text-default-600">Flash ไม่บังคับขนาดกล่อง</p>
              </div>
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="flash-defaultRemark">หมายเหตุถึงคนส่งของ</label>
                <input id="flash-defaultRemark" type="text" className="form-input" maxLength={200} placeholder="เช่น ห้ามโยน"
                  value={s.defaultRemark ?? ''} onChange={(e) => patch({ defaultRemark: e.target.value })} />
              </div>
            </div>

            <p className={`mb-0 mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
              <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
              ขนาดและน้ำหนักที่กรอกเป็นค่าที่ร้านแจ้ง Flash อาจชั่งจริงแล้วคิดค่าส่งต่างจากนี้
            </p>
            <div className="mt-4 flex flex-col gap-3 border-t border-default-200 pt-4">
              <p className={`mb-0 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${NOTICE_BOX.info}`}>
                <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
                ยอดเก็บเงินปลายทางกำหนดจากวิธีชำระเงินของแต่ละคำสั่งซื้อตอนสร้างพัสดุ ไม่ต้องตั้งเป็นค่าเริ่มต้นที่นี่
              </p>
              <label className="flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                <input type="checkbox" className="form-checkbox" checked={s.optOnTime}
                  onChange={(e) => patch({ optOnTime: e.target.checked })} />
                ใช้บริการส่งตรงเวลา
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                <input type="checkbox" className="form-checkbox" checked={s.optBoxShield}
                  onChange={(e) => patch({ optBoxShield: e.target.checked })} />
                ประกันกล่องพัสดุ
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm lg:min-h-0">
                <input type="checkbox" className="form-checkbox" checked={s.optIsInsured}
                  onChange={(e) => patch({ optIsInsured: e.target.checked })} />
                ประกันสินค้า
              </label>
              {s.optIsInsured && (
                <div className="ps-6">
                  <label className="form-label" htmlFor="flash-optProductValue">มูลค่าสินค้าที่เอาประกัน (บาท)</label>
                  <input id="flash-optProductValue" type="number" min="1" className={inputCls('optProductValue')}
                    aria-describedby={describedBy('optProductValue')}
                    value={s.optProductValue ?? ''} onChange={(e) => patch({ optProductValue: toNum(e.target.value) })} />
                  {fieldError('optProductValue')}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <FlashModePanel
        active={tab === 'mode'}
        isOwner={isOwner}
        labelSize={s.labelSize}
        createMode={s.createMode}
        ishipConnected={ishipConnected}
        onChange={patch}
      />

      {isOwner && (
        <AddressSearchSheet
          open={addrOpen}
          current={
            localityOn
              ? {
                  subdistrict: s.senderSubdistrict ?? '',
                  district: s.senderDistrict ?? '',
                  province: s.senderProvince ?? '',
                  postcode: s.senderPostcode ?? '',
                }
              : null
          }
          onSelect={(loc: SelectedLocality) =>
            patch({
              senderSubdistrict: loc.subdistrict,
              senderDistrict: loc.district,
              senderProvince: loc.province,
              senderPostcode: loc.postcode,
            })
          }
          onClose={() => {
            setAddrOpen(false)
            addrTriggerRef.current?.focus()
          }}
        />
      )}
    </IShipModalShell>
  )
}
