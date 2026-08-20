'use client'

/**
 * ShopLocationField — ตั้ง/ย้ายที่อยู่ + หมุดแผนที่ของร้าน จากหน้าตั้งค่าร้าน
 *
 * Base: src/app/(paces)/seller/(dashboard)/shop/components/ShopSlugField.tsx (โครงการ์ด 2 สถานะ
 *   accent block ↔ default border block + ยิงบันทึกทันทีแล้ว router.refresh() ให้ RSC อ่านค่าใหม่)
 * Base (ช่องค้นหาที่อยู่ + แผนที่): business/components/BusinessCreateModal.tsx ขั้น 'location'
 *   (ThaiAddressSearch + MapPicker คู่กัน) — ยกมาทั้งคู่ ไม่ประดิษฐ์วิธีกรอกที่อยู่แบบที่สาม
 *
 * ทำไมต้องมี: ก่อนหน้านี้ **ไม่มีที่ไหนในระบบแก้พิกัดร้านได้เลย** — คอลัมน์ latitude/longitude
 * เขียนได้จาก 2 ทางเท่านั้นคือ `POST /api/shops/update` (hardcode kind:'PERSONAL' + เรียกจาก
 * onboarding เท่านั้น) กับตอนสร้างธุรกิจ ซึ่งตอนนั้น payload ทิ้งพิกัดไปทั้งดุ้น (บั๊ก 2026-08-14)
 * ⇒ ตรวจฐาน prod วันเดียวกันแล้วไม่มีร้านไหนมีพิกัดสักร้าน ปุ่ม "ดูแผนที่" บนโปรไฟล์สาธารณะ
 * (AboutOverview.tsx เช็ค hasPin) จึงไม่เคยขึ้นให้ร้านไหนเลยตั้งแต่วันแรก
 *
 * ทำไมบันทึกทันที ไม่รอปุ่ม "บันทึกการเปลี่ยนแปลง" ของฟอร์มหลัก: เหตุผลเดียวกับ ShopSlugField —
 * พิกัดไม่ได้มาจาก <input> แต่มาจากการคลิกแผนที่ การผูกเข้า react-hook-form ของฟอร์มใหญ่แปลว่า
 * ต้องซิงก์ state สองชั้น และผู้ใช้จะไม่รู้ว่าหมุดที่เพิ่งปักถูกเก็บหรือยัง
 */

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import ThaiAddressSearch from '@/components/safepay/ThaiAddressSearch'
import { resolveDisplayedPin } from '@/lib/shop-location-display'

// Leaflet แตะ window ตอน import — ต้อง ssr:false (ท่าเดียวกับ BusinessCreateModal.tsx:42)
const MapPicker = dynamic(() => import('../../dashboard/components/MapPicker'), { ssr: false })

type Props = {
  shopId: string
  /** ที่อยู่เดิม — null/'' = ยังไม่เคยกรอก */
  initialAddress: string | null
  /** พิกัดเดิม — null = ยังไม่เคยปักหมุด (สถานะ 1) */
  initialLat: number | null
  initialLng: number | null
}

/** ลิงก์เปิด Google Maps — สูตรเดียวกับ AboutOverview.tsx:79-81 ที่ผู้ซื้อเห็นบนโปรไฟล์
 *  สาธารณะ ห้ามเขียนสูตรใหม่ ไม่งั้นสองที่จะพาไปคนละหมุดเมื่อฝั่งใดฝั่งหนึ่งถูกแก้ */
function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

