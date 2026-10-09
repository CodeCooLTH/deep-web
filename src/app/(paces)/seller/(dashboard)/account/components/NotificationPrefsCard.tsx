'use client'

/**
 * NotificationPrefsCard — เปิด/ปิดแจ้งเตือนข้อความใหม่ "รายร้าน" (user สั่ง 2026-08-08: "ตั้งค่าทีละร้านได้")
 *
 * Base: src/app/(paces)/seller/(dashboard)/business/[shopId]/invites/components/FinanceVisibilityToggle.tsx:86-110
 *   — `form-switch` controlled + optimistic + revert เมื่อ PATCH ล้ม + pacesToast (Hard Rule 9)
 * Base: src/app/(paces)/seller/(dashboard)/account/page.tsx:101-106
 *   — เปลือก `.card` + `.card-header` ที่มีหัวข้อเส้นประ (ชุดเดียวกับการ์ด "วิธีเข้าสู่ระบบ" ในหน้าเดียวกัน)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx:60 — soft alert `bg-{semantic}/15`
 *   (ใช้กับแถบเตือนสิทธิ์ระดับเครื่อง) · pattern เดียวกับแถบเตือน "กู้บัญชีไม่ได้" ในหน้านี้
 *
 * ทำไมทั้งหมดอยู่หน้าเดียวแทนที่จะแยกไปหน้าตั้งค่าของแต่ละร้าน: หน้าตั้งค่าร้านผูกกับร้านที่ active
 * อยู่ — ผู้ขายที่ถือ 2 ร้านจะต้อง "สลับร้าน" (hard-navigate + overlay) ก่อนถึงจะปิดอีกร้านได้
 * ทั้งที่เป็นการตัดสินใจเรื่องเดียวกันในหัวเขา. ที่นี่เห็นครบทุกร้านแล้วกดได้เลย
 *
 * และยังอยู่ในหน้า "ข้อมูลส่วนตัว" ได้อย่างถูกต้องแม้จะแยกรายร้าน เพราะมันคือ
 * "ฉันอยากรับแจ้งเตือนของร้านไหน" ไม่ใช่ "ร้านนี้ตั้งค่าไว้ยังไง" — พนักงานสองคนในร้านเดียวกัน
 * ตั้งไม่เหมือนกันได้ (เส้นแบ่งเดียวกับที่หัวไฟล์ page.tsx ประกาศไว้)
 */

import { useCallback, useEffect, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { previewChatSound } from '@/lib/chat-sound'
import type { ChatPushSound } from '@/services/notification-pref.service'
import {
  openNativeNotificationSettings,
  readPushPermission,
  subscribePushPermission,
  type PushPermission,
} from '@/lib/native-bridge'

export interface NotificationShopRow {
  shopId: string
  shopName: string
  logo: string | null
  kind: string
  chatEnabled: boolean
}

/** รูปร้าน + fallback เป็นตัวอักษรแรก — เพจ/ร้านจำนวนมากไม่มีโลโก้ ปล่อยว่างจะเป็นกล่องเทาเปล่า */
function ShopMark({ logo, name }: { logo: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={36}
        height={36}
        onError={() => setFailed(true)}
        className="ring-default-200 size-9 shrink-0 rounded-full object-cover ring-1"
      />
    )
  }
  return (
    <span className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium">
      {name.trim().charAt(0) || '?'}
    </span>
  )
}

/**
 * ตัวเลือกเสียงแจ้งเตือนแชทใหม่ (2026-10-09) — ลำดับ = ค่าตั้งต้นก่อน
 * 🛑 ค่าต้องตรงกับ CHAT_PUSH_SOUNDS (notification-pref.service) และ PushSound (lib/expo-push)
 */
const SOUND_OPTIONS: { value: ChatPushSound; name: string; hint: string }[] = [
  { value: 'chat', name: 'เสียงแชท Deep', hint: 'เสียงเดียวกับที่ดังในหน้าแชท' },
  { value: 'default', name: 'เสียงแจ้งเตือนของเครื่อง', hint: 'เสียงมาตรฐานของโทรศัพท์' },
]

