'use client'

/**
 * LineChannelCard — การ์ด "LINE Official Account" ในหน้า /settings/channels (feature 00025, S-13)
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/channels/ChannelsClient.tsx
 *   — แถวช่องทาง (avatar+badge overlay+ชื่อ+badge สถานะ, ปุ่ม action ขวา), Sweet Alerts confirm
 *     ก่อน disconnect, DELETE /api/channels/{id} เดิม (endpoint เดียวกับ Messenger/IG)
 * Base: src/app/(paces)/seller/auth/sign-in/components/SignInForm.tsx บรรทัด 195-224
 *   — masked input pattern (input-icon-group + type=password + eye toggle ด้วย React state)
 * Base: theme/paces/Admin/TS/src/app/(admin)/plugins/sweet-alerts/components/SweetAlerts.tsx
 *   — Swal.fire + buttonsStyling:false + customClass
 * Base (overlay full-bleed logo): src/app/(paces)/seller/(chat)/inbox/components/ChannelBadge.tsx
 *   (ChannelBadgeOverlay) — โลโก้แบรนด์จริงเต็มวงกลม + ring-card แทนพื้นสี+ไอคอนขาว เพราะ LINE
 *   มี asset โลโก้จริงเหมือน Messenger/Instagram (ไม่ import component นั้นข้ามไปยัง (chat)/**
 *   ตามข้อห้ามของ task — ก็อปแค่โครง markup/class มาประกอบใหม่ในไฟล์นี้)
 * reuse ตรง: CopyLinkButton (orders/[token]/components/CopyLinkButton.tsx), BuyerAvatar
 *
 * ต่างจาก Messenger/IG (OAuth redirect → callback → confirm) ตรงที่ร้านวาง Channel secret +
 * Channel access token เอง (design spec ส่วน A) — ไม่มีขั้นตอน OAuth คั่นกลาง จึง flow เป็น
 * inline wizard ขยายในการ์ดเดียวกัน ไม่ใช่ modal/หน้าใหม่ (craft-floor: เนื้อหายาวไม่เข้าเกณฑ์ Swal)
 *
 * Toast: pacesToast (Hard Rule 9) — Modal: Sweet Alerts (confirm ก่อน disconnect + ack หลังถอด)
 * Paces primitive เท่านั้น — ห้าม arbitrary value (Hard Rule 7)
 * สี -ink token (text-danger-ink/text-warning-ink/text-info-ink/text-success-ink) ตามมติ Impeccable
 * 2026-08-03 — งานใหม่ยึด token ที่ผ่าน contrast จริง แม้ ChannelsClient.tsx (สร้างก่อนมติ) ยังใช้
 * text-success/text-danger เฉย ๆ (ดู design spec "Impeccable compliance" ส่วน A)
 *
 * known gap (แจ้ง Controller): listChannels() (shop-channel.service.ts) select fields ไม่รวม
 * basicId → แถวที่โหลดจาก initialChannels (page load ปกติ) จะไม่มี @handle ให้แสดง มีเฉพาะแถวที่
 * เพิ่งเชื่อม/reconnect สำเร็จในเซสชันนี้ (ได้ basicId จาก response ตรง ๆ) — ไม่แตะ service ตามข้อห้าม
 * ของ task (ห้ามแตะ route/service backend) ต้องให้ Controller ตัดสินใจว่าจะเพิ่ม `basicId: true`
 * ใน select ของ listChannels() เองภายหลังไหม (additive, ไม่กระทบ MESSENGER/INSTAGRAM ซึ่งเป็น null เสมอ)
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Swal from 'sweetalert2'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import BuyerAvatar from '../../orders/components/BuyerAvatar'
import CopyLinkButton from '../../orders/[token]/components/CopyLinkButton'
import RichMenuStatusRow from './RichMenuStatusRow'
import { type LineChannelHealth, daysUntilTokenExpiry } from '@/lib/line/channel-health'
import {
  describeLineChannelHealth,
  isGreenState,
  type LineHealthAction,
} from '@/lib/line/channel-health-presentation'
import { formatDate, formatDateTime } from '@/lib/format-date'

// ─── Types ─────────────────────────────────────────────────────────────────

/** shape ตรงกับ LineChannelView (src/services/shop-channel.service.ts) — field ที่ใช้จริงเท่านั้น */
export interface LineChannelRow {
  id: string
  name: string
  avatarUrl: string | null
  status: string // 'ACTIVE' | 'TOKEN_INVALID' — 'DISCONNECTED' ถูกกรองออกที่ listChannels() แล้ว
  /** @handle ของ OA — null เมื่อโหลดจาก listChannels() (ยังไม่ select คอลัมน์นี้ ดู known gap ด้านบน) */
  basicId: string | null
  /**
   * (ส่วนขยาย 2026-08-12) สถานะสุขภาพที่ **คำนวณมาจาก server แล้ว** ด้วย `resolveLineChannelHealth()`
   * — `null` = ยังไม่รู้ (เช่นเพิ่งเชื่อมเสร็จในเซสชันนี้ ยังไม่ได้ reload) ให้ถอยไปอ่าน `status`
   *
   * 🛑 client **ห้ามตัดสินสถานะเอง** (AC-CH-25) — กติกา "เขียว = ผ่านทุกด่าน" อยู่ในฟังก์ชัน
   * บริสุทธิ์ที่มีเทสคุม ถ้าเขียนซ้ำที่นี่จะมีสองนิยามที่ถูกทั้งคู่แต่ไม่ตรงกัน (HR16)
   */
  health?: LineChannelHealth | null
  /** ISO — ใช้เขียนวันที่บนป้าย TOKEN_EXPIRING */
  tokenExpiresAt?: string | null
}

