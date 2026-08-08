'use client'

/**
 * ShopSlugField — ตั้ง URL หน้าร้านสาธารณะ (/b/{slug}) จากหน้าตั้งค่าร้าน
 *
 * Base: src/app/(paces)/seller/onboarding/page.tsx step 'slug' (บรรทัด 136-159 ตรรกะ debounce
 *   check + 271-285 markup `input-icon-group` + ข้อความสถานะ) — ยกมาทั้งชุด ไม่ประดิษฐ์ใหม่
 * Base (State B): (dashboard)/public-profile/page.tsx บรรทัด 118-136 (การ์ด URL + ปุ่มคัดลอก/เปิดดู)
 *
 * ทำไมต้องมี: ก่อนหน้านี้ **ไม่มีที่ตั้ง slug ให้ร้าน BUSINESS เลยทั้งระบบ** — onboarding ของ
 * business ถูกถอดทิ้ง 2026-08-05, `ShopForm` ไม่มี field นี้, และ `PATCH /api/shops/[id]` มี
 * allow-list ที่ตั้งใจไม่รวม slug ผลคือร้าน BUSINESS ไม่มีทางมีหน้าร้านสาธารณะได้เลย
 *
 * ยิง POST ทันทีที่ยืนยัน ไม่รอปุ่ม "บันทึกการเปลี่ยนแปลง" ของฟอร์มหลัก — เพราะเป็น action ที่
 * ต้องเช็คว่าชื่อว่างไหมก่อน (ต่างจาก field ข้อความทั่วไปที่ merge ทีเดียวตอน submit ได้)
 */

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'
import { normalizeSlug, isValidSlugFormat, isReservedSlug } from '@/lib/shop-slug'
import CopyLinkButton from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/CopyLinkButton'

type Check = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid'

type Props = {
  /** slug ปัจจุบัน — null = ยังไม่เคยตั้ง (State A) */
  initialSlug: string | null
  /**
   * URL เต็มของหน้าร้าน (คำนวณที่ server เพราะต้องข้าม subdomain: หน้านี้อยู่ seller.* แต่
   * หน้าร้านอยู่โดเมนหลัก) — null เมื่อยังไม่มี slug
   */
  publicUrl: string | null
  /** origin ของโดเมนหลักสำหรับ preview ตอนยังไม่ตั้ง เช่น "deepthailand.app" */
  publicOrigin: string
}

