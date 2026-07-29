'use client'

/**
 * ShipmentCreateForm — ฟอร์มเปิดพัสดุ 1 ใบ (feature 00022)
 *
 * ใช้ร่วมกัน 2 ที่: ส่วนการจัดส่งในหน้าคำสั่งซื้อ และโมดัลในหน้าแชท
 * component นี้ "ไม่รู้จักแชท" โดยเจตนา — สิ่งที่เป็นเรื่องของแชท (เช่น ติ๊กแจ้งเลขในห้องนั้น)
 * ผู้เรียกใส่เองผ่าน extraFields แล้วทำงานต่อใน onCreated
 *
 * extraFields เป็น render-prop เพราะช่องพวกนั้นต้องรู้ว่าร้านเลือกขนส่งอะไรอยู่ ณ ขณะนั้น
 * (ใช้ทำตัวอย่างข้อความที่ลูกค้าจะได้รับ) — state ของขนส่งอยู่ในฟอร์มนี้ ไม่ยกขึ้นไปทั้งก้อน
 *
 * Base: settings/ShippingSettingsRow.tsx (บล็อกพัสดุ/บริการเสริม — form-input/form-select/
 *       grid-cols-3 ขนาดกล่อง/checkbox), orders/new/components/CustomerQuickBlock.tsx
 *       (ปุ่มเลือกที่อยู่ + AddressSearchSheet), ShipmentPanel.tsx (ปุ่ม submit + spinner)
 */