/**
 * tone → คลาสของ Paces
 *
 * 🛑 map อยู่ที่นี่ ไม่ใช่ในไฟล์ presentation เพราะนั่นเป็น pure lib ที่ฝั่ง server ก็ import
 * (ห้ามลากคลาส Tailwind เข้าไป) — ส่วน *ความหมาย* ของ tone ถูกตัดสินไปแล้วที่นั่น
 */
const TONE_BADGE = {
  success: 'bg-success/15 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  danger: 'bg-danger/15 text-danger-ink',
} as const

const TONE_ACTION = {
  success: 'bg-success/15 text-success-ink hover:bg-success/25',
  warning: 'bg-warning/15 text-warning-ink hover:bg-warning/25',
  danger: 'bg-danger/15 text-danger-ink hover:bg-danger/25',
} as const

/** ผลจาก POST /api/channels/line/[channelId]/health */
interface HealthReport {
  verdict: 'PASS' | 'PASS_WITH_NOTE' | 'FAIL_SECRET' | 'FAIL_TOKEN' | 'FAIL_WEBHOOK'
  webhook: { state: string; endpoint: string | null; active: boolean; matchesUs: boolean } | null
  token: { state: string; expiresAt: string | null }
  inbound: { state: string; reason: string | null }
  checkedAt: string
}

const VERDICT_HEADLINE: Record<HealthReport['verdict'], string> = {
  PASS: 'เชื่อมต่อใช้งานได้ปกติ',
  PASS_WITH_NOTE: 'การตั้งค่าถูกต้อง แต่ยังไม่เห็นผลข้อความทดสอบชัดเจน',
  FAIL_SECRET: 'Channel secret ไม่ตรงกับ LINE',
  FAIL_TOKEN: 'Token ใช้งานไม่ได้แล้ว',
  FAIL_WEBHOOK: 'Webhook ยังไม่พร้อมรับข้อความ',
}

const VERDICT_TONE: Record<HealthReport['verdict'], 'success' | 'warning' | 'danger'> = {
  PASS: 'success',
  PASS_WITH_NOTE: 'warning',
  FAIL_SECRET: 'danger',
  FAIL_TOKEN: 'danger',
  FAIL_WEBHOOK: 'danger',
}

interface LineChannelCardProps {
  initialChannels: LineChannelRow[]
}

type WizardState = { mode: 'connect' } | { mode: 'reconnect'; channelId: string }

const CHAT_MODE_NOT_BOT_MESSAGE =
  'โหมดแชทของ LINE OA นี้ยังไม่ได้ตั้งเป็น Bot — ข้อความจากลูกค้าอาจไม่เข้า Deep จนกว่าจะเปลี่ยนที่ LINE Official Account Manager → การตั้งค่า → การตอบกลับ → โหมดแชท → Bot'