export default function ShopSlugField({ initialSlug, publicUrl, publicOrigin }: Props) {
  const router = useRouter()
  const [slug, setSlug] = useState('')
  const [status, setStatus] = useState<Check>('idle')
  const [loading, setLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── State B: ตั้งแล้ว ─────────────────────────────────────────────────────
  // ไม่ใช้ accent อีกต่อไป — งานนี้เสร็จแล้ว ไม่ควรแย่งสายตาจากฟอร์มที่ยังต้องกรอก
  if (initialSlug) {
    return (
      <div className="border-default-300 mb-5 rounded-lg border p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon icon="link" className="text-default-500 text-base" aria-hidden="true" />
          <h5 className="text-default-900 mb-0 text-sm font-medium">URL หน้าร้าน</h5>
        </div>
        {/* break-all ไม่ใช่ truncate — slug ยาว 30 ตัวบนจอ 375px ต้องอ่านได้ทั้งเส้น */}
        <p className="text-default-700 mb-3 break-all font-mono text-xs">{publicUrl}</p>
        <div className="flex flex-wrap items-center gap-2">
          {publicUrl && (
            <CopyLinkButton
              value={publicUrl}
              label="คัดลอก"
              successMessage="คัดลอกลิงก์หน้าร้านแล้ว"
              className="btn btn-sm border-default-300 text-default-700"
            />
          )}
          {publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm border-default-300 text-default-700"
            >
              <Icon icon="external-link" className="text-sm" aria-hidden="true" />
              ดูหน้าร้านของฉัน
            </a>
          )}
        </div>
        {/* พูดตรงตามที่ระบบทำได้จริง — ตรวจแล้วว่าไม่มีทางเขียนทับ slug ได้จากที่ไหนเลย
            จึงไม่มีปุ่ม "แก้ไข" ให้กด (ปุ่มที่กดแล้วไม่เกิดอะไรแย่กว่าไม่มีปุ่ม) */}
        <p className="text-default-400 mb-0 mt-2 text-xs">ตั้งแล้ว เปลี่ยนภายหลังไม่ได้ในตอนนี้</p>
      </div>
    )
  }

  // ── State A: ยังไม่ตั้ง ───────────────────────────────────────────────────
  const onChange = (v: string) => {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(cleaned)
    setStatus('idle')
    if (debounce.current) clearTimeout(debounce.current)
    const n = normalizeSlug(cleaned)
    if (!n || !isValidSlugFormat(n) || isReservedSlug(n)) {
      // ยังพิมพ์ไม่ถึง 3 ตัว = ยังไม่ใช่ error ปล่อยเป็น idle ไม่ขึ้นสีแดงใส่คนที่เพิ่งเริ่มพิมพ์
      setStatus(cleaned.length >= 3 ? 'invalid' : 'idle')
      return
    }
    if (cleaned.length < 3) return
    setStatus('checking')
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shops/check-slug?slug=${encodeURIComponent(n)}`)
        const d = await res.json()
        setStatus(d.available ? 'ok' : 'taken')
      } catch {
        setStatus('idle')
      }
    }, 400)
  }

  const submit = async () => {
    if (status !== 'ok' || loading) return
    const n = normalizeSlug(slug)
    /**
     * ยืนยันก่อนเสมอ — slug เปลี่ยนไม่ได้หลังตั้ง และ user เคาะให้สมาชิกร้าน "ทุกคน" ตั้งได้
     * (2026-08-07) แปลว่าทีมงานคนหนึ่งจองชื่อผิดแล้วทั้งร้านแก้ไม่ได้เลย กล่องนี้คือด่านเดียว
     */
    const ok = await pacesConfirm.warning(
      'ยืนยัน URL หน้าร้าน?',
      `หน้าร้านจะอยู่ที่ ${publicOrigin}/b/${n} · ตั้งแล้วเปลี่ยนภายหลังไม่ได้`,
      { confirmButtonText: 'ยืนยัน URL นี้', cancelButtonText: 'ขอคิดก่อน' },
    )
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch('/api/shops/slug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: n }),
      })
      if (res.ok) {
        pacesToast.success('ตั้ง URL หน้าร้านแล้ว')
        // ให้ RSC อ่าน slug ใหม่แล้วสลับเป็น State B เอง ไม่ต้องรีโหลดทั้งหน้า
        router.refresh()
      } else if (res.status === 409) {
        setStatus('taken')
        pacesToast.error('URL นี้มีคนใช้แล้ว')
      } else {
        pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
      }
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-primary/30 bg-primary/5 mb-5 rounded-lg border p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon icon="link" className="text-primary text-base" aria-hidden="true" />
        <h5 className="text-default-900 mb-0 text-sm font-medium">ตั้ง URL หน้าร้าน</h5>
      </div>
      <p className="text-default-600 mb-3 text-xs">ลูกค้าจะเข้าร้านผ่านลิงก์นี้</p>

      <div className="input-icon-group">
        <Icon icon="link" className="input-icon" />
        <input
          className="form-input"
          placeholder="yourshop"
          value={slug}
          onChange={(e) => onChange(e.target.value)}
          maxLength={30}
          autoCapitalize="none"
          autoComplete="off"
          aria-label="URL หน้าร้าน"
          aria-describedby="shop-slug-status"
        />
      </div>

      {/* preview ต้องขึ้นก่อนตัดสินว่าว่างไหม — ผู้ใช้ต้องเห็นเส้นทางจริงระหว่างพิมพ์ */}
      {slug.length >= 3 && (
        <p className="text-default-600 mt-2 break-all font-mono text-xs">
          {publicOrigin}/b/{normalizeSlug(slug)}
        </p>
      )}

      <p id="shop-slug-status" className="mt-1 text-xs" aria-live="polite">
        {status === 'ok' && <span className="text-success-ink">URL นี้ว่างอยู่</span>}
        {status === 'taken' && <span className="text-danger-ink">URL นี้มีคนใช้แล้ว</span>}
        {status === 'invalid' && (
          <span className="text-danger-ink">ใช้ a-z, 0-9, ขีดกลาง ได้ 3-30 ตัว</span>
        )}
        {status === 'checking' && <span className="text-default-400">กำลังตรวจสอบ...</span>}
      </p>

      <button
        type="button"
        onClick={submit}
        disabled={loading || status !== 'ok'}
        className="btn bg-primary hover:bg-primary-hover mt-3 min-h-11 w-full text-white disabled:opacity-50"
      >
        {loading && <Icon icon="mdi:loading" className="animate-spin text-sm" aria-hidden="true" />}
        {loading ? 'กำลังบันทึก...' : 'ยืนยัน URL นี้'}
      </button>
    </div>
  )
}