import { useMemo, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import { ISHIP_CATEGORIES, findMissingReceiverFields } from '@/lib/iship/mapping'
import type { MissingReceiverField, SenderAddress } from '@/lib/iship/mapping'
import type {
  ParcelDefaults,
  ReceiverData,
  ShipmentReviewItem,
  ShipmentViewJson,
} from '@/lib/iship/context'
import { useIShipBoxes } from './useIShipBoxes'
import AddressSearchSheet, {
  type SelectedLocality,
} from '@/app/(paces)/seller/(dashboard)/orders/new/components/AddressSearchSheet'

export interface Courier {
  code: string
  name: string
}

interface Props {
  orderToken: string
  missingReceiver: MissingReceiverField[]
  receiver: ReceiverData
  /** ผู้ส่งจากการตั้งค่าร้าน — โชว์ในบล็อกตรวจ แก้ที่นี่ไม่ได้ */
  sender: SenderAddress
  /** สินค้าในคำสั่งซื้อ — โชว์ในบล็อกตรวจ */
  items: ShipmentReviewItem[]
  defaults: ParcelDefaults
  couriers: Courier[]
  /** โหลดรายชื่อขนส่งไม่ได้ — ยังสร้างได้ด้วยค่าตั้งต้นของร้าน */
  couriersError?: boolean
  submitLabel?: string
  /** ช่องเพิ่มเติมของผู้เรียก — รับชื่อขนส่งที่เลือกอยู่ไปใช้แสดงผลได้ */
  extraFields?: (ctx: { courierName: string | null }) => React.ReactNode
  /** เรียกทั้งกรณี CREATED และ FAILED — ผู้เรียกสลับไปหน้าสถานะเสมอ */
  onCreated: (shipment: ShipmentViewJson) => void
  /** 409 = มีพัสดุที่ยังใช้งานอยู่แล้ว — ผู้เรียกโหลด context ใหม่แล้วสลับโหมด */
  onExists: () => void
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

/** ตัวเลขจากช่อง input — ว่าง = ไม่ส่ง field นั้นไปเลย (ให้ค่าตั้งต้นร้านทำงาน) */
function numOrUndefined(v: string): number | undefined {
  if (v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** ช่องที่ยังไม่ได้กรอก — เขียน class เต็มคำ ไม่ประกอบชื่อสีแบบ dynamic (Tailwind สแกนข้อความ) */
function MissingChip({ label }: { label: string }) {
  return <span className="badge bg-danger/15 text-danger">ขาด{label}</span>
}

/**
 * ผู้ส่ง/ผู้รับ 1 ก้อนในบล็อกตรวจ — โครงเดียวกันทั้งคู่เพื่อให้ตาเทียบกันได้ทันที
 * missing ส่งมาเฉพาะฝั่งผู้รับ (ผู้ส่งถูก gate ไว้ก่อนเข้าฟอร์มนี้แล้ว ที่นี่ fallback เฉย ๆ)
 */
function ReviewParty({
  icon,
  label,
  party,
  missing = [],
}: {
  icon: string
  label: string
  party: SenderAddress
  missing?: MissingReceiverField[]
}) {
  const has = (v?: string | null) => !!v && v.trim() !== ''
  const lacks = (f: MissingReceiverField) => missing.includes(f)
  const locality = [party.subdistrict, party.district].filter(has).join(' · ')
  const region = [party.province, party.postcode].filter(has).join(' ')

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-default-100 text-default-500">
        <Icon icon={icon} className="text-sm" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs text-default-400">{label}</p>
        <p className="mb-0.5 flex flex-wrap items-center gap-1 text-sm font-semibold text-default-900">
          {has(party.name) ? party.name : lacks('ชื่อผู้รับ') ? <MissingChip label="ชื่อ" /> : '—'}
        </p>
        <p className="mb-0.5 flex flex-wrap items-center gap-1 text-sm text-default-600">
          {has(party.phone) ? (
            party.phone
          ) : lacks('เบอร์โทรผู้รับ') ? (
            <MissingChip label="เบอร์โทร" />
          ) : (
            '—'
          )}
        </p>
        <p className="mb-0 flex flex-wrap items-center gap-1 text-sm text-default-600">
          {has(party.address) ? party.address : lacks('ที่อยู่') ? <MissingChip label="ที่อยู่" /> : '—'}
          {locality !== '' && <span>{locality}</span>}
          {!has(party.subdistrict) && lacks('ตำบล') && <MissingChip label="ตำบล" />}
          {!has(party.district) && lacks('อำเภอ') && <MissingChip label="อำเภอ" />}
          {region !== '' && <span>{region}</span>}
          {!has(party.province) && lacks('จังหวัด') && <MissingChip label="จังหวัด" />}
          {!has(party.postcode) && lacks('รหัสไปรษณีย์') && <MissingChip label="รหัสไปรษณีย์" />}
        </p>
      </div>
    </div>
  )
}

export default function ShipmentCreateForm({
  orderToken,
  missingReceiver,
  receiver,
  sender,
  items,
  defaults,
  couriers,
  couriersError = false,
  submitLabel = 'สร้างพัสดุ',
  extraFields,
  onCreated,
  onExists,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [addrOpen, setAddrOpen] = useState(false)
  const [form, setForm] = useState<ReceiverData>(receiver)

  // พัสดุ — เริ่มจากค่าตั้งต้นของร้าน แก้รายใบได้โดยไม่กระทบค่าที่ตั้งไว้
  const [courierCode, setCourierCode] = useState(defaults.courierCode ?? '')
  const [weight, setWeight] = useState(defaults.weight != null ? String(defaults.weight) : '')
  const [width, setWidth] = useState(defaults.width != null ? String(defaults.width) : '')
  const [length, setLength] = useState(defaults.length != null ? String(defaults.length) : '')
  const [height, setHeight] = useState(defaults.height != null ? String(defaults.height) : '')
  const [categoryId, setCategoryId] = useState(
    defaults.categoryId != null ? String(defaults.categoryId) : '',
  )

  // กล่องของบัญชีร้าน — เลือกแล้วเติมขนาดให้ทั้ง 3 ช่อง เร็วกว่ากรอกเอง
  // กล่องของร้านต้องขึ้นก่อนกล่องมาตรฐาน (~24 ใบ) ไม่งั้นจะไปกองท้ายจนร้านนึกว่าไม่มี
  const { boxes } = useIShipBoxes()
  const ownBoxes = boxes.filter((b) => b.user_id != null)
  const standardBoxes = boxes.filter((b) => b.user_id == null)

  // เพิ่มเติม — เปิดอัตโนมัติเมื่อร้านตั้งค่าอะไรไว้ที่หน้าตั้งค่า ไม่งั้นร้านจะไม่รู้ว่ามี
  // COD/ประกันติดมากับพัสดุใบนี้ด้วย (ซ่อนไว้เงียบ ๆ = สร้างไปโดยไม่รู้ว่ามีค่าเหล่านี้)
  const hasPresetExtras =
    defaults.codEnabled ||
    !!defaults.remark ||
    defaults.optOnTime ||
    defaults.optBoxShield ||
    defaults.optIsInsured
  const [extraOpen, setExtraOpen] = useState(hasPresetExtras)
  const [codAmount, setCodAmount] = useState('')
  const [remark, setRemark] = useState(defaults.remark ?? '')
  const [onTime, setOnTime] = useState(defaults.optOnTime)
  const [boxShield, setBoxShield] = useState(defaults.optBoxShield)
  const [isInsured, setIsInsured] = useState(defaults.optIsInsured)
  const [productValue, setProductValue] = useState(
    defaults.optProductValue != null ? String(defaults.optProductValue) : '',
  )

  const courierName = useMemo(
    () => couriers.find((c) => c.code === courierCode)?.name ?? null,
    [couriers, courierCode],
  )

  const setField = (k: keyof ReceiverData, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isMissing = (f: MissingReceiverField) => missingReceiver.includes(f)

  /**
   * ช่องผู้รับที่ยังขาด "ณ วินาทีนี้" — คำนวณจาก form ที่ร้านกำลังพิมพ์ ไม่ใช่ missingReceiver
   * ที่ server คำนวณไว้ตอนโหลด (ตัวนั้นค้างอยู่กับค่าใน DB) บล็อกตรวจต้องเปลี่ยนตามที่พิมพ์
   * ไม่งั้นกรอกครบแล้วยังขึ้นแดงอยู่ ซึ่งจะสอนให้ร้านเลิกเชื่อคำเตือน
   */
  const liveMissing = useMemo(
    () =>
      findMissingReceiverFields(
        {
          line1: form.line1,
          subdistrict: form.subdistrict,
          district: form.district,
          province: form.province,
          postcode: form.postcode,
        },
        form.name,
        form.phone,
      ),
    [form],
  )

  // บล็อกตรวจ — โชว์ 3 รายการแรก ใช้ state ธรรมดาไม่ใช่ Preline collapse เพราะโมดัลแชท
  // ถูกซ่อนด้วย hidden ไม่ unmount ทำให้ Preline ที่ init ตอน mount ครั้งเดียวใช้ไม่ได้
  const [itemsOpen, setItemsOpen] = useState(false)
  const itemCount = useMemo(() => items.reduce((s, it) => s + it.qty, 0), [items])
  const itemsSubtotal = useMemo(
    () => items.reduce((s, it) => s + it.price * it.qty, 0),
    [items],
  )

  const hasLocality = !!(form.subdistrict || form.district || form.province || form.postcode)
  const localityMissing =
    isMissing('ตำบล') || isMissing('อำเภอ') || isMissing('จังหวัด') || isMissing('รหัสไปรษณีย์')

  async function handleSubmit() {
    if (busy) return
    // ยืนยันเสมอ — การกดปุ่มนี้เปิดพัสดุจริงและเกิดค่าใช้จ่ายจริงของร้าน ไม่ใช่บันทึกที่ย้อนได้ฟรี
    const ok = await pacesConfirm.question(
      'สร้างพัสดุที่ iShip',
      'ระบบจะเปิดพัสดุจริงกับขนส่งตามค่าที่กรอกไว้ — มีค่าใช้จ่ายจริงกับบัญชี iShip ของร้าน',
      { confirmButtonText: 'สร้างพัสดุ', cancelButtonText: 'ไม่ใช่ตอนนี้' },
    )
    if (!ok) return

    setBusy(true)
    try {
      const res = await fetch('/api/seller/iship/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderToken,
          receiver: form,
          override: {
            ...(courierCode ? { courierCode } : {}),
            ...(numOrUndefined(weight) != null ? { weight: numOrUndefined(weight) } : {}),
            ...(numOrUndefined(width) != null ? { width: numOrUndefined(width) } : {}),
            ...(numOrUndefined(length) != null ? { length: numOrUndefined(length) } : {}),
            ...(numOrUndefined(height) != null ? { height: numOrUndefined(height) } : {}),
            ...(categoryId !== '' ? { categoryId: Number(categoryId) } : {}),
            ...(numOrUndefined(codAmount) != null ? { codAmount: numOrUndefined(codAmount) } : {}),
            ...(remark.trim() !== '' ? { remark } : {}),
            options: {
              onTime,
              boxShield,
              isInsured,
              ...(isInsured && numOrUndefined(productValue) != null
                ? { productValue: numOrUndefined(productValue) }
                : {}),
            },
          },
        }),
        cache: 'no-store',
      })

      // มีพัสดุที่ยังใช้งานอยู่แล้ว — ไม่ใช่ความผิดพลาดของร้าน ไม่ต้องขึ้น toast แดง
      // ให้ผู้เรียกโหลดสถานะจริงมาแสดงแทน
      if (res.status === 409) {
        onExists()
        return
      }
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }

      const body = (await res.json()) as ShipmentViewJson
      if (body.status === 'CREATED') pacesToast.success('สร้างพัสดุสำเร็จ')
      else pacesToast.error(body.lastErrorMessage ?? 'สร้างพัสดุไม่สำเร็จ')
      onCreated(body)
    } catch {
      pacesToast.error('สร้างพัสดุไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      {/* ── ผู้รับ ─────────────────────────────────────────────── */}
      <section className="border-b-8 border-default-100 p-4">
        <header className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="tabler:user" className="text-sm" aria-hidden="true" />
          </span>
          <h6 className="mb-0 text-sm font-semibold text-default-900">ผู้รับ</h6>
          <span className="ms-auto text-xs text-default-400">บันทึกกลับเข้าคำสั่งซื้อ</span>
        </header>

        <div className="mb-2.5">
          <label className="form-label" htmlFor="rcv-name">
            ชื่อผู้รับ
          </label>
          <input
            id="rcv-name"
            type="text"
            className={`form-input${isMissing('ชื่อผู้รับ') ? ' is-invalid' : ''}`}
            aria-describedby={isMissing('ชื่อผู้รับ') ? 'rcv-name-err' : undefined}
            value={form.name ?? ''}
            onChange={(e) => setField('name', e.target.value)}
          />
          {isMissing('ชื่อผู้รับ') && (
            <p id="rcv-name-err" className="mb-0 mt-1 text-xs text-danger">
              จำเป็นสำหรับเปิดพัสดุ
            </p>
          )}
        </div>

        <div className="mb-2.5">
          <label className="form-label" htmlFor="rcv-phone">
            เบอร์โทรผู้รับ
          </label>
          <input
            id="rcv-phone"
            type="tel"
            inputMode="numeric"
            className={`form-input${isMissing('เบอร์โทรผู้รับ') ? ' is-invalid' : ''}`}
            aria-describedby={isMissing('เบอร์โทรผู้รับ') ? 'rcv-phone-err' : undefined}
            value={form.phone ?? ''}
            onChange={(e) => setField('phone', e.target.value)}
          />
          {isMissing('เบอร์โทรผู้รับ') && (
            <p id="rcv-phone-err" className="mb-0 mt-1 text-xs text-danger">
              จำเป็นสำหรับเปิดพัสดุ
            </p>
          )}
        </div>

        <div className="mb-2.5">
          <label className="form-label" htmlFor="rcv-line1">
            ที่อยู่ (บ้านเลขที่ / ถนน)
          </label>
          <input
            id="rcv-line1"
            type="text"
            className={`form-input${isMissing('ที่อยู่') ? ' is-invalid' : ''}`}
            aria-describedby={isMissing('ที่อยู่') ? 'rcv-line1-err' : undefined}
            value={form.line1 ?? ''}
            onChange={(e) => setField('line1', e.target.value)}
          />
          {isMissing('ที่อยู่') && (
            <p id="rcv-line1-err" className="mb-0 mt-1 text-xs text-danger">
              จำเป็นสำหรับเปิดพัสดุ
            </p>
          )}
        </div>

        {/*
          ใช้ sheet ไม่ใช่ dropdown: โมดัลในแชทมี transform-gpu ซึ่งทำให้ลูกที่เป็น position:fixed
          ยึดกับโมดัลแทน viewport — panel แบบ portal จะวางตำแหน่งเพี้ยนในพื้นที่แคบ
          และการให้ร้านพิมพ์ตำบล/อำเภอเองคือจุดที่สลับกันแล้วไม่มีอะไรฟ้อง (BR-ISHIP-31)
        */}
        <div>
          <label className="form-label" id="rcv-locality-label">
            ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์
          </label>
          <button
            type="button"
            onClick={() => setAddrOpen(true)}
            aria-labelledby="rcv-locality-label"
            aria-describedby={localityMissing ? 'rcv-locality-err' : undefined}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left ${
              localityMissing ? 'border-danger/60 bg-danger/5' : 'border-default-300'
            }`}
          >
            <Icon
              icon="tabler:map-pin"
              className={`size-4 shrink-0 ${hasLocality ? 'text-primary' : 'text-default-400'}`}
              aria-hidden="true"
            />
            {hasLocality ? (
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold text-default-900">
                  ต.{form.subdistrict || '—'} · อ.{form.district || '—'}
                </span>
                <span className="block text-xs text-default-500">
                  {form.province || '—'} · {form.postcode || '—'}
                </span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 text-sm text-default-400">
                แตะเพื่อเลือกตำบล / อำเภอ / จังหวัด
              </span>
            )}
            <Icon icon="tabler:chevron-right" className="size-4 shrink-0 text-default-400" aria-hidden="true" />
          </button>
          {localityMissing && (
            <p id="rcv-locality-err" className="mb-0 mt-1 text-xs text-danger">
              ยังไม่ได้เลือก — จำเป็นสำหรับเปิดพัสดุ
            </p>
          )}
        </div>
      </section>

      {/* ── พัสดุ ──────────────────────────────────────────────── */}
      <section className="border-b-8 border-default-100 p-4">
        <header className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="tabler:package" className="text-sm" aria-hidden="true" />
          </span>
          <h6 className="mb-0 text-sm font-semibold text-default-900">พัสดุ</h6>
          <span className="ms-auto text-xs text-default-400">ค่าตั้งต้นของร้าน</span>
        </header>

        <div className="mb-2.5">
          <label className="form-label" htmlFor="shp-courier">
            ขนส่ง
          </label>
          <select
            id="shp-courier"
            className="form-select"
            value={courierCode}
            onChange={(e) => setCourierCode(e.target.value)}
          >
            <option value="">ใช้ขนส่งค่าตั้งต้นของร้าน</option>
            {couriers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {couriersError && (
            <p className="mb-0 mt-1 text-xs text-default-400">
              โหลดรายชื่อขนส่งไม่ได้ — จะใช้ขนส่งค่าตั้งต้นของร้าน
            </p>
          )}
        </div>

        <div className="mb-2.5">
          <label className="form-label" htmlFor="shp-weight">
            น้ำหนัก (กก.)
          </label>
          <input
            id="shp-weight"
            type="number"
            step="0.1"
            min="0.01"
            className="form-input"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>

        {boxes.length > 0 && (
          <div className="mb-2.5">
            <label className="form-label" htmlFor="shp-box">
              กล่องที่ใช้ประจำ
            </label>
            <select
              id="shp-box"
              className="form-select"
              defaultValue=""
              onChange={(e) => {
                const box = boxes.find((b) => String(b.id) === e.target.value)
                if (!box) return
                setWidth(String(box.width))
                setLength(String(box.length))
                setHeight(String(box.height))
              }}
            >
              <option value="">เลือกเพื่อเติมขนาดให้อัตโนมัติ (หรือกรอกเองด้านล่าง)</option>
              {ownBoxes.length > 0 ? (
                <>
                  <optgroup label="กล่องของร้าน">
                    {ownBoxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.width}x{b.length}x{b.height} ซม.
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="กล่องมาตรฐาน iShip">
                    {standardBoxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.width}x{b.length}x{b.height} ซม.
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : (
                standardBoxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.width}x{b.length}x{b.height} ซม.
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        <div className="mb-2.5">
          <label className="form-label" htmlFor="shp-width">
            ขนาดกล่อง (กว้าง × ยาว × สูง · ซม.)
          </label>
          <div className="grid grid-cols-3 gap-2">
            <input
              id="shp-width"
              type="number"
              min="1"
              className="form-input"
              aria-label="กว้าง (ซม.)"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
            <input
              type="number"
              min="1"
              className="form-input"
              aria-label="ยาว (ซม.)"
              value={length}
              onChange={(e) => setLength(e.target.value)}
            />
            <input
              type="number"
              min="1"
              className="form-input"
              aria-label="สูง (ซม.)"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="form-label" htmlFor="shp-category">
            ประเภทสินค้า
          </label>
          <select
            id="shp-category"
            className="form-select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">ใช้ประเภทค่าตั้งต้นของร้าน</option>
            {ISHIP_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ── เพิ่มเติม ──────────────────────────────────────────── */}
      {/* React state ไม่ใช่ hs-accordion: โมดัลในแชทถูกซ่อนด้วย hidden ตอนย่อ (ไม่ unmount)
          Preline init ตอน mount เท่านั้น จึงไม่ทำงานหลังขยายกลับ (precedent: CustomerPanel tabs) */}
      <section className="border-b-8 border-default-100 p-4">
        <button
          type="button"
          onClick={() => setExtraOpen((v) => !v)}
          aria-expanded={extraOpen}
          aria-controls="shp-extra"
          className="flex w-full items-center gap-2 rounded-lg border border-default-200 bg-default-50 px-3 py-2.5 text-left"
        >
          <Icon icon="tabler:adjustments" className="size-4 shrink-0 text-default-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-default-700">
            เพิ่มเติม — เก็บเงินปลายทาง · หมายเหตุ · ประกัน
          </span>
          <Icon
            icon="tabler:chevron-down"
            className={`ms-auto size-4 shrink-0 text-default-400${extraOpen ? ' rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {extraOpen && (
          <div id="shp-extra" className="mt-3 flex flex-col gap-2.5">
            <div>
              <label className="form-label" htmlFor="shp-cod">
                เก็บเงินปลายทาง (บาท)
              </label>
              <input
                id="shp-cod"
                type="number"
                min="0"
                className="form-input"
                placeholder={defaults.codEnabled ? 'ร้านเปิด COD ไว้เป็นค่าเริ่มต้น' : 'ไม่เก็บเงินปลายทาง'}
                value={codAmount}
                onChange={(e) => setCodAmount(e.target.value)}
              />
              <p className="mb-0 mt-1 text-xs text-default-400">เว้นว่างหรือ 0 = ไม่เก็บเงินปลายทาง</p>
            </div>

            <div>
              <label className="form-label" htmlFor="shp-remark">
                หมายเหตุถึงคนส่งของ
              </label>
              <input
                id="shp-remark"
                type="text"
                className="form-input"
                placeholder="เช่น โทรก่อนส่ง"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={onTime}
                onChange={(e) => setOnTime(e.target.checked)}
              />
              ใช้บริการส่งตรงเวลา
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={boxShield}
                onChange={(e) => setBoxShield(e.target.checked)}
              />
              ประกันกล่องพัสดุ
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="form-checkbox"
                checked={isInsured}
                onChange={(e) => setIsInsured(e.target.checked)}
              />
              ประกันสินค้า
            </label>
            {isInsured && (
              <div className="ps-6">
                <label className="form-label" htmlFor="shp-product-value">
                  มูลค่าสินค้าที่เอาประกัน (บาท)
                </label>
                <input
                  id="shp-product-value"
                  type="number"
                  min="1"
                  className="form-input"
                  value={productValue}
                  onChange={(e) => setProductValue(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {extraFields && (
        <section className="border-b-8 border-default-100 p-4">{extraFields({ courierName })}</section>
      )}

      {/* ตรวจก่อนสร้างพัสดุ — สรุปสิ่งที่ "มาจากที่อื่น" (ผู้ส่งจากการตั้งค่า + สินค้าจากออเดอร์)
          คู่กับผู้รับที่กำลังพิมพ์ ไม่ทวนน้ำหนัก/ขนาด/COD ซ้ำเพราะร้านเพิ่งกรอกเองด้านบน */}
      <section className="border-b-8 border-default-100 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="tabler:clipboard-check" className="text-sm" aria-hidden="true" />
          </span>
          <h6 className="mb-0 text-sm font-semibold text-default-900">ตรวจก่อนสร้างพัสดุ</h6>
          <span className="ms-auto text-xs text-default-400">กวาดตาก่อนกดสร้าง</span>
        </div>

        <div className="rounded-lg border border-dashed border-default-300 bg-default-50 p-3">
          {liveMissing.length > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">
              <Icon icon="tabler:alert-circle" className="mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <span>ผู้รับยังกรอกไม่ครบ {liveMissing.length} ช่อง — เลื่อนขึ้นไปกรอกด้านบนก่อนกดสร้าง</span>
            </p>
          )}

          <ReviewParty icon="tabler:building-store" label="จาก (ผู้ส่ง)" party={sender} />

          <div className="flex w-6 justify-center py-1.5">
            <Icon icon="tabler:arrow-down" className="text-base text-default-300" aria-hidden="true" />
          </div>

          <ReviewParty
            icon="tabler:map-pin"
            label="ถึง (ผู้รับ)"
            party={{
              name: form.name,
              phone: form.phone,
              address: form.line1,
              subdistrict: form.subdistrict,
              district: form.district,
              province: form.province,
              postcode: form.postcode,
            }}
            missing={liveMissing}
          />

          <div className="mt-3 border-t border-dashed border-default-300 pt-3">
            <p className="mb-2 text-xs text-default-400">สินค้าในคำสั่งซื้อ</p>
            {items.length === 0 ? (
              <p className="mb-0 text-sm text-default-400">ไม่มีรายการสินค้าในคำสั่งซื้อนี้</p>
            ) : (
              <>
                <ul className="mb-0 flex list-none flex-col gap-1.5 ps-0">
                  {(itemsOpen ? items : items.slice(0, 3)).map((it) => (
                    <li key={it.id} className="flex items-start gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-default-700">{it.name}</span>
                      <span className="shrink-0 text-default-500">×{it.qty}</span>
                      <span className="shrink-0 font-semibold text-default-900">
                        ฿{(it.price * it.qty).toLocaleString('th-TH')}
                      </span>
                    </li>
                  ))}
                </ul>

                {items.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setItemsOpen((v) => !v)}
                    className="btn mt-1.5 inline-flex items-center gap-1 p-0 text-xs text-primary hover:underline"
                  >
                    <Icon
                      icon="tabler:chevron-down"
                      className={`text-sm transition-transform ${itemsOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                    {itemsOpen ? 'ย่อ' : `ดูเพิ่มเติม (+${items.length - 3} รายการ)`}
                  </button>
                )}

                <div className="mt-2 flex items-center justify-between border-t border-dashed border-default-300 pt-2 text-sm">
                  <span className="text-default-500">รวมสินค้า {itemCount} ชิ้น</span>
                  <span className="font-semibold text-default-900">
                    ฿{itemsSubtotal.toLocaleString('th-TH')}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="p-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="btn inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? (
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Icon icon="tabler:package-export" className="text-base" aria-hidden="true" />
          )}
          {submitLabel}
        </button>
        <p className="mb-0 mt-2 text-center text-xs text-default-400">
          ข้อมูลผู้รับที่กรอกจะถูกบันทึกลงคำสั่งซื้อด้วย · มีค่าใช้จ่ายจริงกับบัญชี iShip ของร้าน
        </p>
      </div>

      <AddressSearchSheet
        open={addrOpen}
        current={
          hasLocality
            ? {
                subdistrict: form.subdistrict ?? '',
                district: form.district ?? '',
                province: form.province ?? '',
                postcode: form.postcode ?? '',
              }
            : null
        }
        onSelect={(loc: SelectedLocality) =>
          setForm((f) => ({
            ...f,
            subdistrict: loc.subdistrict,
            district: loc.district,
            province: loc.province,
            postcode: loc.postcode,
          }))
        }
        onClose={() => setAddrOpen(false)}
      />
    </div>
  )
}
