'use client'

/**
 * ShippingSettingsRow — แถว iShip ในหน้า "บัญชีที่เชื่อมต่อ" + โมดัลทั้ง 3 (feature 00022)
 *
 * user request 2026-07-29: ยกเลิกหน้า /settings/shipping ทั้งหน้า เอาการตั้งค่ามาอยู่แถวเดียว
 * ในหน้านี้ แล้วแยกโมดัลตาม action — เดิมเป็นหน้าเต็มที่มีการ์ด 3 ใบเรียงยาว และปุ่มบันทึก
 * อยู่ล่างสุดจนต้องเลื่อนหาว่าจะเซฟยังไง
 *
 * โมดัล 3 ตัว (ทั้งหมด lazy — เปิดเมื่อกดเท่านั้น):
 *   เชื่อมต่อ  — สถานะ/ทดสอบ/ยกเลิกการเชื่อมต่อ/วาง token
 *   เรียกรถ    — จำนวนกล่อง + บอกว่าจะเรียกขนส่งเจ้าไหน (เดิมเป็น Swal ที่มี input ในตัว)
 *   ตั้งค่า     — 3 แท็บ (ที่อยู่ผู้ส่ง / ค่าตั้งต้นพัสดุ / โหมดการสร้างพัสดุ) + validate + submit เดียว
 *
 * Base: settings/shipping/ShippingClient.tsx (ฟอร์ม/handler ทั้งหมด port มา 1:1 — ไม่เขียนใหม่)
 *       settings/ConnectedAccountsClient.tsx (โครงแถว: logo slot + label + badge + ปุ่มขวา)
 *       inbox/[conversationId]/components/CustomerPanel.tsx (tab ด้วย React state + ArrowLeft/Right)
 *       components/safepay/iship/IShipModalShell.tsx (เปลือกโมดัล)
 *       theme/paces/Admin/TS/src/app/(admin)/forms/elements/components/InputTextfieldType.tsx
 *         (form-label / form-input / form-select)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { formatDateTime } from '@/lib/format-date'
import { ISHIP_CATEGORIES } from '@/lib/iship/mapping'
import IShipModalShell from '@/components/safepay/iship/IShipModalShell'

// ─── Types (รูปเดียวกับที่ ShippingClient เคยรับ) ────────────────────────────

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
    icon: 'help-circle',
  },
  {
    value: 'AUTO',
    label: 'สร้างพัสดุอัตโนมัติ',
    hint: 'เปิดพัสดุให้ทันทีที่บันทึกคำสั่งซื้อที่เข้าเงื่อนไข โดยไม่ถาม — มีค่าใช้จ่ายจริงทุกครั้ง',
    icon: 'bolt',
  },
  {
    value: 'OFF',
    label: 'ปิดไว้ก่อน',
    hint: 'ไม่ทำอะไรอัตโนมัติ กดสร้างพัสดุเองได้จากหน้ารายละเอียดคำสั่งซื้อ',
    icon: 'player-pause',
  },
]

type TabKey = 'sender' | 'parcel' | 'mode'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'sender', label: 'ที่อยู่ผู้ส่ง', icon: 'map-pin' },
  { key: 'parcel', label: 'ค่าตั้งต้นพัสดุ', icon: 'package' },
  { key: 'mode', label: 'โหมดการสร้าง', icon: 'settings-automation' },
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

/** ช่องที่ผิด → ข้อความไทย (ว่าง = ผ่านหมด) พร้อมบอกว่าอยู่แท็บไหนเพื่อพาไปให้ถูกที่ */
type FieldErrors = Partial<Record<keyof SettingsState, string>>

const FIELD_TAB: Partial<Record<keyof SettingsState, TabKey>> = {
  senderPhone: 'sender',
  senderPostcode: 'sender',
  defaultWeight: 'parcel',
  defaultWidth: 'parcel',
  defaultLength: 'parcel',
  defaultHeight: 'parcel',
  optProductValue: 'parcel',
}

/**
 * validateSettings — สะท้อนกฎของ IShipSettingsSchema ฝั่ง backend
 *
 * ทุกช่อง "ไม่บังคับกรอก" โดยเจตนา — ความครบถ้วนบังคับตอนจะเปิดพัสดุ (BR-ISHIP-30)
 * ไม่ใช่ตอนบันทึกการตั้งค่า ร้านจึงทยอยกรอกได้ แต่ถ้ากรอกแล้วต้องถูกรูปแบบ
 */