export default function NotificationPrefsCard({
  shops,
  chatPushSound,
}: {
  shops: NotificationShopRow[]
  chatPushSound: ChatPushSound
}) {
  const [rows, setRows] = useState(shops)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [sound, setSound] = useState<ChatPushSound>(chatPushSound)
  const [savingSound, setSavingSound] = useState(false)

  const chooseSound = useCallback(async (next: ChatPushSound, prev: ChatPushSound) => {
    if (next === prev) return
    setSavingSound(true)
    setSound(next) // optimistic — เหมือนสวิตช์รายร้าน
    try {
      const res = await fetch('/api/account/notification-sound', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatPushSound: next }),
      })
      if (!res.ok) throw new Error('failed')
      pacesToast.success('บันทึกเสียงแจ้งเตือนแล้ว')
    } catch {
      setSound(prev)
      pacesToast.error('เปลี่ยนเสียงแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSavingSound(false)
    }
  }, [])

  /**
   * สิทธิ์แจ้งเตือนระดับเครื่อง — `null` = ไม่ได้เปิดอยู่ในแอป (เว็บธรรมดา) จึงไม่ต้องพูดถึงเลย
   *
   * 🛑 ทำไมต้องรู้: สวิตช์พวกนี้คุมได้แค่ "เราจะส่งไหม" ถ้าผู้ใช้ปิดแจ้งเตือนของแอปที่ Settings
   * ของเครื่อง เปิดสวิตช์ไว้ครบทุกร้านก็ยังเงียบสนิท แล้วเขาจะสรุปว่าระบบเราพัง — หน้าจอที่
   * แสดงสถานะไม่ตรงความจริงแย่กว่าไม่มีหน้าจอนั้นเลย
   */
  const [permission, setPermission] = useState<PushPermission | null>(null)
  useEffect(() => {
    setPermission(readPushPermission())
    return subscribePushPermission(setPermission)
  }, [])

  const toggle = useCallback(async (shopId: string, next: boolean) => {
    setPendingId(shopId)
    // optimistic — สวิตช์ต้องขยับทันทีที่นิ้วปล่อย ไม่ใช่รอ round trip
    setRows((prev) => prev.map((r) => (r.shopId === shopId ? { ...r, chatEnabled: next } : r)))
    try {
      const res = await fetch('/api/account/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId, chatEnabled: next }),
      })
      if (!res.ok) throw new Error('failed')
      pacesToast.success(next ? 'เปิดแจ้งเตือนร้านนี้แล้ว' : 'ปิดแจ้งเตือนร้านนี้แล้ว')
    } catch {
      // revert — ถ้าไม่คืนค่า ผู้ใช้จะเชื่อว่าปิดสำเร็จแล้วยังได้ noti ต่อ ซึ่งน่ารำคาญกว่าเดิม
      setRows((prev) => prev.map((r) => (r.shopId === shopId ? { ...r, chatEnabled: !next } : r)))
      pacesToast.error('เปลี่ยนการตั้งค่าไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setPendingId(null)
    }
  }, [])

  return (
    <div className="card mt-4">
      <div className="card-header">
        <h5 className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
          การแจ้งเตือน
        </h5>
      </div>

      <div className="card-body">
        <p className="text-default-500 mb-4 text-xs">
          เลือกได้ว่าจะรับแจ้งเตือนข้อความใหม่จากลูกค้าของร้านไหนบ้าง — มีผลกับแอปบนมือถือเท่านั้น
        </p>

        {/* สิทธิ์ระดับเครื่องปิดอยู่ → สวิตช์ด้านล่างไม่มีความหมายเลย ต้องบอกก่อนที่เขาจะไปนั่งกดทีละร้าน
            แสดงเฉพาะตอนเปิดในแอป (permission !== null) — บนเว็บเดสก์ท็อปไม่มีเรื่องนี้ให้พูดถึง */}
        {permission !== null && permission !== 'granted' && (
          <div className="bg-warning/15 text-warning-ink mb-4 flex items-start gap-2.5 rounded px-4 py-3" role="alert">
            <Icon icon="bell-off" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="text-sm">
              <p className="mb-1 font-medium">การแจ้งเตือนของแอปถูกปิดอยู่ที่เครื่องนี้</p>
              <p className="mb-2">
                ตราบใดที่ยังปิดอยู่ จะไม่มีแจ้งเตือนเด้งเลยไม่ว่าจะเปิดสวิตช์ร้านไหนไว้ก็ตาม
              </p>
              {/* 🛑 แก้ 2026-08-16: ประโยคเดิมตรงนี้ผิด — `_buttons.css` ของธีมมีแค่ .btn/.btn-lg/.btn-sm/
                  .btn-icon **ไม่มีทั้ง btn-primary และ btn-light** (btn-light ที่ grep เจอคือ
                  `.btn-light.active` ใน plugins/_apexcharts.css = สไตล์ toolbar ของกราฟ)
                  สีของปุ่มมาจาก utility เสมอ: `btn bg-light text-default-700 hover:bg-light-hover`
                  (grep theme/paces: btn-warning ไม่มีอยู่จริง จะได้ปุ่มไร้สไตล์ คลาสเดียวกับ
                  btn-ghost ที่เคยพลาดใน feature 00033) */}
              <button type="button" className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60" onClick={openNativeNotificationSettings}>
                เปิดการตั้งค่าเครื่อง
              </button>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-default-400 py-2 text-sm">ยังไม่มีร้านที่คุณดูแลอยู่</p>
        ) : (
          <ul className="divide-default-200 divide-y">
            {rows.map((r) => (
              <li key={r.shopId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <ShopMark logo={r.logo} name={r.shopName} />
                  <div className="min-w-0">
                    <label htmlFor={`notify-${r.shopId}`} className="text-dark block truncate text-sm font-medium">
                      {r.shopName}
                    </label>
                    <p className="text-default-400 mb-0 text-xs">
                      {r.kind === 'BUSINESS' ? 'บัญชีธุรกิจ' : 'บัญชีส่วนตัว'}
                    </p>
                  </div>
                </div>
                <input
                  id={`notify-${r.shopId}`}
                  type="checkbox"
                  className="form-switch shrink-0"
                  checked={r.chatEnabled}
                  disabled={pendingId === r.shopId}
                  onChange={(e) => toggle(r.shopId, e.target.checked)}
                />
              </li>
            ))}
          </ul>
        )}

        {/* เสียงแจ้งเตือนข้อความใหม่ (2026-10-09) — ของ "ตัวคน" ใช้กับทุกร้าน จึงอยู่ใต้รายการร้าน
            ไม่ใช่ในแถวของร้านใดร้านหนึ่ง · radio ชุดเดียวกับการ์ดภาษา (LanguagePrefsCard) */}
        <div className="border-default-200 mt-5 border-t border-dashed pt-4">
          <p className="text-dark mb-1 text-sm font-medium">เสียงแจ้งเตือนข้อความใหม่</p>
          <p className="text-default-500 mb-3 text-xs">
            ใช้กับแอปผู้ขายบนมือถือ เวอร์ชัน 1.0.2 ขึ้นไป — เวอร์ชันก่อนหน้าจะได้เสียงของเครื่องเสมอ
          </p>
          <fieldset
            className={`border-default-200 divide-default-200 divide-y overflow-hidden rounded border ${savingSound ? 'pointer-events-none opacity-60' : ''}`}
            disabled={savingSound}
          >
            <legend className="sr-only">เสียงแจ้งเตือนข้อความใหม่</legend>
            {SOUND_OPTIONS.map((option) => {
              const active = option.value === sound
              return (
                <div key={option.value} className="relative">
                  <input
                    type="radio"
                    name="chat-push-sound"
                    id={`chat-sound-${option.value}`}
                    value={option.value}
                    checked={active}
                    onChange={() => chooseSound(option.value, sound)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={`chat-sound-${option.value}`}
                    className="peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-primary hover:bg-default-50 flex cursor-pointer items-center gap-3 border-s-3 border-transparent px-4 py-3 peer-focus-visible:ring-2 peer-focus-visible:ring-inset"
                  >
                    <span className="grow">
                      <span className={`block text-sm ${active ? 'text-primary font-medium' : 'text-dark'}`}>{option.name}</span>
                      <span className="text-default-500 block text-xs">{option.hint}</span>
                    </span>
                    {active && <Icon icon="circle-check" className="text-primary size-5 shrink-0" aria-hidden="true" />}
                  </label>
                </div>
              )
            })}
          </fieldset>
          {/* ฟังตัวอย่างได้เฉพาะเสียงแชท Deep — เสียงของเครื่องเล่นจากเว็บไม่ได้ (แต่ละเครื่องตั้งไว้ไม่เหมือนกัน) */}
          <button
            type="button"
            className="btn btn-sm bg-light text-default-700 hover:bg-light-hover mt-3 inline-flex items-center gap-1.5"
            onClick={previewChatSound}
          >
            <Icon icon="player-play" className="size-4" aria-hidden="true" />
            ฟังเสียงแชท Deep
          </button>
          <p className="text-default-500 mt-3 mb-0 text-xs">
            Android เลือกเสียงอื่นได้อีกที่ ตั้งค่าเครื่อง › แอป › Deep Seller › การแจ้งเตือน › แชทใหม่
          </p>
        </div>
      </div>
    </div>
  )
}
