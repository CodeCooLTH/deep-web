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

// ─── Types ─────────────────────────────────────────────────────────────────

/** shape ตรงกับ LineChannelView (src/services/shop-channel.service.ts) — field ที่ใช้จริงเท่านั้น */
export interface LineChannelRow {
  id: string
  name: string
  avatarUrl: string | null
  status: string // 'ACTIVE' | 'TOKEN_INVALID' — 'DISCONNECTED' ถูกกรองออกที่ listChannels() แล้ว
  /** @handle ของ OA — null เมื่อโหลดจาก listChannels() (ยังไม่ select คอลัมน์นี้ ดู known gap ด้านบน) */
  basicId: string | null
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

  const hasTokenInvalid = channels.some((c) => c.status === 'TOKEN_INVALID')

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
              การเชื่อมต่อ LINE OA มีปัญหา ต้องเชื่อมต่อใหม่
            </div>
          )}

          <div className="mt-2">
            {channels.map((channel) => {
              const isDisconnecting = disconnectingId === channel.id
              const isActive = channel.status === 'ACTIVE'
              const isTokenInvalid = channel.status === 'TOKEN_INVALID'
              const isReconnectingThis = wizard?.mode === 'reconnect' && wizard.channelId === channel.id

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
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-success-ink bg-success/15 px-2 py-0.5 rounded mt-1">
                            <Icon icon="check" className="text-xs" aria-hidden="true" />
                            เชื่อมแล้ว
                          </span>
                        )}
                        {isTokenInvalid && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-danger-ink bg-danger/15 px-2 py-0.5 rounded mt-1">
                            <Icon icon="alert-triangle" className="text-xs" aria-hidden="true" />
                            โทเคนหมดอายุ
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ขวา: ปุ่ม action */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {isTokenInvalid && (
                        <button
                          type="button"
                          onClick={() => setWizard({ mode: 'reconnect', channelId: channel.id })}
                          disabled={isReconnectingThis}
                          className="btn btn-sm bg-primary/15 text-primary hover:bg-primary/25 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Icon icon="refresh" className="text-sm" aria-hidden="true" />
                          เชื่อมต่อใหม่
                        </button>
                      )}
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