function validateSettings(s: SettingsState): FieldErrors {
  const e: FieldErrors = {}
  const num = (v: number | null) => (v === null || Number.isNaN(v) ? null : v)

  if (s.senderPhone && !/^0[0-9]{9}$/.test(s.senderPhone.trim())) {
    e.senderPhone = 'เบอร์โทรไม่ถูกต้อง — กรอกเบอร์ 10 หลัก ขึ้นต้นด้วย 0'
  }
  if (s.senderPostcode && !/^[0-9]{5}$/.test(s.senderPostcode.trim())) {
    e.senderPostcode = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก'
  }
  const w = num(s.defaultWeight)
  if (w !== null && (w < 0.01 || w > 100)) {
    e.defaultWeight = 'น้ำหนักต้องอยู่ระหว่าง 0.01–100 กก.'
  }
  for (const k of ['defaultWidth', 'defaultLength', 'defaultHeight'] as const) {
    const v = num(s[k])
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > 300)) {
      e[k] = 'ต้องเป็นจำนวนเต็ม 1–300 ซม.'
    }
  }
  // กฎเดียวที่เป็น cross-field และ backend ปฏิเสธจริง (settings/route.ts) — ข้อความตรงกัน
  if (s.optIsInsured && !num(s.optProductValue)) {
    e.optProductValue = 'เปิดประกันสินค้าแล้วต้องระบุมูลค่าสินค้าที่ต้องการเอาประกัน'
  }
  return e
}

/** โลโก้ iShip — ไฟล์อาจยังไม่มีจริง จึงต้องมี fallback ไม่ให้เห็นรูปพัง
 *  Base: inbox/components/ChannelBadge.tsx (BadgeImage — useState + onError) */
