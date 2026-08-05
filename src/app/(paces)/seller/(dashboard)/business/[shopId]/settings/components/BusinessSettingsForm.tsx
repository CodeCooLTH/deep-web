'use client'

/**
 * BusinessSettingsForm — แก้ข้อมูลธุรกิจรายตัว (โลโก้ · ชื่อ · หมวดหมู่ · คำอธิบาย · ที่อยู่ · หมุด)
 *
 * ทำไมต้องมี: เดิมแก้ข้อมูลธุรกิจได้ทางเดียวคือสลับ context ไปใช้ธุรกิจนั้นก่อนแล้วเข้า /shop
 * ซึ่งวกวนมากเมื่อมีหลายธุรกิจ — user ถามตรง ๆ ว่า "อัพโหลด logo, location อยู่ไหน" (2026-08-05)
 *
 * ที่อยู่/หมุด แสดงเฉพาะร้านที่ลูกค้าต้องเดินทางมา (SERVICE_QUEUE/LODGING) — เกณฑ์เดียวกับ
 * ขั้น "ที่ตั้งร้าน" ใน wizard สร้างธุรกิจ ไม่ให้ร้านขายออนไลน์เจอช่องที่ไม่เกี่ยวกับตัวเอง
 *
 * ไม่มี vertical กับ URL ร้านในฟอร์มนี้โดยตั้งใจ: vertical เปลี่ยนไม่ได้หลังสร้าง (BR-SBT-08)
 * ส่วน slug ต้องผ่าน setShopSlug ที่จัดการ unique/TOCTOU เอง — คนละงานกับ update ทั่วไป
 *
 * Base: src/app/(paces)/seller/(dashboard)/shop/components/ShopForm.tsx
 *   (โครงฟอร์มตั้งค่าร้าน: card > card-header > card-body, logo upload ผ่าน POST /api/upload,
 *    ปุ่มบันทึกท้ายการ์ด) ซึ่ง chase ต่อไปที่
 *    theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/settings/page.tsx
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

import Icon from '@/components/wrappers/Icon'
import CategoryMultiSelect from '../../../../dashboard/components/CategoryMultiSelect'
import ThaiAddressSearch from '@/components/safepay/ThaiAddressSearch'
import { pacesToast } from '@/lib/paces-toast'
import { isValidSlugFormat, isReservedSlug, normalizeSlug } from '@/lib/shop-slug'

// Leaflet แตะ window ตอน import — ต้อง ssr:false
const MapPicker = dynamic(() => import('../../../../dashboard/components/MapPicker'), { ssr: false })

interface Props {
  shopId: string
  needsLocation: boolean
  /** '' = ยังไม่เคยตั้ง — ต้องตั้งให้เสร็จก่อนถึงจะออกจากหน้านี้ได้ (layout guard) */
  currentSlug: string
  initial: {
    shopName: string
    description: string
    logo: string
    address: string
    categories: string[]
    latitude: number | null
    longitude: number | null
  }
}