export default function ShopLocationField({ shopId, initialAddress, initialLat, initialLng }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  /**
   * ที่อยู่ที่จะส่ง — เริ่มจากค่าเดิมเสมอ แล้วให้ ThaiAddressSearch เขียนทับเฉพาะตอนผู้ใช้
   * เลือกที่อยู่ใหม่จริง ๆ (component นั้นไม่มี prop รับค่าเริ่มต้น และไม่ fire onChange ตอน mount)
   * ⇒ ผู้ใช้ที่เข้ามาแค่ย้ายหมุด จะไม่เผลอโดนล้างที่อยู่เดิมทิ้ง
   */
  const [addressDraft, setAddressDraft] = useState(initialAddress ?? '')
  const [lat, setLat] = useState<number | null>(initialLat)
  const [lng, setLng] = useState<number | null>(initialLng)
  /** ที่อยู่ที่บันทึกสำเร็จแล้ว — เหตุผลเดียวกับ `pinLat`/`pinLng` ข้างล่าง: props ยังเป็นค่าเก่า
   *  จนกว่า `router.refresh()` จะกลับมา ถ้าอ่าน `initialAddress` ตรง ๆ สถานะ 2 จะโชว์ที่อยู่เดิม
   *  (หรือ "ยังไม่ได้กรอกที่อยู่") ทับที่อยู่ที่ผู้ใช้เพิ่งบันทึกไป */
  const [savedAddress, setSavedAddress] = useState<string | null>(initialAddress)

  /**
   * 🛑 ต้องอ่านจาก state ก่อน props เสมอ — ห้ามกลับไปเป็น `initialLat != null` เฉย ๆ
   *
   * บั๊กที่ critique จับได้ 2026-08-14: `save()` ทำ `setEditing(false)` แล้ว `router.refresh()`
   * ซึ่งเป็น round trip ไปหา server ⇒ ในช่วงที่ยังรอ RSC payload ใหม่ `initialLat` ที่มาทาง props
   * **ยังเป็น null อยู่** การ์ดจึง render สถานะ 1 (กล่องน้ำเงิน "ปักหมุดตำแหน่งร้าน" + ปุ่มเต็มความกว้าง)
   * พร้อมกับ toast เขียวที่เพิ่งบอกว่าบันทึกสำเร็จ — จอสองอย่างขัดกันในเสี้ยววินาทีเดียว
   *
   * เกิดกับ **การปักหมุดครั้งแรกทุกใบ** ซึ่งคือ 100% ของร้านบน prod ตอนที่เขียน (ไม่มีร้านไหน
   * มีพิกัดเลยสักร้าน) และมันโจมตีตรงจุดที่ product นี้ขายอยู่พอดี — ความเชื่อมั่นว่าระบบเก็บของให้จริง
   * (คลาสเดียวกับ docs/conventions/component-declared-in-render.md — "แวบ ๆ" ที่ไม่มี gate ไหนจับได้)
   */
  const { lat: pinLat, lng: pinLng, hasPin } = resolveDisplayedPin(
    { lat, lng },
    { lat: initialLat, lng: initialLng },
  )

  const startEdit = () => {
    // ยึดค่าที่บันทึกล่าสุด ไม่ใช่ props — คนที่กด "แก้ไขตำแหน่ง" ทันทีหลังบันทึก (ก่อน refresh
    // กลับมา) ต้องไม่โดนย้อนกลับไปค่าเก่า
    setAddressDraft(savedAddress ?? '')
    setLat(pinLat)
    setLng(pinLng)
    setEditing(true)
  }

  const save = async () => {
    if (lat == null || lng == null || saving) return
    setSaving(true)
    try {
      // ส่ง address เฉพาะตอนมีค่า — ส่งสตริงว่างคือการ "ลบที่อยู่เดิมทิ้ง" ซึ่งไม่ใช่สิ่งที่
      // คนที่เข้ามาย้ายหมุดตั้งใจทำ (updateShop รับ string ว่างเข้าไปเขียนทับได้จริง)
      const body: Record<string, unknown> = { latitude: lat, longitude: lng }
      if (addressDraft.trim()) body.address = addressDraft.trim()

      const res = await fetch(`/api/shops/${shopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        pacesToast.success('บันทึกตำแหน่งร้านแล้ว')
        if (addressDraft.trim()) setSavedAddress(addressDraft.trim())
        setEditing(false)
        router.refresh()
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      pacesToast.error(
        data.error === 'GEO_OUT_OF_RANGE'
          ? 'หมุดอยู่นอกประเทศไทย กรุณาปักใหม่'
          : 'บันทึกไม่สำเร็จ กรุณาลองใหม่',
      )
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      // ล้มเหลว = ค้างอยู่โหมดแก้ไข ไม่ยุบการ์ด ไม่ล้างค่าที่เพิ่งกรอก
      // (ผู้ใช้ต้องไม่เสียงานเพราะเน็ตสะดุด)
      setSaving(false)
    }
  }

  // ── สถานะ 3: กำลังแก้ไข ───────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="border-primary/30 bg-primary/5 mb-5 rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Icon icon="map-pin" className="text-primary text-base" aria-hidden="true" />
          <h5 className="text-default-900 mb-0 text-sm font-medium">ปักหมุดตำแหน่งร้าน</h5>
        </div>

        {savedAddress && (
          <p className="text-default-600 mb-3 break-words text-xs">ที่อยู่เดิม: {savedAddress}</p>
        )}

        <label className="form-label">ค้นหาที่อยู่ใหม่ (ถ้าต้องการเปลี่ยน)</label>
        <ThaiAddressSearch
          onChange={(composed) => {
            // เขียนทับเฉพาะตอนได้ค่าจริง — ค่าว่างแปลว่า "ยังไม่เลือก" ไม่ใช่ "ลบที่อยู่เดิม"
            if (composed) setAddressDraft(composed)
          }}
          disabled={saving}
        />
        <p className="text-default-400 mb-4 mt-1 text-xs">ถ้าไม่เปลี่ยน ระบบจะเก็บที่อยู่เดิมไว้</p>

        <label className="form-label">ปักหมุดตำแหน่งร้าน</label>
        <MapPicker
          initialLat={lat}
          initialLng={lng}
          onLocationChange={(la, ln) => {
            setLat(la)
            setLng(ln)
          }}
        />
        <p className="text-default-600 mt-2 text-xs" aria-live="polite">
          {lat != null && lng != null ? 'ปักหมุดแล้ว' : 'แตะบนแผนที่เพื่อวางหมุด'}
        </p>

        <p className="text-default-400 mt-3 flex items-start gap-1 text-xs">
          <Icon icon="info-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          บันทึกทันทีที่กด ไม่ต้องกด &quot;บันทึกการเปลี่ยนแปลง&quot; ด้านล่างซ้ำ
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="btn border-default-300 text-default-700 min-h-11 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || lat == null || lng == null}
            className="btn bg-primary hover:bg-primary-hover min-h-11 text-white disabled:opacity-50"
          >
            {saving && <Icon icon="loader-2" className="animate-spin text-sm" aria-hidden="true" />}
            {saving ? 'กำลังบันทึก...' : 'บันทึกตำแหน่ง'}
          </button>
        </div>
      </div>
    )
  }

  // ── สถานะ 2: มีพิกัดแล้ว ──────────────────────────────────────────────────
  // ไม่ใช้ accent — งานนี้เสร็จแล้ว ไม่ควรแย่งสายตาจากฟอร์มที่ยังต้องกรอก (เหมือน ShopSlugField)
  if (hasPin) {
    return (
      <div className="border-default-300 mb-5 rounded-lg border p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon icon="map-pin" className="text-default-500 text-base" aria-hidden="true" />
          <h5 className="text-default-900 mb-0 text-sm font-medium">ตำแหน่งร้าน</h5>
        </div>
        {/* break-words ไม่ใช่ break-all — ที่อยู่มีช่องว่างตามธรรมชาติให้ตัดบรรทัดอยู่แล้ว
            (ต่างจาก slug ที่เป็นสตริงยาวไม่มีช่องว่าง) */}
        <p className="text-default-700 mb-3 break-words text-xs">
          {savedAddress || 'ยังไม่ได้กรอกที่อยู่เป็นตัวหนังสือ'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={googleMapsUrl(pinLat as number, pinLng as number)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm border-default-300 text-default-700"
          >
            <Icon icon="external-link" className="text-sm" aria-hidden="true" />
            ดูตำแหน่งบน Google Maps
          </a>
          <button
            type="button"
            onClick={startEdit}
            className="btn btn-sm border-default-300 text-default-700"
          >
            <Icon icon="edit" className="text-sm" aria-hidden="true" />
            แก้ไขตำแหน่ง
          </button>
        </div>
      </div>
    )
  }

  // ── สถานะ 1: ยังไม่มีพิกัด ────────────────────────────────────────────────
  // accent เดียวกับ ShopSlugField state A — งานประเภทเดียวกัน (setup ที่ยังไม่เสร็จ)
  // ไม่ใช่ warning: นี่ไม่ใช่ข้อผิดพลาดหรือความเสี่ยง แค่ยังไม่ได้ทำ
  return (
    <div className="border-primary/30 bg-primary/5 mb-5 rounded-lg border p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon icon="map-pin" className="text-primary text-base" aria-hidden="true" />
        <h5 className="text-default-900 mb-0 text-sm font-medium">ปักหมุดตำแหน่งร้าน</h5>
      </div>
      <p className="text-default-600 mb-3 text-xs">ลูกค้าจะเห็นตำแหน่งนี้เมื่อเปิดหน้าร้านของคุณ</p>
      <button
        type="button"
        onClick={startEdit}
        className="btn bg-primary hover:bg-primary-hover min-h-11 w-full text-white"
      >
        ปักหมุดตำแหน่งร้าน
      </button>
    </div>
  )
}