function IShipLogo() {
  const [failed, setFailed] = useState(false)
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-default-200 ${
        failed ? 'bg-primary/10' : 'bg-white'
      }`}
    >
      {failed ? (
        <Icon icon="truck-delivery" className="text-lg text-primary" aria-hidden="true" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/images/logos/iship.jpeg"
          alt="iShip"
          className="size-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ShippingSettingsRow({
  isOwner,
  initialConnection,
  initialSettings,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [connection, setConnection] = useState(initialConnection)
  const [settings, setSettings] = useState<SettingsState | null>(initialSettings)
  const [modal, setModal] = useState<'connect' | 'pickup' | 'settings' | null>(null)

  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)

  const [tab, setTab] = useState<TabKey>('sender')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [dirty, setDirty] = useState(false)

  const [parcelCount, setParcelCount] = useState('1')
  const [pickupBusy, setPickupBusy] = useState(false)

  const [couriers, setCouriers] = useState<Courier[]>([])
  const [boxes, setBoxes] = useState<Box[]>([])
  const refLoaded = useRef(false)

  const isActive = connection.connected && connection.status !== 'TOKEN_INVALID'

  // รายชื่อขนส่ง/กล่องโหลดตอนเปิดโมดัลตั้งค่าครั้งแรกเท่านั้น — แถวนี้ mount ทุกครั้งที่เข้า
  // /settings การยิง 2 endpoint ไป iShip ทุกครั้งทั้งที่ร้านไม่ได้เปิดโมดัลคือค่าใช้จ่ายเปล่า
  useEffect(() => {
    if (modal !== 'settings' || refLoaded.current || !connection.connected) return
    refLoaded.current = true
    void (async () => {
      const [c, b] = await Promise.all([
        fetch('/api/seller/iship/couriers', { cache: 'no-store' }),
        fetch('/api/seller/iship/boxes', { cache: 'no-store' }),
      ])
      if (c.ok) setCouriers((await c.json()) as Courier[])
      if (b.ok) setBoxes((await b.json()) as Box[])
    })()
  }, [modal, connection.connected])

  // deep-link จากหน้าคำสั่งซื้อ/แชท (SenderIncompleteNotice) — เปิดโมดัลที่แท็บที่ต้องแก้เลย
  // ไม่ใช่ทิ้งร้านไว้ที่ /settings แล้วให้ไล่หาปุ่มเอง แล้วล้าง query ทิ้ง (pattern เดียวกับ ?linked=)
  useEffect(() => {
    if (searchParams.get('iship') !== 'settings') return
    const t = searchParams.get('tab')
    setTab(t === 'parcel' || t === 'mode' ? t : 'sender')
    setModal(connection.connected ? 'settings' : 'connect')
    router.replace('/settings')
  }, [searchParams, connection.connected, router])

  const patch = useCallback((p: Partial<SettingsState>) => {
    setSettings((s) => (s ? { ...s, ...p } : s))
    setDirty(true)
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
      setModal(null)
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
    const ok = await pacesConfirm.danger(
      'ยกเลิกการเชื่อมต่อ iShip',
      'หลังจากนี้จะเปิดพัสดุและพิมพ์ใบปะหน้าจากที่นี่ไม่ได้ — ประวัติพัสดุที่เคยสร้างไว้ยังอยู่ครบ',
      { confirmButtonText: 'ยกเลิกการเชื่อมต่อ' },
    )
    if (!ok) return

    const res = await fetch('/api/seller/iship/connection', {
      method: 'DELETE',
      cache: 'no-store',
    })
    if (!res.ok) {
      pacesToast.error(await readError(res))
      return
    }
    setModal(null)
    pacesToast.success('ยกเลิกการเชื่อมต่อแล้ว')
    router.refresh()
  }

  // ── บันทึกค่าตั้งต้น ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!settings) return

    const found = validateSettings(settings)
    setErrors(found)
    const keys = Object.keys(found) as (keyof SettingsState)[]
    if (keys.length > 0) {
      // พาไปแท็บแรกที่มีปัญหาแล้วโฟกัสช่องนั้น — ถ้าไม่ทำ ร้านจะกดบันทึกแล้วไม่มีอะไรเกิดขึ้น
      // เพราะช่องที่ผิดอยู่คนละแท็บที่มองไม่เห็น
      const firstTab = TABS.find((t) => keys.some((k) => FIELD_TAB[k] === t.key))
      if (firstTab) {
        setTab(firstTab.key)
        pacesToast.error(`ตรวจสอบข้อมูลในแท็บ "${firstTab.label}" — มีบางช่องยังไม่ถูกต้อง`)
        const firstField = keys.find((k) => FIELD_TAB[k] === firstTab.key)
        // รอให้แท็บ render ก่อนค่อยโฟกัส (ช่องที่ซ่อนอยู่โฟกัสไม่ได้)
        if (firstField) {
          setTimeout(() => document.getElementById(`iship-${firstField}`)?.focus(), 0)
        }
      }
      return
    }

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
      setDirty(false)
      setModal(null)
      pacesToast.success('บันทึกการตั้งค่าแล้ว')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function closeSettings() {
    if (dirty) {
      const ok = await pacesConfirm.warning(
        'ปิดโดยไม่บันทึก?',
        'การเปลี่ยนแปลงที่ยังไม่ได้บันทึกจะหายไป',
        { confirmButtonText: 'ปิดเลย', cancelButtonText: 'กลับไปแก้ไข' },
      )
      if (!ok) return
      setSettings(initialSettings)
      setErrors({})
      setDirty(false)
    }
    setModal(null)
  }

  // ── เรียกรถเข้ารับ ───────────────────────────────────────────────────────
  function openPickup() {
    if (!settings?.defaultCourierCode) {
      pacesToast.warning('กรุณาเลือกขนส่งเริ่มต้นก่อน')
      return
    }
    setParcelCount('1')
    setModal('pickup')
  }

  async function handlePickup() {
    if (!settings?.defaultCourierCode || pickupBusy) return
    const count = Number(parcelCount)
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      pacesToast.warning('จำนวนกล่องต้องเป็นจำนวนเต็ม 1–100')
      return
    }
    setPickupBusy(true)
    try {
      const res = await fetch('/api/seller/iship/pickups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courierCode: settings.defaultCourierCode,
          parcelCount: count,
        }),
        cache: 'no-store',
      })
      if (!res.ok) {
        pacesToast.error(await readError(res))
        return
      }
      const body = (await res.json()) as { timeoutAtText?: string | null }
      setModal(null)
      pacesToast.success(
        body.timeoutAtText
          ? `เรียกรถสำเร็จ — เข้ารับ ${body.timeoutAtText}`
          : 'เรียกรถเข้ารับสำเร็จแล้ว',
      )
    } finally {
      setPickupBusy(false)
    }
  }

  // ── สถานะการเชื่อมต่อ ────────────────────────────────────────────────────
  const statusBadge = !connection.connected ? (
    <span className="inline-flex items-center gap-1 rounded bg-default-200/50 px-2 py-0.5 text-xs font-medium text-default-500">
      <Icon icon="plug-off" className="text-xs" aria-hidden="true" />
      ยังไม่ได้เชื่อมต่อ
    </span>
  ) : connection.status === 'TOKEN_INVALID' ? (
    <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
      <Icon icon="alert-triangle" className="text-xs" aria-hidden="true" />
      ต้องต่ออายุ Token
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
      <Icon icon="circle-check" className="text-xs" aria-hidden="true" />
      เชื่อมต่อแล้ว
    </span>
  )

  const tabHasError = (key: TabKey) =>
    (Object.keys(errors) as (keyof SettingsState)[]).some((k) => FIELD_TAB[k] === key)

  function onTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.key === tab)
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length
    setTab(TABS[next].key)
  }

  /** ข้อความ error ใต้ช่อง — ผูกกับ input ด้วย aria-describedby */
  const fieldError = (k: keyof SettingsState) =>
    errors[k] ? (
      <p id={`iship-${k}-err`} className="mb-0 mt-1 text-xs text-danger">
        {errors[k]}
      </p>
    ) : null

  const inputCls = (k: keyof SettingsState) => `form-input${errors[k] ? ' is-invalid' : ''}`

  return (
    <>
      {/* ── แถวในการ์ด "การจัดส่ง" ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <IShipLogo />
          <div className="min-w-0">
            <p className="mb-0 text-sm font-medium text-default-800">เชื่อมต่อ iShip</p>
            <p className="mb-0 mt-0.5 text-sm text-default-500">
              เปิดพัสดุจากคำสั่งซื้อและพิมพ์ใบปะหน้าได้จากที่นี่
            </p>
            <span className="mt-1 inline-block">{statusBadge}</span>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {!connection.connected ? (
            <button
              type="button"
              onClick={() => setModal('connect')}
              className="btn btn-sm inline-flex flex-1 items-center justify-center gap-1.5 bg-primary/15 py-2.5 text-primary hover:bg-primary/25 sm:flex-none"
            >
              <Icon icon="plug-connected" className="text-base" aria-hidden="true" />
              เชื่อมต่อ
            </button>
          ) : (
            <>
              {isActive ? (
                <button
                  type="button"
                  onClick={openPickup}
                  className="btn btn-sm inline-flex flex-1 items-center justify-center gap-1.5 border border-default-300 py-2.5 sm:flex-none"
                >
                  <Icon icon="truck" className="text-base" aria-hidden="true" />
                  เรียกรถ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setModal('connect')}
                  className="btn btn-sm inline-flex flex-1 items-center justify-center gap-1.5 bg-warning/15 py-2.5 text-warning hover:bg-warning/25 sm:flex-none"
                >
                  <Icon icon="plug-connected" className="text-base" aria-hidden="true" />
                  ต่ออายุ Token
                </button>
              )}
              <button
                type="button"
                onClick={() => setModal('settings')}
                className={`btn btn-sm inline-flex flex-1 items-center justify-center gap-1.5 py-2.5 sm:flex-none ${
                  isActive
                    ? 'bg-primary/15 text-primary hover:bg-primary/25'
                    : 'border border-default-300'
                }`}
              >
                <Icon icon="settings" className="text-base" aria-hidden="true" />
                ตั้งค่า
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── โมดัลเชื่อมต่อ ─────────────────────────────────────────────── */}
      {modal === 'connect' && (
        <IShipModalShell title="เชื่อมต่อ iShip" size="md" onClose={() => setModal(null)}>
          {connection.connected && (
            <div className="mb-4 border-b border-default-200 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                {statusBadge}
                {connection.tokenLast4 && (
                  <span className="text-xs text-default-400">
                    ลงท้ายด้วย ...{connection.tokenLast4}
                  </span>
                )}
              </div>
              {connection.lastVerifiedAt && (
                <p className="mb-0 mt-1 text-xs text-default-400">
                  ตรวจสอบล่าสุด {formatDateTime(new Date(connection.lastVerifiedAt))}
                </p>
              )}
              {isOwner && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={verifying}
                    className="btn btn-sm inline-flex items-center gap-1.5 bg-primary/15 py-2.5 text-primary hover:bg-primary/25 disabled:opacity-50"
                  >
                    {verifying ? (
                      <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <Icon icon="refresh" className="text-base" aria-hidden="true" />
                    )}
                    ทดสอบการเชื่อมต่อ
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="btn btn-sm inline-flex items-center gap-1.5 bg-danger/15 py-2.5 text-danger hover:bg-danger/25"
                  >
                    <Icon icon="plug-off" className="text-base" aria-hidden="true" />
                    ยกเลิกการเชื่อมต่อ
                  </button>
                </div>
              )}
            </div>
          )}

          {isOwner && (!connection.connected || connection.status === 'TOKEN_INVALID') && (
            <div>
              <p className="mb-3 text-sm text-default-500">
                เข้าไปที่หลังบ้าน iShip แล้วคัดลอก Token ของบัญชีร้าน มาวางในช่องด้านล่าง
                ระบบจะทดสอบให้ก่อนบันทึกทุกครั้ง
              </p>
              <label className="form-label" htmlFor="iship-token">
                Token จาก iShip
              </label>
              <div className="flex gap-2">
                {/* _forms.css ไม่ห่อ @layer → width util บน .form-input ไม่มีผล ต้องใช้ .input-group ครอบ */}
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
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="btn btn-icon shrink-0 border border-default-300"
                  aria-label={showToken ? 'ซ่อน Token' : 'แสดง Token'}
                >
                  <Icon icon={showToken ? 'eye-off' : 'eye'} className="text-base" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="btn mt-3 inline-flex w-full items-center justify-center gap-2 bg-primary p-3 text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {connecting ? (
                  <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon icon="plug-connected" className="text-base" aria-hidden="true" />
                )}
                ทดสอบและบันทึก
              </button>
            </div>
          )}

          {!isOwner && (
            <p className="mb-0 flex items-center gap-2 rounded-lg bg-default-200/40 px-3 py-2.5 text-sm text-default-600">
              <Icon icon="lock" className="shrink-0 text-base" aria-hidden="true" />
              เฉพาะเจ้าของร้านเท่านั้นที่ตั้งค่าการเชื่อมต่อได้
            </p>
          )}
        </IShipModalShell>
      )}

      {/* ── โมดัลเรียกรถ ───────────────────────────────────────────────── */}
      {modal === 'pickup' && settings && (
        <IShipModalShell
          title="เรียกรถเข้ารับพัสดุ"
          size="sm"
          onClose={() => setModal(null)}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={pickupBusy}
                className="btn inline-flex items-center justify-center border border-default-300 py-2.5 text-default-700 disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handlePickup}
                disabled={pickupBusy}
                className="btn inline-flex items-center justify-center gap-2 bg-primary py-2.5 text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {pickupBusy ? (
                  <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon icon="truck" className="text-base" aria-hidden="true" />
                )}
                เรียกรถ
              </button>
            </div>
          }
        >
          <p className="mb-3 text-sm text-default-500">
            พนักงานขนส่งจะมารับที่อยู่ผู้ส่งที่ตั้งไว้
          </p>
          <p className="mb-4 flex items-center gap-2 rounded-lg bg-info/15 px-3 py-2.5 text-sm text-info">
            <Icon icon="truck-delivery" className="shrink-0 text-base" aria-hidden="true" />
            ขนส่ง:{' '}
            {couriers.find((c) => c.code === settings.defaultCourierCode)?.name ??
              settings.defaultCourierCode}{' '}
            (ค่าตั้งต้น)
          </p>
          <label className="form-label" htmlFor="iship-parcel-count">
            จำนวนกล่องที่จะส่ง
          </label>
          <input
            id="iship-parcel-count"
            type="number"
            min="1"
            max="100"
            className="form-input"
            value={parcelCount}
            onChange={(e) => setParcelCount(e.target.value)}
          />
        </IShipModalShell>
      )}

      {/* ── โมดัลตั้งค่า (3 แท็บ) ──────────────────────────────────────── */}
      {modal === 'settings' && settings && (
        <IShipModalShell
          title="ตั้งค่าการจัดส่ง"
          size="2xl"
          onClose={closeSettings}
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeSettings}
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
          }
        >
          {/* nav-tabs นอก card-header ต้องคุม margin/border เอง (precedent CustomerPanel) */}
          <div
            role="tablist"
            aria-label="หมวดการตั้งค่า"
            onKeyDown={onTabKeyDown}
            className="nav-tabs -mx-5 mb-4 flex h-auto gap-1 border-b border-default-200 px-5"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={tab === t.key}
                aria-controls={`iship-panel-${t.key}`}
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${
                  tab === t.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-default-500 hover:text-default-800'
                }`}
              >
                <Icon icon={t.icon} className="text-base" aria-hidden="true" />
                {t.label}
                {tabHasError(t.key) && (
                  <span
                    className="size-1.5 rounded-full bg-danger"
                    aria-label="มีข้อมูลที่ยังไม่ถูกต้อง"
                  />
                )}
              </button>
            ))}
          </div>

          {/* ทุกแท็บ mount ค้างไว้ ซ่อนด้วย hidden — unmount แล้วค่าที่กรอกในแท็บอื่นจะหาย */}
          <div
            id="iship-panel-sender"
            role="tabpanel"
            className={tab === 'sender' ? '' : 'hidden'}
          >
            {!connection.senderComplete && (
              <p className="mb-4 flex items-center gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-sm text-warning">
                <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
                กรอกที่อยู่ผู้ส่งให้ครบก่อน จึงจะเปิดพัสดุได้
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="iship-senderName">ชื่อผู้ส่ง</label>
                <input id="iship-senderName" type="text" className="form-input" maxLength={120}
                  value={settings.senderName ?? ''}
                  onChange={(e) => patch({ senderName: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor="iship-senderPhone">เบอร์โทรผู้ส่ง</label>
                <input id="iship-senderPhone" type="tel" inputMode="numeric" className={inputCls('senderPhone')}
                  aria-describedby={errors.senderPhone ? 'iship-senderPhone-err' : undefined}
                  value={settings.senderPhone ?? ''}
                  onChange={(e) => patch({ senderPhone: e.target.value })} />
                {fieldError('senderPhone')}
              </div>
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="iship-senderAddress">ที่อยู่ (บ้านเลขที่ / ถนน)</label>
                <input id="iship-senderAddress" type="text" className="form-input"
                  value={settings.senderAddress ?? ''}
                  onChange={(e) => patch({ senderAddress: e.target.value })} />
              </div>
              {/*
                ป้ายกำกับต้องเขียนให้ชัดว่าช่องไหนคือระดับไหน — ระบบขนส่งเรียก "ตำบล" ว่า
                district ส่วนเราเรียก "อำเภอ" ว่า district ถ้าคนกรอกสลับช่อง พัสดุจะไปผิดตำบล
                โดยไม่มีอะไรฟ้อง (BR-ISHIP-31)
              */}
              <div>
                <label className="form-label" htmlFor="iship-senderSubdistrict">ตำบล / แขวง</label>
                <input id="iship-senderSubdistrict" type="text" className="form-input"
                  value={settings.senderSubdistrict ?? ''}
                  onChange={(e) => patch({ senderSubdistrict: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor="iship-senderDistrict">อำเภอ / เขต</label>
                <input id="iship-senderDistrict" type="text" className="form-input"
                  value={settings.senderDistrict ?? ''}
                  onChange={(e) => patch({ senderDistrict: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor="iship-senderProvince">จังหวัด</label>
                <input id="iship-senderProvince" type="text" className="form-input"
                  value={settings.senderProvince ?? ''}
                  onChange={(e) => patch({ senderProvince: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor="iship-senderPostcode">รหัสไปรษณีย์</label>
                <input id="iship-senderPostcode" type="text" inputMode="numeric" maxLength={5}
                  className={inputCls('senderPostcode')}
                  aria-describedby={errors.senderPostcode ? 'iship-senderPostcode-err' : undefined}
                  value={settings.senderPostcode ?? ''}
                  onChange={(e) => patch({ senderPostcode: e.target.value })} />
                {fieldError('senderPostcode')}
              </div>
            </div>
          </div>

          <div
            id="iship-panel-parcel"
            role="tabpanel"
            className={tab === 'parcel' ? '' : 'hidden'}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="iship-courier">ขนส่งที่ใช้ประจำ</label>
                <select id="iship-courier" className="form-select"
                  value={settings.defaultCourierCode ?? ''}
                  onChange={(e) => patch({ defaultCourierCode: e.target.value || null })}>
                  <option value="">เลือกขนส่ง</option>
                  {couriers.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor="iship-category">ประเภทสินค้า</label>
                <select id="iship-category" className="form-select"
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
                <label className="form-label" htmlFor="iship-box">กล่องที่ใช้ประจำ</label>
                <select id="iship-box" className="form-select" defaultValue=""
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
                <label className="form-label" htmlFor="iship-defaultWeight">น้ำหนัก (กก.)</label>
                <input id="iship-defaultWeight" type="number" step="0.1" min="0.01"
                  className={inputCls('defaultWeight')}
                  aria-describedby={errors.defaultWeight ? 'iship-defaultWeight-err' : undefined}
                  value={settings.defaultWeight ?? ''}
                  onChange={(e) => patch({ defaultWeight: e.target.value === '' ? null : Number(e.target.value) })} />
                {fieldError('defaultWeight')}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="form-label" htmlFor="iship-defaultWidth">กว้าง</label>
                  <input id="iship-defaultWidth" type="number" min="1" className={inputCls('defaultWidth')}
                    value={settings.defaultWidth ?? ''}
                    onChange={(e) => patch({ defaultWidth: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="form-label" htmlFor="iship-defaultLength">ยาว</label>
                  <input id="iship-defaultLength" type="number" min="1" className={inputCls('defaultLength')}
                    value={settings.defaultLength ?? ''}
                    onChange={(e) => patch({ defaultLength: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <label className="form-label" htmlFor="iship-defaultHeight">สูง</label>
                  <input id="iship-defaultHeight" type="number" min="1" className={inputCls('defaultHeight')}
                    value={settings.defaultHeight ?? ''}
                    onChange={(e) => patch({ defaultHeight: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
              </div>
              {(errors.defaultWidth || errors.defaultLength || errors.defaultHeight) && (
                <p className="mb-0 text-xs text-danger sm:col-span-2">ต้องเป็นจำนวนเต็ม 1–300 ซม.</p>
              )}

              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="iship-defaultRemark">หมายเหตุถึงคนส่งของ</label>
                <input id="iship-defaultRemark" type="text" className="form-input" placeholder="เช่น ห้ามโยน"
                  value={settings.defaultRemark ?? ''}
                  onChange={(e) => patch({ defaultRemark: e.target.value })} />
              </div>
            </div>

            <p className="mb-0 mt-4 flex items-center gap-2 rounded-lg bg-info/15 px-3 py-2.5 text-sm text-info">
              <Icon icon="info-circle" className="shrink-0 text-base" aria-hidden="true" />
              ขนาดและน้ำหนักที่กรอกเป็นค่าที่ร้านแจ้ง ขนส่งอาจชั่งจริงแล้วคิดค่าส่งต่างจากนี้
            </p>

            {/* บริการเสริม */}
            <div className="mt-4 flex flex-col gap-3 border-t border-default-200 pt-4">
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
                  <label className="form-label" htmlFor="iship-optProductValue">
                    มูลค่าสินค้าที่เอาประกัน (บาท)
                  </label>
                  <input id="iship-optProductValue" type="number" min="1"
                    className={inputCls('optProductValue')}
                    aria-describedby={errors.optProductValue ? 'iship-optProductValue-err' : undefined}
                    value={settings.optProductValue ?? ''}
                    onChange={(e) => patch({ optProductValue: e.target.value === '' ? null : Number(e.target.value) })} />
                  {fieldError('optProductValue')}
                </div>
              )}
            </div>
          </div>

          <div
            id="iship-panel-mode"
            role="tabpanel"
            className={tab === 'mode' ? 'flex flex-col gap-2' : 'hidden'}
          >
            {CREATE_MODES.map((m) => (
              <label
                key={m.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                  settings.createMode === m.value
                    ? 'border-primary bg-primary/10'
                    : 'border-default-200'
                }`}
              >
                <input type="radio" name="iship-create-mode" className="form-radio mt-0.5"
                  checked={settings.createMode === m.value}
                  onChange={() => patch({ createMode: m.value })} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-default-800">
                    <Icon icon={m.icon} className="text-base" aria-hidden="true" />
                    {m.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-default-500">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </IShipModalShell>
      )}
    </>
  )
}