export default function BusinessSettingsForm({ shopId, needsLocation, currentSlug, initial }: Props) {
  const router = useRouter()
  const [shopName, setShopName] = useState(initial.shopName)
  const [description, setDescription] = useState(initial.description)
  const [logo, setLogo] = useState(initial.logo)
  const [categories, setCategories] = useState<string[]>(initial.categories)
  const [address, setAddress] = useState(initial.address)
  const [lat, setLat] = useState<number | null>(initial.latitude)
  const [lng, setLng] = useState<number | null>(initial.longitude)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [slug, setSlug] = useState('')
  const [slugState, setSlugState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle')
  const needsSlug = !currentSlug

  const checkSlug = async (raw: string) => {
    const v = normalizeSlug(raw)
    setSlug(v)
    if (!v) return setSlugState('idle')
    if (!isValidSlugFormat(v) || isReservedSlug(v)) return setSlugState('invalid')
    setSlugState('checking')
    try {
      const res = await fetch(`/api/shops/check-slug?slug=${encodeURIComponent(v)}`)
      const d = (await res.json()) as { available: boolean }
      setSlugState(d.available ? 'ok' : 'taken')
    } catch {
      setSlugState('idle')
    }
  }

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { fileId?: string; id?: string }
      setLogo(data.fileId ?? data.id ?? '')
      pacesToast.success('อัปโหลดโลโก้แล้ว — อย่าลืมกดบันทึก')
    } catch {
      pacesToast.error('อัปโหลดโลโก้ไม่สำเร็จ')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    if (!shopName.trim()) return pacesToast.error('กรุณากรอกชื่อธุรกิจ')
    if (needsSlug && slugState !== 'ok') {
      return pacesToast.error(slugState === 'taken' ? 'URL นี้มีคนใช้แล้ว' : 'กรุณาตั้ง URL ร้านให้ถูกต้อง')
    }
    setSaving(true)
    try {
      // slug ต้องผ่าน setShopSlug (จัดการ unique/TOCTOU เอง) จึงยิงคนละ endpoint กับ PATCH ทั่วไป
      // reuse route เดิมของ onboarding ที่รับ slug อยู่แล้ว — ไม่สร้าง endpoint ซ้ำ
      if (needsSlug) {
        const r = await fetch(`/api/business/shops/${shopId}/onboarding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        })
        if (!r.ok) {
          pacesToast.error('ตั้ง URL ร้านไม่สำเร็จ — อาจมีคนใช้ไปแล้ว')
          setSaving(false)
          return
        }
      }
      const res = await fetch(`/api/business/shops/${shopId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: shopName.trim(),
          description,
          categories,
          ...(logo ? { logo } : {}),
          ...(needsLocation ? { address } : {}),
          ...(needsLocation && lat != null ? { latitude: lat } : {}),
          ...(needsLocation && lng != null ? { longitude: lng } : {}),
        }),
      })
      if (!res.ok) {
        pacesToast.error('บันทึกไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      pacesToast.success('บันทึกแล้ว')
      router.refresh()
    } catch {
      pacesToast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title">ข้อมูลธุรกิจ</h4>
      </div>
      <div className="card-body">
        {needsSlug && (
          <div className="bg-warning/15 text-warning-ink mb-4 flex items-start gap-2 rounded px-4 py-3 text-xs" role="alert">
            <Icon icon="alert-triangle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>ธุรกิจนี้ยังไม่มี URL ร้าน — ตั้งให้เรียบร้อยก่อนถึงจะเริ่มใช้งานได้</span>
          </div>
        )}

        {needsSlug && (
          <div className="mb-4">
            <label className="form-label" htmlFor="bs-slug">
              URL ร้าน<span className="text-danger ms-0.5">*</span>
            </label>
            <div className="input-group">
              <span className="input-group-text">deepthailand.app/b/</span>
              <input
                id="bs-slug"
                className="form-input"
                placeholder="my-shop"
                onChange={(e) => void checkSlug(e.target.value)}
              />
            </div>
            {slugState === 'checking' && <p className="text-default-400 mt-1 text-sm">กำลังตรวจสอบ...</p>}
            {slugState === 'ok' && <p className="text-success mt-1 text-sm">ใช้ URL นี้ได้</p>}
            {slugState === 'taken' && <p className="text-danger mt-1 text-sm">URL นี้มีคนใช้แล้ว</p>}
            {slugState === 'invalid' && (
              <p className="text-danger mt-1 text-sm">ใช้ได้เฉพาะ a-z 0-9 และ - เท่านั้น</p>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="form-label" htmlFor="bs-name">
            ชื่อธุรกิจ<span className="text-danger ms-0.5">*</span>
          </label>
          <input
            id="bs-name"
            className="form-input"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
          />
        </div>

        <div className="mb-4">
          <label className="form-label" htmlFor="bs-logo">
            โลโก้ร้าน <span className="text-default-400 font-normal">(ไม่บังคับ)</span>
          </label>
          <input
            id="bs-logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="form-input"
            onChange={handleLogo}
            disabled={uploading}
          />
          {uploading && (
            <p className="text-default-400 mt-1 flex items-center gap-1 text-sm">
              <Icon icon="loader-2" className="animate-spin text-base" aria-hidden="true" />
              กำลังอัปโหลด...
            </p>
          )}
          {logo && !uploading && (
            <p className="text-success mt-1 flex items-center gap-1 text-sm">
              <Icon icon="circle-check" className="text-base" aria-hidden="true" />
              มีโลโก้แล้ว
            </p>
          )}
        </div>

        <div className="mb-4">
          <label className="form-label">
            หมวดหมู่ <span className="text-default-400 font-normal">(เลือกได้ถึง 5)</span>
          </label>
          <CategoryMultiSelect value={categories} onChange={setCategories} max={5} />
        </div>

        <div className="mb-4">
          <label className="form-label" htmlFor="bs-desc">
            คำอธิบาย
          </label>
          <textarea
            id="bs-desc"
            rows={3}
            className="form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {needsLocation && (
          <>
            <div className="mb-4">
              <label className="form-label">ที่อยู่ร้าน</label>
              {initial.address && (
                <p className="text-default-400 mb-1 text-xs">ปัจจุบัน: {initial.address}</p>
              )}
              <ThaiAddressSearch onChange={setAddress} />
            </div>
            <div className="mb-4">
              <label className="form-label">ปักหมุดตำแหน่งร้าน</label>
              <MapPicker
                initialLat={lat}
                initialLng={lng}
                onLocationChange={(la, ln) => {
                  setLat(la)
                  setLng(ln)
                }}
              />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving || uploading}
          className="btn bg-primary hover:bg-primary-hover text-white disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
        </button>
      </div>
    </div>
  )
}