export function LineChannelCard({ initialChannels }: LineChannelCardProps) {
  const router = useRouter()
  const [channels, setChannels] = useState<LineChannelRow[]>(initialChannels)
  const [wizard, setWizard] = useState<WizardState | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  // แสดงเฉพาะ session ที่เพิ่งเชื่อม/reconnect — API ไม่ persist ค่านี้ (verify ซ้ำทีหลังไม่ได้โดยไม่ยิงใหม่)
  const [warningNotice, setWarningNotice] = useState<string | null>(null)
  // (ส่วนขยาย 2026-08-12) ผลปุ่ม "ทดสอบการเชื่อมต่อ" ต่อช่องทาง — เก็บใน state ไม่ persist
  // เพราะเป็นภาพ ณ วินาทีที่กด ไม่ใช่สถานะของระบบ (สถานะจริงอยู่บนป้ายที่ server คำนวณ)
  const [healthReports, setHealthReports] = useState<Record<string, HealthReport>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  const [webhookHelpId, setWebhookHelpId] = useState<string | null>(null)
  // deterministic — นิพจน์เดียวกับที่ Wizard ใช้ และตรงกับ webhookUrl(request) ฝั่ง route
  // 🛑 ต้องเป็นตัวเดียวกันทั้งสามที่ (แสดงให้คัดลอก / ส่งไป connect / เอาไปเทียบ) — HR16
  const [webhookUrl] = useState(() =>
    typeof window !== 'undefined' ? `${window.location.origin}/api/channels/line/webhook` : '',
  )

  /** ปุ่มทางออกของแต่ละสถานะ — เจตนามาจาก presentation SSOT หน้าจอแค่แปลเป็นการกระทำ */
  function handleHealthAction(channel: LineChannelRow, action: LineHealthAction) {
    if (action === 'FIX_SECRET' || action === 'UPDATE_TOKEN') {
      setWizard({ mode: 'reconnect', channelId: channel.id })
      return
    }
    if (action === 'SETUP_WEBHOOK') {
      // ไม่ใช่ modal ใหม่ — กางคำแนะนำ + URL ให้คัดลอกในที่เดียวกับที่ wizard ใช้อยู่แล้ว
      setWebhookHelpId((prev) => (prev === channel.id ? null : channel.id))
      return
    }
    if (action === 'ISSUE_LONG_LIVED') {
      // ขั้นตอนอยู่ที่คอนโซล LINE ทั้งหมด เราทำแทนไม่ได้ — บอกทางแล้วให้เขากลับมาวางที่ปุ่ม
      // "อัปเดต token" ของการ์ดนี้ (จงใจไม่พาไปที่อื่น เพราะปลายทางคือปุ่มที่อยู่ตรงนี้อยู่แล้ว)
      // info-only Swal — แพตเทิร์นเดียวกับตอนถอดสำเร็จในไฟล์นี้ (pacesConfirm ไม่มี variant
      // สำหรับ "บอกอย่างเดียวไม่ต้องยืนยัน" มีแค่ danger/warning/question ซึ่งผิดน้ำเสียงทั้งหมด)
      void Swal.fire({
        title: 'ออก token แบบไม่หมดอายุ',
        text: 'ไปที่ LINE Developers Console → Messaging API → Channel access token แล้วเลือก Issue แบบ long-lived จากนั้นนำมาวางที่ปุ่ม "อัปเดต token" ในการ์ดนี้',
        icon: 'info',
        showCancelButton: false,
        confirmButtonText: 'เข้าใจแล้ว',
        buttonsStyling: false,
        customClass: { confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2' },
      })
    }
  }

  async function handleTest(channelId: string) {
    setTestingId(channelId)
    try {
      const res = await fetch(`/api/channels/line/${channelId}/health`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        pacesToast.error(body?.error ?? 'ทดสอบไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      setHealthReports((prev) => ({ ...prev, [channelId]: body as HealthReport }))
      // 🛑 ไม่ router.refresh() ที่นี่ — ผลทดสอบอยู่ใน state ส่วนป้ายบนการ์ดมาจาก server
      // การรีเฟรชจะทำให้แผงผลที่เพิ่งขึ้นหายไปทันทีที่ผู้ใช้ยังไม่ทันอ่าน
    } catch {
      pacesToast.error('ทดสอบไม่สำเร็จ — เครือข่ายมีปัญหา กรุณาลองใหม่')
    } finally {
      setTestingId(null)
    }
  }

  function handleWizardSuccess(channel: LineChannelRow, warnings: string[]) {
    setChannels((prev) => {
      const exists = prev.some((c) => c.id === channel.id)
      return exists ? prev.map((c) => (c.id === channel.id ? channel : c)) : [...prev, channel]
    })
    setWizard(null)
    pacesToast.success('เชื่อม LINE OA สำเร็จ')
    setWarningNotice(warnings.includes('CHAT_MODE_NOT_BOT') ? CHAT_MODE_NOT_BOT_MESSAGE : null)
    router.refresh()
  }

  async function handleDisconnect(channel: LineChannelRow) {
    // Sweet Alert ยืนยัน — pattern จาก ChannelsClient.handleDisconnect เป๊ะ ต่างแค่ข้อความ (พูดถึง
    // "LINE OA" ไม่ใช่ "เพจ")
    const confirmResult = await Swal.fire({
      title: `ยกเลิกการเชื่อมต่อ ${channel.name}?`,
      text: 'ข้อความเก่ายังอยู่ แต่จะไม่ได้รับข้อความ LINE ใหม่จากบัญชีนี้อีก',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยกเลิกการเชื่อมต่อ',
      cancelButtonText: 'ปิด',
      showCloseButton: true,
      buttonsStyling: false,
      customClass: {
        confirmButton: 'btn bg-danger text-white hover:bg-danger-hover mt-2 me-2',
        cancelButton: 'btn bg-light text-default-700 hover:bg-light-hover mt-2',
      },
    })
    if (!confirmResult.isConfirmed) return

    setDisconnectingId(channel.id)
    try {
      const res = await fetch(`/api/channels/${channel.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        pacesToast.error(body?.error ?? 'ถอดการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      setChannels((prev) => prev.filter((c) => c.id !== channel.id))
      if (wizard?.mode === 'reconnect' && wizard.channelId === channel.id) setWizard(null)
      pacesToast.success('ถอดการเชื่อมต่อ LINE OA สำเร็จ')

      // Swal ที่สอง (info-only, ไม่มี cancel) — DELETE /api/channels/{id} ตอบแค่ { ok: true } ไม่มี
      // postAction.message ให้ใช้จริง (ตรวจ route แล้ว — ต่างจากที่ design spec สมมติไว้) จึงใช้
      // ข้อความคงที่ฝั่ง client แทน — toast อย่างเดียวหายเร็วเกินไปสำหรับ action-item ที่ร้านต้องไปทำเอง
      await Swal.fire({
        title: 'ถอดการเชื่อมต่อสำเร็จ',
        text: 'อย่าลืมไปปิด Webhook ของช่องทางนี้ใน LINE Developers Console ด้วย ไม่งั้น LINE จะยังพยายามส่งข้อความมาที่ระบบเดิมอยู่',
        icon: 'info',
        showCancelButton: false,
        confirmButtonText: 'รับทราบ',
        buttonsStyling: false,
        customClass: { confirmButton: 'btn bg-primary text-white hover:bg-primary-hover mt-2' },
      })
      router.refresh()
    } catch {
      pacesToast.error('ถอดการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setDisconnectingId(null)
    }
  }

  // (ส่วนขยาย 2026-08-12) แถบบนสุดต้องขึ้นเมื่อ **มีอะไรต้องแก้** ไม่ใช่เฉพาะตอน token ตาย —
  // ของเดิมเงียบสนิทเมื่อ webhook ปิดอยู่ ซึ่งเป็นเคสที่ข้อความลูกค้าหายทั้งหมด
  // 🛑 อ่านผ่าน isGreenState() ไม่ใช่เทียบ status เอง เพื่อให้ "อะไรคือปกติ" มีนิยามเดียวทั้งระบบ
  const unhealthy = channels.filter((c) => !isGreenState(c.health ?? (c.status === 'TOKEN_INVALID' ? 'TOKEN_INVALID' : 'HEALTHY')))
  const hasTokenInvalid = unhealthy.length > 0

  return (
    <div className="card-body">
      {/* ว่างเปล่า: คำอธิบาย + CTA — ปุ่มเชื่อมอยู่เฉพาะตอนยังไม่มีช่องทางเลย (ตาม wireframe ส่วน A) */}
      {channels.length === 0 && !wizard && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-default-500 text-sm">
            เชื่อม LINE OA ของร้านเพื่อรับและตอบข้อความ LINE จากอินบ็อกซ์เดียวกับช่องทางอื่น
          </p>
          <button
            type="button"
            onClick={() => setWizard({ mode: 'connect' })}
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex w-full shrink-0 items-center justify-center gap-2 sm:w-auto"
          >
            {/* โลโก้จริง LINE — brand asset (Hard Rule 6 carve-out), มีอยู่แล้วใน public/images/logos */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logos/line.svg" alt="" aria-hidden="true" width={16} height={16} className="shrink-0" />
            เชื่อม LINE OA
          </button>
        </div>
      )}

      {wizard?.mode === 'connect' && (
        <LineConnectWizard mode="connect" onCancel={() => setWizard(null)} onSuccess={handleWizardSuccess} />
      )}

      {channels.length > 0 && (
        <>
          {/* notice ถาวร 2 ข้อ — แสดงตลอดเวลาที่มี LINE เชื่อมอยู่ ไม่ dismiss */}
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-info/15 px-3 py-2.5 text-sm text-info-ink">
            <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <div className="min-w-0">
              <p className="mb-1 font-semibold">ก่อนเริ่มใช้งาน โปรดทราบ</p>
              <ul className="mb-0 ms-4 list-disc space-y-0.5">
                <li>การตอบผ่าน Deep ใช้โควตาข้อความ LINE ของร้าน ยกเว้นข้อความที่ตอบภายใน 1 นาทีแรก</li>
                <li>ข้อความที่ตอบจากแอป LINE OA เอง จะไม่ปรากฏในหน้านี้</li>
              </ul>
            </div>
          </div>

          {/* warning ไม่บล็อก — เฉพาะ session ที่เพิ่งเชื่อม/reconnect แล้ว LINE ตอบ chatMode ไม่ใช่ bot */}
          {warningNotice && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-sm text-warning-ink">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
              <p className="mb-0 min-w-0 flex-1">{warningNotice}</p>
              <button
                type="button"
                onClick={() => setWarningNotice(null)}
                aria-label="ปิดข้อความแจ้งเตือน"
                className="shrink-0 text-warning-ink hover:opacity-70"
              >
                <Icon icon="x" className="text-base" aria-hidden="true" />
              </button>
            </div>
          )}

          {hasTokenInvalid && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-danger/15 px-3 py-2.5 text-sm text-danger-ink">
              <Icon icon="alert-triangle" className="shrink-0 text-base" aria-hidden="true" />
              การเชื่อมต่อ LINE OA มีปัญหา — ดูรายละเอียดและวิธีแก้ที่ช่องทางด้านล่าง
            </div>
          )}

          <div className="mt-2">
            {channels.map((channel) => {
              const isDisconnecting = disconnectingId === channel.id
              const isTokenInvalid = channel.status === 'TOKEN_INVALID'
              const isReconnectingThis = wizard?.mode === 'reconnect' && wizard.channelId === channel.id

              // server คำนวณมาให้แล้ว — ไม่มีค่า (เพิ่งเชื่อมในเซสชันนี้ ยังไม่ reload) ให้ถอยไป
              // อ่าน status ซึ่งเป็นข้อเท็จจริงที่เรามีแน่ ๆ **ห้ามเดาว่า HEALTHY**
              const health: LineChannelHealth =
                channel.health ?? (isTokenInvalid ? 'TOKEN_INVALID' : 'HEALTHY')
              const expiresAt = channel.tokenExpiresAt ? new Date(channel.tokenExpiresAt) : null
              const view = describeLineChannelHealth(health, {
                expiryText: expiresAt ? formatDate(expiresAt) : null,
                daysLeft: expiresAt ? daysUntilTokenExpiry(expiresAt, Date.now()) : null,
              })
              const report = healthReports[channel.id] ?? null

              return (
                <div key={channel.id}>
                  <div className="flex flex-col gap-3 py-4 border-b border-default-200 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                    {/* ซ้าย: avatar + badge overlay + ชื่อ + basicId + badge สถานะ */}
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="relative shrink-0">
                        <BuyerAvatar src={channel.avatarUrl} name={channel.name} className="size-10" />
                        {/* overlay โลโก้ LINE เต็มวงกลม — pattern เดียวกับ ChannelBadgeOverlay ของ Messenger/IG
                            (โลโก้แบรนด์จริงแทนพื้นสี+ไอคอนขาว เพราะมี asset จริง) */}
                        <span className="absolute -bottom-1 -right-1 block size-4 overflow-hidden rounded-full ring-2 ring-card">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/images/logos/line.svg" alt="" aria-hidden="true" className="size-full object-cover" />
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-default-800 truncate">{channel.name}</p>
                        {channel.basicId && <p className="text-xs text-default-400 truncate">{channel.basicId}</p>}
                        {/* (ส่วนขยาย 2026-08-12) ป้ายสถานะ — แสดง **ตัวร้ายแรงสุดตัวเดียว**
                            ไม่ใช่รายการ 6 บรรทัด (AC-CH-23) และ **เขียวได้เฉพาะ HEALTHY เท่านั้น**
                            ของเดิมขึ้นเขียว "เชื่อมแล้ว" ทันทีที่ status='ACTIVE' ทั้งที่ webhook
                            อาจไม่เคยถูกตั้งเลย = ละเมิด Verified-Means-Green มาตลอด */}
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded mt-1 ${TONE_BADGE[view.tone]}`}
                        >
                          <Icon icon={view.icon} className="text-xs" aria-hidden="true" />
                          {view.label}
                        </span>
                        {view.detail && (
                          <p className="text-default-700 mt-1.5 text-xs">{view.detail}</p>
                        )}
                      </div>
                    </div>

                    {/* ขวา: ปุ่ม action */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {/* ทางออก 1 ปุ่มต่อสถานะ (AC-CH-23) — ไม่ใช่แค่ป้ายบอกอาการ
                          FIX_SECRET / UPDATE_TOKEN เปิด wizard reconnect ตัวเดิม ส่วน
                          SETUP_WEBHOOK / ISSUE_LONG_LIVED เป็นคำแนะนำ ไม่ต้องกรอกอะไรใหม่ */}
                      {view.action && view.actionLabel && (
                        <button
                          type="button"
                          onClick={() => handleHealthAction(channel, view.action)}
                          disabled={isReconnectingThis}
                          className={`btn btn-sm ${TONE_ACTION[view.tone]} inline-flex items-center gap-1.5 disabled:opacity-50 min-h-11 sm:min-h-0`}
                        >
                          <Icon icon={view.icon} className="text-sm" aria-hidden="true" />
                          {view.actionLabel}
                        </button>
                      )}
                      {/* ปุ่มทดสอบอยู่ **ทุกสถานะ** (D-CH-5 "กดซ้ำได้ทุกเมื่อ") */}
                      <button
                        type="button"
                        onClick={() => handleTest(channel.id)}
                        disabled={testingId === channel.id}
                        className="btn btn-sm bg-light text-default-700 inline-flex items-center gap-1.5 disabled:opacity-50 min-h-11 sm:min-h-0"
                      >
                        {testingId === channel.id ? (
                          <>
                            <span className="border-default-500 inline-block size-4 animate-spin rounded-full border-2 border-t-transparent" />
                            กำลังทดสอบ...
                          </>
                        ) : (
                          <>
                            <Icon icon="refresh" className="text-sm" aria-hidden="true" />
                            ทดสอบการเชื่อมต่อ
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isDisconnecting}
                        onClick={() => handleDisconnect(channel)}
                        className="btn btn-sm bg-danger/15 text-danger-ink hover:bg-danger/25 disabled:opacity-50"
                      >
                        {isDisconnecting ? (
                          <span className="size-4 border-2 border-danger border-t-transparent rounded-full animate-spin inline-block" />
                        ) : (
                          'ถอด'
                        )}
                      </button>
                    </div>
                  </div>

                  {/* (ส่วนขยาย 2026-08-12 / S2) แผงผลทดสอบ — 3 แถวเสมอ ไม่ใช่ข้อความก้อนเดียว
                      เพื่อให้ร้านเห็นว่า "ตั้งค่าถูก" กับ "รับได้จริง" เป็นคนละเรื่อง */}
                  {report && (
                    <div className="border-default-300 mb-4 overflow-hidden rounded-lg border">
                      <div
                        className={`flex items-start gap-2 px-3 py-2.5 text-sm font-medium ${TONE_BADGE[VERDICT_TONE[report.verdict]]}`}
                      >
                        <Icon
                          icon={report.verdict.startsWith('FAIL') ? 'alert-circle' : report.verdict === 'PASS' ? 'shield-check' : 'help-circle'}
                          className="mt-0.5 shrink-0 text-base"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">{VERDICT_HEADLINE[report.verdict]}</span>
                        <button
                          type="button"
                          onClick={() => setHealthReports((prev) => {
                            const next = { ...prev }
                            delete next[channel.id]
                            return next
                          })}
                          aria-label="ปิดผลการทดสอบ"
                          className="shrink-0 opacity-70 hover:opacity-100"
                        >
                          <Icon icon="x" className="text-sm" aria-hidden="true" />
                        </button>
                      </div>
                      <div className="bg-card px-3 py-2">
                        <HealthCheckRow label="Webhook" state={report.webhook?.state ?? 'INCONCLUSIVE'} text={webhookResultText(report)} />
                        <HealthCheckRow label="Channel access token" state={report.token.state} text={report.token.state === 'PASS' ? 'ใช้งานได้ปกติ' : 'Token ใช้งานไม่ได้แล้ว (ถูกเพิกถอนหรือหมดอายุ)'} />
                        <HealthCheckRow
                          label="ข้อความทดสอบ"
                          state={report.inbound.state}
                          text={inboundResultText(report)}
                        />
                      </div>
                      <div className="bg-card border-default-200 text-default-500 border-t px-3 py-2 text-xs">
                        ตรวจสอบล่าสุด {formatDateTime(report.checkedAt)}
                      </div>
                    </div>
                  )}

                  {/* คำแนะนำตั้ง Webhook — กางในที่เดียวกัน ไม่ใช่ modal ใหม่ */}
                  {webhookHelpId === channel.id && (
                    <div className="bg-info/15 text-info-ink mb-4 rounded-lg px-3 py-2.5 text-sm">
                      <p className="mb-2">
                        วาง Webhook URL ด้านล่างในแท็บ Messaging API ของ LINE Developers Console แล้วกด Verify
                        และเปิดสวิตช์ &ldquo;Use webhook&rdquo;
                      </p>
                      <CopyLinkButton value={webhookUrl} showPreview successMessage="คัดลอก Webhook URL แล้ว" />
                    </div>
                  )}

                  {/* เมนูลัดใน LINE (feature 00045) — แถวเต็มความกว้างใต้บล็อกข้อมูล+ปุ่มเดิม
                      ไม่แย่งที่กับปุ่ม "ถอด"/"เชื่อมต่อใหม่" ที่ชิดขวาอยู่แล้ว และคั่นด้วยเส้นประ
                      ตามภาษาการออกแบบของ Paces เพื่อบอกว่าเป็นคนละกลุ่มข้อมูล (ux Design Spec §A) */}
                  <RichMenuStatusRow channelId={channel.id} tokenInvalid={isTokenInvalid} />

                  {isReconnectingThis && (
                    <div className="pb-4">
                      <LineConnectWizard
                        mode="reconnect"
                        channelId={channel.id}
                        onCancel={() => setWizard(null)}
                        onSuccess={handleWizardSuccess}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Wizard (inline expand — ไม่ใช่ Swal/modal) ─────────────────────────────

interface LineConnectWizardProps {
  mode: 'connect' | 'reconnect'
  channelId?: string
  onCancel: () => void
  onSuccess: (channel: LineChannelRow, warnings: string[]) => void
}

function LineConnectWizard({ mode, channelId, onCancel, onSuccess }: LineConnectWizardProps) {
  const [channelSecret, setChannelSecret] = useState('')
  const [channelAccessToken, setChannelAccessToken] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // deterministic — ตรงกับ webhookUrl(request) ฝั่ง route (${origin}/api/channels/line/webhook)
  // คำนวณฝั่ง client ได้เพราะต้องโชว์ "ก่อน" ยิง connect (ร้านต้องเอาไปวางใน LINE Console ก่อน)
  const [webhookUrl] = useState(() =>
    typeof window !== 'undefined' ? `${window.location.origin}/api/channels/line/webhook` : '',
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(mode === 'connect' ? '/api/channels/line/connect' : `/api/channels/line/${channelId}`, {
        method: mode === 'connect' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelSecret, channelAccessToken }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // เซสชันหมดอายุ — 401 ของ route นี้ตอบ error:'unauthorized' (ไม่ใช่ข้อความไทย) ต้องผันเอง
        setError(res.status === 401 ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : (body?.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'))
        return
      }
      onSuccess(body.channel as LineChannelRow, (body.warnings as string[] | undefined) ?? [])
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pt-4">
      {mode === 'reconnect' && (
        <p className="mb-4 text-sm font-medium text-default-800">
          เชื่อมต่อ LINE OA อีกครั้ง — วาง Channel secret และ Channel access token ใหม่
        </p>
      )}

      <p className="mb-3 text-sm font-semibold text-default-800">ตั้งค่าใน LINE Developers Console</p>
      <ol className="space-y-3 text-sm text-default-700">
        <li className="flex gap-2.5">
          <span className="size-6 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
            1
          </span>
          <span>เข้า LINE Developers Console เลือกหรือสร้าง Messaging API channel ของร้าน</span>
        </li>
        <li className="flex gap-2.5">
          <span className="size-6 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
            2
          </span>
          <span>วาง Webhook URL ด้านล่างในแท็บ Messaging API แล้วกด Verify + เปิด &quot;Use webhook&quot;</span>
        </li>
        <li className="flex gap-2.5">
          <span className="size-6 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
            3
          </span>
          <span>ปิด Auto-reply message และ Greeting message ใน LINE Official Account Manager</span>
        </li>
        <li className="flex gap-2.5">
          <span className="size-6 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
            4
          </span>
          <span>คัดลอก Channel secret จากแท็บ Basic settings</span>
        </li>
        <li className="flex gap-2.5">
          <span className="size-6 shrink-0 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
            5
          </span>
          <span>ออก Channel access token (long-lived) แล้วคัดลอกมาวาง</span>
        </li>
      </ol>

      <form onSubmit={handleSubmit} noValidate className="mt-5 flex max-w-xl flex-col gap-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2.5 text-sm text-danger-ink">
            <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="form-label flex items-center gap-1.5">
            <Icon icon="link" className="text-default-400 text-sm" aria-hidden="true" />
            Webhook URL ของ Deep
          </label>
          <CopyLinkButton value={webhookUrl} showPreview successMessage="คัดลอก Webhook URL แล้ว" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Channel secret — masked ตั้งแต่พิมพ์ (type=password) ไม่ใช่แค่ตอนแสดงผลย้อนหลัง */}
          <div>
            <label htmlFor="line-channel-secret" className="form-label">
              Channel secret
              <span className="text-danger">*</span>
            </label>
            <div className="input-icon-group relative">
              <Icon icon="lock" className="input-icon" />
              <input
                id="line-channel-secret"
                type={showSecret ? 'text' : 'password'}
                autoComplete="off"
                placeholder="32 ตัวอักษร (a-f, 0-9)"
                value={channelSecret}
                onChange={(e) => setChannelSecret(e.target.value)}
                disabled={submitting}
                required
                className="form-input pe-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                aria-label={showSecret ? 'ซ่อน Channel secret' : 'แสดง Channel secret'}
                className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-center text-default-500 hover:text-default-700"
              >
                <Icon icon={showSecret ? 'eye-off' : 'eye'} className="text-base" />
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="line-channel-token" className="form-label">
              Channel access token
              <span className="text-danger">*</span>
            </label>
            <div className="input-icon-group relative">
              <Icon icon="key" className="input-icon" />
              <input
                id="line-channel-token"
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                placeholder="Channel access token (long-lived)"
                value={channelAccessToken}
                onChange={(e) => setChannelAccessToken(e.target.value)}
                disabled={submitting}
                required
                maxLength={512}
                className="form-input pe-10"
              />
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                aria-label={showToken ? 'ซ่อน Channel access token' : 'แสดง Channel access token'}
                className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-center text-default-500 hover:text-default-700"
              >
                <Icon icon={showToken ? 'eye-off' : 'eye'} className="text-base" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-2 disabled:opacity-60"
          >
            {submitting && <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {submitting ? 'กำลังตรวจสอบ...' : 'ตรวจสอบและเชื่อมต่อ'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn bg-light text-default-700 hover:bg-light-hover disabled:opacity-60"
          >
            ยกเลิก
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── ผลทดสอบ: แถวเช็ค 3 สถานะ ───────────────────────────────────────────────

/**
 * 🛑 มี **3 สถานะ ไม่ใช่ 2** — `INCONCLUSIVE` มีอยู่จริงเพราะการตรวจฝั่งรับเป็น
 * "ไม่พบสัญญาณว่าล้มเหลว" ไม่ใช่ "พบสัญญาณว่าสำเร็จ" การยุบเหลือผ่าน/ไม่ผ่านคือการโกหก
 */
function HealthCheckRow({ label, state, text }: { label: string; state: string; text: string }) {
  const mark =
    state === 'PASS'
      ? { icon: 'check', cls: 'text-success-ink' }
      : state === 'FAIL'
        ? { icon: 'x', cls: 'text-danger-ink' }
        : { icon: 'help-circle', cls: 'text-warning-ink' }
  return (
    <div className="border-default-200 flex items-start gap-2 py-1.5 text-xs not-first:border-t">
      <Icon icon={mark.icon} className={`mt-0.5 shrink-0 text-sm ${mark.cls}`} aria-hidden="true" />
      <span className="text-default-800 w-32 shrink-0 font-medium">{label}</span>
      <span className="text-default-700 min-w-0 flex-1">{text}</span>
    </div>
  )
}

function webhookResultText(report: HealthReport): string {
  if (!report.webhook) return 'อ่านสภาพ Webhook ไม่ได้ในตอนนี้ — ไม่ได้แปลว่าตั้งผิด'
  if (report.webhook.state === 'PASS') return 'ตั้งค่าและเปิดใช้งานถูกต้อง'
  if (!report.webhook.endpoint) return 'ยังไม่ได้วาง Webhook URL ในคอนโซล LINE'
  if (!report.webhook.matchesUs) return 'Webhook ชี้ไปยัง URL อื่น ไม่ใช่ของ Deep'
  return 'ตั้ง URL ไว้แล้วแต่สวิตช์ "Use webhook" ยังปิดอยู่'
}

function inboundResultText(report: HealthReport): string {
  if (report.inbound.reason === 'SIGNATURE_MISMATCH') {
    return 'ประมวลผลไม่สำเร็จ — Channel secret ไม่ตรงกับที่ตั้งไว้ใน LINE (LINE รายงานว่าส่งสำเร็จ แต่นั่นบอกแค่ว่า server เรายังออนไลน์)'
  }
  if (report.inbound.reason === 'DESTINATION_NOT_FOUND') {
    return 'ข้อความมาถึงระบบแล้วแต่ไม่มีช่องทางรองรับ — ตรวจว่า Webhook ชี้มาที่บัญชีนี้จริง'
  }
  if (report.inbound.state === 'PASS') return 'ระบบประมวลผลสำเร็จ'
  return 'ไม่พบสัญญาณว่าถูกปฏิเสธ แต่ยังยืนยันการรับไม่ได้ 100% — ลองอีกครั้งใน 1 นาทีถ้าไม่แน่ใจ'
}
