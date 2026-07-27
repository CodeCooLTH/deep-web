'use client'

/**
 * ShippingClient — UI ของหน้า "การจัดส่ง" (/settings/shipping, feature 00022)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx
 *   — โครงแถว (icon + label + badge สถานะ + ปุ่ม action), Sweet Alerts confirm ก่อนถอด,
 *     pacesToast, ปุ่ม `btn bg-primary text-white hover:bg-primary-hover`
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   — Swal.fire + buttonsStyling: false + customClass
 * Base: theme/paces/Admin/TS/src/app/(admin)/forms/elements/components/InputTextfieldType.tsx
 *   — form-label / form-input / form-select
 *
 * Toast: pacesToast เท่านั้น (Hard Rule 9)
 * Modal ที่ต้องกดตอบ: Sweet Alerts (Hard Rule 8)
 * Paces primitive เท่านั้น ห้าม arbitrary value (Hard Rule 7)
 * ห้าม emoji — icon จาก @iconify/react tabler เท่านั้น (Hard Rule 12)
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import Swal from 'sweetalert2'
import { pacesToast } from '@/lib/paces-toast'
import { ISHIP_CATEGORIES } from '@/lib/iship/mapping'
import { formatDateTime } from '@/lib/format-date'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConnectionState {
  connected: boolean
  status: string | null
  tokenLast4: string | null
  lastVerifiedAt: string | null
  senderComplete: boolean
  settingsComplete: boolean
  createMode: string
}

interface SettingsState {
  senderName: string | null
  senderPhone: string | null
  senderAddress: string | null
  senderSubdistrict: string | null
  senderDistrict: string | null
  senderProvince: string | null
  senderPostcode: string | null
  defaultCourierCode: string | null
  defaultWeight: number | null
  defaultWidth: number | null
  defaultLength: number | null
  defaultHeight: number | null
  defaultCategoryId: number | null
  defaultCodEnabled: boolean
  optOnTime: boolean
  optBoxShield: boolean
  optIsInsured: boolean
  optProductValue: number | null
  optServiceType: number | null
  defaultRemark: string | null
  createMode: string
}

interface Props {
  isOwner: boolean
  initialConnection: ConnectionState
  initialSettings: SettingsState | null
}

interface Courier {
  code: string
  name: string
}
interface Box {
  id: number
  name: string
  width: number
  length: number
  height: number
}

// ─── โหมดการสร้างพัสดุ ───────────────────────────────────────────────────────
// คำอธิบายใต้ตัวเลือกบอก "จะเกิดอะไรขึ้นจริง ๆ" ไม่ใช่แค่ชื่อโหมด — เพราะเลือกผิด
// แล้วผลคือเงินจริงของร้าน (FR-ISHIP-012)

const CREATE_MODES = [
  {
    value: 'ASK',
    label: 'ถามทุกครั้ง',
    hint: 'สร้างคำสั่งซื้อเสร็จ ระบบจะถามยืนยันก่อน ให้ตรวจข้อมูลและแก้ได้ก่อนเปิดพัสดุ',
    icon: 'tabler:help-circle',
  },
  {
    value: 'AUTO',
    label: 'สร้างพัสดุอัตโนมัติ',
    hint: 'เปิดพัสดุให้ทันทีที่บันทึกคำสั่งซื้อที่เข้าเงื่อนไข โดยไม่ถาม — มีค่าใช้จ่ายจริงทุกครั้ง',
    icon: 'tabler:bolt',
  },
  {
    value: 'OFF',
    label: 'ปิดไว้ก่อน',
    hint: 'ไม่ทำอะไรอัตโนมัติ กดสร้างพัสดุเองได้จากหน้ารายละเอียดคำสั่งซื้อ',
    icon: 'tabler:player-pause',
  },
]

// ─── helper ─────────────────────────────────────────────────────────────────

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    return body.error?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
  }
}

const swalConfirm = (opts: { title: string; html: string; confirmText: string; danger?: boolean }) =>
  Swal.fire({
    title: opts.title,
    html: opts.html,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: opts.confirmText,
    cancelButtonText: 'ยกเลิก',
    buttonsStyling: false,
    customClass: {
      confirmButton: opts.danger
        ? 'btn bg-danger text-white hover:bg-danger/90'
        : 'btn bg-primary text-white hover:bg-primary-hover',
      cancelButton: 'btn border-default-300 ms-2',
    },
  })

// ─── Component ──────────────────────────────────────────────────────────────

export function ShippingClient({ isOwner, initialConnection, initialSettings }: Props) {
  const router = useRouter()
  const [connection, setConnection] = useState(initialConnection)
  const [settings, setSettings] = useState<SettingsState | null>(initialSettings)

  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const [couriers, setCouriers] = useState<Courier[]>([])
  const [boxes, setBoxes] = useState<Box[]>([])

  // โหลดรายชื่อขนส่ง/กล่องจากบัญชีจริงของร้าน (ไม่ใช่รายการที่เขียนตายในโค้ด —
  // แต่ละบัญชีเปิดใช้ขนส่งไม่เหมือนกัน)
  useEffect(() => {
    if (!connection.connected) return
    void (async () => {
      const [c, b] = await Promise.all([
        fetch('/api/seller/iship/couriers', { cache: 'no-store' }),
        fetch('/api/seller/iship/boxes', { cache: 'no-store' }),
      ])
      if (c.ok) setCouriers((await c.json()) as Courier[])
      if (b.ok) setBoxes((await b.json()) as Box[])
    })()
  }, [connection.connected])

  const patch = useCallback((p: Partial<SettingsState>) => {
    setSettings((s) => (s ? { ...s, ...p } : s))
  }, [])

  // ── เชื่อมต่อ ────────────────────────────────────────────────────────────
  async function handleConnect() {
    if (!token.trim()) {
      pacesToast.warning('กรุณาวาง Token ที่ได้จากหลังบ้าน iShip')
      return
    }
    setConnecting(true)
    try {
      const res = await fetch('/api/seller/iship/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      setToken('')
      pacesToast.success('เชื่อมต่อ iShip สำเร็จ')
      router.refresh()
    } finally {
      setConnecting(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    try {
      const res = await fetch('/api/seller/iship/connection/verify', {
        method: 'POST',
        cache: 'no-store',
      })
      const body = (await res.json()) as ConnectionState & { error?: { message?: string } }
      if (!res.ok) {
        pacesToast.error(body.error?.message ?? 'ทดสอบการเชื่อมต่อไม่สำเร็จ')
        router.refresh()
        return
      }
      setConnection(body)
      if (body.status === 'ACTIVE') pacesToast.success('การเชื่อมต่อใช้งานได้ตามปกติ')
      else pacesToast.warning('Token ใช้งานไม่ได้แล้ว กรุณานำ Token ใหม่มาใส่')
    } finally {
      setVerifying(false)
    }
  }

  async function handleDisconnect() {
    const result = await swalConfirm({
      title: 'ยกเลิกการเชื่อมต่อ iShip',
      html: 'หลังจากนี้จะเปิดพัสดุและพิมพ์ใบปะหน้าจากที่นี่ไม่ได้<br/>ประวัติพัสดุที่เคยสร้างไว้ยังอยู่ครบ',
      confirmText: 'ยกเลิกการเชื่อมต่อ',
      danger: true,
    })
    if (!result.isConfirmed) return

    const res = await fetch('/api/seller/iship/connection', {
      method: 'DELETE',
      cache: 'no-store',
    })
    if (!res.ok) {
      pacesToast.error(await readError(res))
      return
    }
    pacesToast.success('ยกเลิกการเชื่อมต่อแล้ว')
    router.refresh()
  }

  // ── บันทึกค่าตั้งต้น ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/seller/iship/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      pacesToast.success('บันทึกการตั้งค่าแล้ว')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  // ── เรียกรถเข้ารับ ───────────────────────────────────────────────────────
  async function handlePickup() {
    if (!settings?.defaultCourierCode) {
      pacesToast.warning('กรุณาเลือกขนส่งเริ่มต้นก่อน')
      return
    }
    const { value, isConfirmed } = await Swal.fire({
      title: 'เรียกรถเข้ารับพัสดุ',
      html: 'พนักงานขนส่งจะมารับที่อยู่ผู้ส่งที่ตั้งไว้',
      input: 'number',
      inputLabel: 'จำนวนกล่องที่จะส่ง',
      inputValue: '1',
      inputAttributes: { min: '1', max: '100' },
      showCancelButton: true,
      confirmButtonText: 'เรียกรถ',
      cancelButtonText: 'ยกเลิก',
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-primary text-white hover:bg-primary-hover',
        cancelButton: 'btn border-default-300 ms-2',
      },
    })
    if (!isConfirmed) return

    const res = await fetch('/api/seller/iship/pickups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courierCode: settings.defaultCourierCode,
        parcelCount: Number(value) || 1,
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      pacesToast.error(await readError(res))
      return
    }
    const body = (await res.json()) as { timeoutAtText?: string | null; staffName?: string | null }
    pacesToast.success(
      body.timeoutAtText
        ? `เรียกรถสำเร็จ — เข้ารับ ${body.timeoutAtText}`
        : 'เรียกรถเข้ารับสำเร็จแล้ว',
    )
  }

  // ── สถานะการเชื่อมต่อ ────────────────────────────────────────────────────
  const statusBadge = !connection.connected ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-default-500 bg-default-200/50 px-2 py-0.5 rounded">
      <Icon icon="tabler:plug-off" className="text-xs" aria-hidden="true" />
      ยังไม่ได้เชื่อมต่อ
    </span>
  ) : connection.status === 'TOKEN_INVALID' ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning/15 px-2 py-0.5 rounded">
      <Icon icon="tabler:alert-triangle" className="text-xs" aria-hidden="true" />
      ต้องต่ออายุ Token
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success/15 px-2 py-0.5 rounded">
      <Icon icon="tabler:circle-check" className="text-xs" aria-hidden="true" />
      เชื่อมต่อแล้ว
    </span>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* ── การ์ดที่ 1: การเชื่อมต่อ ───────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium w-full justify-center">
            <Icon icon="tabler:truck-delivery" className="text-base" aria-hidden="true" />
            เชื่อมต่อ iShip
          </h5>
        </div>

        <div className="card-body">
          <div className="flex flex-col gap-3 pb-4 border-b border-default-200 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-default-800">บัญชีขนส่ง iShip</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {statusBadge}
                {connection.tokenLast4 && (
                  <span className="text-xs text-default-400">
                    ลงท้ายด้วย ...{connection.tokenLast4}
                  </span>
                )}
              </div>
              {connection.lastVerifiedAt && (
                <p className="text-xs text-default-400 mt-1">
                  ตรวจสอบล่าสุด {formatDateTime(new Date(connection.lastVerifiedAt))}
                </p>
              )}
            </div>

            {connection.connected && isOwner && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying}
                  className="btn btn-sm bg-primary/15 text-primary hover:bg-primary/25 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Icon icon="tabler:refresh" className="text-base" aria-hidden="true" />
                  ทดสอบการเชื่อมต่อ
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="btn btn-sm bg-danger/15 text-danger hover:bg-danger/25 inline-flex items-center gap-1.5"
                >
                  <Icon icon="tabler:plug-off" className="text-base" aria-hidden="true" />
                  ยกเลิกการเชื่อมต่อ
                </button>
              </div>
            )}
          </div>

          {/* ฟอร์มวาง token — แสดงเมื่อยังไม่เชื่อม หรือ token ใช้ไม่ได้แล้ว */}
          {isOwner && (!connection.connected || connection.status === 'TOKEN_INVALID') && (
            <div className="pt-4">
              <p className="text-sm text-default-500 mb-3">
                เข้าไปที่หลังบ้าน iShip แล้วคัดลอก Token ของบัญชีร้าน มาวางในช่องด้านล่าง
                ระบบจะทดสอบให้ก่อนบันทึกทุกครั้ง
              </p>
              <label className="form-label" htmlFor="iship-token">
                Token จาก iShip
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="input-group flex-1">
                  <input
                    id="iship-token"
                    type={showToken ? 'text' : 'password'}
                    className="form-input"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="วาง Token ที่นี่"
                    autoComplete="off"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="btn border-default-300 inline-flex items-center gap-2"
                    aria-label={showToken ? 'ซ่อน Token' : 'แสดง Token'}
                  >
                    <Icon
                      icon={showToken ? 'tabler:eye-off' : 'tabler:eye'}
                      className="text-base"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting}
                    className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:opacity-60"
                  >
                    {connecting ? (
                      <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    ) : (
                      <Icon icon="tabler:plug-connected" className="text-base" aria-hidden="true" />
                    )}
                    ทดสอบและบันทึก
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isOwner && (
            <p className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg bg-default-200/40 text-default-600 text-sm">
              <Icon icon="tabler:lock" className="text-base shrink-0" aria-hidden="true" />
              เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่าการเชื่อมต่อได้
            </p>
          )}
        </div>
      </div>

      {/* ── การ์ดที่ 2: ที่อยู่ผู้ส่ง + ค่าตั้งต้น ─────────────────────── */}
      {connection.connected && settings && (
        <>
          <div className="card">
            <div className="card-header">
              <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium w-full justify-center">
                <Icon icon="tabler:map-pin" className="text-base" aria-hidden="true" />
                ที่อยู่ผู้ส่ง
              </h5>
            </div>
            <div className="card-body">
              {!connection.senderComplete && (
                <p className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-lg bg-warning/15 text-warning text-sm">
                  <Icon icon="tabler:alert-triangle" className="text-base shrink-0" aria-hidden="true" />
                  กรอกที่อยู่ผู้ส่งให้ครบก่อน จึงจะเปิดพัสดุได้
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="form-label" htmlFor="sender-name">ชื่อผู้ส่ง</label>
                  <input id="sender-name" type="text" className="form-input"
                    value={settings.senderName ?? ''}
                    onChange={(e) => patch({ senderName: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" htmlFor="sender-phone">เบอร์โทรผู้ส่ง</label>
                  <input id="sender-phone" type="tel" inputMode="numeric" className="form-input"
                    value={settings.senderPhone ?? ''}
                    onChange={(e) => patch({ senderPhone: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="form-label" htmlFor="sender-address">ที่อยู่ (บ้านเลขที่ / ถนน)</label>
                  <input id="sender-address" type="text" className="form-input"
                    value={settings.senderAddress ?? ''}
                    onChange={(e) => patch({ senderAddress: e.target.value })} />
                </div>
                {/*
                  ป้ายกำกับต้องเขียนให้ชัดว่าช่องไหนคือระดับไหน — ระบบขนส่งเรียก "ตำบล" ว่า
                  district ส่วนเราเรียก "อำเภอ" ว่า district ถ้าคนกรอกสลับช่อง พัสดุจะไปผิดตำบล
                  โดยไม่มีอะไรฟ้อง (BR-ISHIP-31)
                */}
                <div>
                  <label className="form-label" htmlFor="sender-subdistrict">ตำบล / แขวง</label>
                  <input id="sender-subdistrict" type="text" className="form-input"
                    value={settings.senderSubdistrict ?? ''}
                    onChange={(e) => patch({ senderSubdistrict: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" htmlFor="sender-district">อำเภอ / เขต</label>
                  <input id="sender-district" type="text" className="form-input"
                    value={settings.senderDistrict ?? ''}
                    onChange={(e) => patch({ senderDistrict: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" htmlFor="sender-province">จังหวัด</label>
                  <input id="sender-province" type="text" className="form-input"
                    value={settings.senderProvince ?? ''}
                    onChange={(e) => patch({ senderProvince: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" htmlFor="sender-postcode">รหัสไปรษณีย์</label>
                  <input id="sender-postcode" type="text" inputMode="numeric" maxLength={5} className="form-input"
                    value={settings.senderPostcode ?? ''}
                    onChange={(e) => patch({ senderPostcode: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium w-full justify-center">
                <Icon icon="tabler:package" className="text-base" aria-hidden="true" />
                ค่าเริ่มต้นของพัสดุ
              </h5>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="form-label" htmlFor="courier">ขนส่งที่ใช้ประจำ</label>
                  <select id="courier" className="form-select"
                    value={settings.defaultCourierCode ?? ''}
                    onChange={(e) => patch({ defaultCourierCode: e.target.value || null })}>
                    <option value="">เลือกขนส่ง</option>
                    {couriers.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="category">ประเภทสินค้า</label>
                  <select id="category" className="form-select"
                    value={settings.defaultCategoryId ?? ''}
                    onChange={(e) => patch({ defaultCategoryId: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">เลือกประเภท</option>
                    {ISHIP_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* เลือกกล่องมาตรฐานแล้วเติมขนาดให้ทั้ง 3 ช่องพร้อมกัน — เร็วกว่าให้กรอกเอง */}
                <div className="sm:col-span-2">
                  <label className="form-label" htmlFor="box">กล่องที่ใช้ประจำ</label>
                  <select id="box" className="form-select" defaultValue=""
                    onChange={(e) => {
                      const box = boxes.find((b) => String(b.id) === e.target.value)
                      if (box) patch({ defaultWidth: box.width, defaultLength: box.length, defaultHeight: box.height })
                    }}>
                    <option value="">เลือกเพื่อเติมขนาดให้อัตโนมัติ (หรือกรอกเองด้านล่าง)</option>
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — {b.width}x{b.length}x{b.height} ซม.
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" htmlFor="weight">น้ำหนัก (กก.)</label>
                  <input id="weight" type="number" step="0.1" min="0.01" className="form-input"
                    value={settings.defaultWeight ?? ''}
                    onChange={(e) => patch({ defaultWeight: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="form-label" htmlFor="width">กว้าง</label>
                    <input id="width" type="number" min="1" className="form-input"
                      value={settings.defaultWidth ?? ''}
                      onChange={(e) => patch({ defaultWidth: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="length">ยาว</label>
                    <input id="length" type="number" min="1" className="form-input"
                      value={settings.defaultLength ?? ''}
                      onChange={(e) => patch({ defaultLength: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="height">สูง</label>
                    <input id="height" type="number" min="1" className="form-input"
                      value={settings.defaultHeight ?? ''}
                      onChange={(e) => patch({ defaultHeight: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="form-label" htmlFor="remark">หมายเหตุถึงคนส่งของ</label>
                  <input id="remark" type="text" className="form-input" placeholder="เช่น ห้ามโยน"
                    value={settings.defaultRemark ?? ''}
                    onChange={(e) => patch({ defaultRemark: e.target.value })} />
                </div>
              </div>

              <p className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg bg-info/15 text-info text-sm">
                <Icon icon="tabler:info-circle" className="text-base shrink-0" aria-hidden="true" />
                ขนาดและน้ำหนักที่กรอกเป็นค่าที่ร้านแจ้ง ขนส่งอาจชั่งจริงแล้วคิดค่าส่งต่างจากนี้
              </p>

              {/* บริการเสริม */}
              <div className="mt-4 pt-4 border-t border-default-200 flex flex-col gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="form-checkbox" checked={settings.defaultCodEnabled}
                    onChange={(e) => patch({ defaultCodEnabled: e.target.checked })} />
                  เก็บเงินปลายทาง (COD) เป็นค่าเริ่มต้น
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="form-checkbox" checked={settings.optOnTime}
                    onChange={(e) => patch({ optOnTime: e.target.checked })} />
                  ใช้บริการส่งตรงเวลา
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="form-checkbox" checked={settings.optBoxShield}
                    onChange={(e) => patch({ optBoxShield: e.target.checked })} />
                  ประกันกล่องพัสดุ
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="form-checkbox" checked={settings.optIsInsured}
                    onChange={(e) => patch({ optIsInsured: e.target.checked })} />
                  ประกันสินค้า
                </label>
                {settings.optIsInsured && (
                  <div className="ps-6">
                    <label className="form-label" htmlFor="product-value">มูลค่าสินค้าที่เอาประกัน (บาท)</label>
                    <input id="product-value" type="number" min="1" className="form-input"
                      value={settings.optProductValue ?? ''}
                      onChange={(e) => patch({ optProductValue: e.target.value === '' ? null : Number(e.target.value) })} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── การ์ดที่ 3: โหมดการสร้างพัสดุ ─────────────────────────── */}
          <div className="card">
            <div className="card-header">
              <h5 className="bg-light/15 border-default-300 flex items-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium w-full justify-center">
                <Icon icon="tabler:settings-automation" className="text-base" aria-hidden="true" />
                เมื่อสร้างคำสั่งซื้อ
              </h5>
            </div>
            <div className="card-body flex flex-col gap-2">
              {CREATE_MODES.map((m) => (
                <label
                  key={m.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                    settings.createMode === m.value
                      ? 'border-primary bg-primary/10'
                      : 'border-default-200'
                  }`}
                >
                  <input type="radio" name="create-mode" className="form-radio mt-0.5"
                    checked={settings.createMode === m.value}
                    onChange={() => patch({ createMode: m.value })} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-default-800">
                      <Icon icon={m.icon} className="text-base" aria-hidden="true" />
                      {m.label}
                    </span>
                    <span className="block text-xs text-default-500 mt-0.5">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* ── แถบปุ่มล่าง ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <button type="button" onClick={handlePickup}
              className="btn border-default-300 inline-flex items-center justify-center gap-2">
              <Icon icon="tabler:truck" className="text-base" aria-hidden="true" />
              เรียกรถเข้ารับพัสดุ
            </button>
            {isOwner && (
              <button type="button" onClick={handleSave} disabled={saving}
                className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? (
                  <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <Icon icon="tabler:device-floppy" className="text-base" aria-hidden="true" />
                )}
                บันทึกการตั้งค่า
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
