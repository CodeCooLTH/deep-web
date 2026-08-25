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

export default function NotificationPrefsCard({ shops }: { shops: NotificationShopRow[] }) {
  const [rows, setRows] = useState(shops)
  const [pendingId, setPendingId] = useState<string | null>(null)

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
      </div>
    </div>
  )
}
