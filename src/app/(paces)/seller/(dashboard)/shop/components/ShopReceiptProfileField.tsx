'use client'

/**
 * ShopReceiptProfileField — การ์ด "ข้อมูลออกใบเสร็จ" ของร้านบริการ (feature 00065, UX spec S2)
 *
 * Base: src/app/(paces)/seller/(dashboard)/shop/components/ShopPayoutField.tsx
 *   (การ์ดเสริม submit endpoint ของตัวเอง, ปุ่ม "บันทึกการเปลี่ยนแปลง" คำเดียวกัน — sibling parity)
 * Base (อัปโหลดรูป): ShopForm.tsx handleLogoUpload (`uploadFileId(file, 'IMAGE')`)
 *
 * ไม่ต้อง reauth ต่างจากบัญชีรับเงิน — ข้อมูลนี้แสดงบนกระดาษ ไม่ได้เปลี่ยนทางเงิน
 * 🛑 "เบอร์โทรบนใบเสร็จ" คนละช่องกับเบอร์ของบัญชี (immutable) — อันนี้แก้ได้ แค่พิมพ์ลงกระดาษ
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { uploadFileId } from '@/lib/upload-client'
import { toFileUrl } from '@/lib/file-url'
import { TAX_ID_RE } from '@/lib/receipt'

export type ReceiptProfileValue = {
  legalName: string | null
  address: string | null
  taxId: string | null
  phone: string | null
  stamp: string | null
}

export default function ShopReceiptProfileField({
  shopName,
  profile,
}: {
  shopName: string
  profile: ReceiptProfileValue | null
}) {
  const router = useRouter()
  const [legalName, setLegalName] = useState(profile?.legalName ?? '')
  const [address, setAddress] = useState(profile?.address ?? '')
  const [taxId, setTaxId] = useState(profile?.taxId ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [stamp, setStamp] = useState(profile?.stamp ?? '')
  const [taxError, setTaxError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      setStamp(await uploadFileId(file, 'IMAGE'))
      pacesToast.success('อัปโหลดตราประทับแล้ว — กดบันทึกเพื่อใช้งาน')
    } catch (err) {
      // uploadFileId throw เหตุผลจริง (ชนิด/ขนาด/เน็ตขาด) — ข้อความกลาง ๆ ทำให้ผู้ใช้ลองไฟล์เดิมซ้ำ
      pacesToast.error(err instanceof Error && err.message ? err.message : 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    const normalizedTax = taxId.replace(/[\s-]/g, '')
    if (normalizedTax && !TAX_ID_RE.test(normalizedTax)) {
      setTaxError('เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')
      return
    }
    setTaxError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/shops/receipt-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName, address, taxId: normalizedTax, phone, stamp: stamp || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data?.message === 'string' ? data.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
      setTaxId(data.taxId ?? '')
      pacesToast.success('บันทึกข้อมูลออกใบเสร็จแล้ว')
      router.refresh()
    } catch (err) {
      pacesToast.error(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  const busy = saving || uploading
  const stampUrl = toFileUrl(stamp)

  return (
    <div id="receipt-profile" className="card mt-5 scroll-mt-24">
      <div className="card-header">
        <div>
          <h4 className="card-title">ข้อมูลออกใบเสร็จ</h4>
          <p className="text-default-400 mb-0 mt-1 text-sm">ข้อมูลนี้จะแสดงบนใบเสร็จรับเงินที่พิมพ์ให้ลูกค้า</p>
        </div>
      </div>
      <div className="card-body">
        <div className="grid grid-cols-1 gap-x-base gap-y-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="receipt-legal-name" className="form-label">
              ชื่อบนใบเสร็จ
            </label>
            <input
              id="receipt-legal-name"
              type="text"
              className="form-input"
              placeholder={shopName}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              disabled={busy}
              maxLength={200}
              aria-describedby="receipt-legal-name-help"
            />
            <p id="receipt-legal-name-help" className="text-default-400 mt-1 text-sm">
              ไม่กรอกจะใช้ชื่อร้าน &ldquo;{shopName}&rdquo;
            </p>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="receipt-address" className="form-label">
              ที่อยู่บนใบเสร็จ
            </label>
            <textarea
              id="receipt-address"
              rows={3}
              className="form-input"
              placeholder="เลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={busy}
              maxLength={500}
              aria-describedby="receipt-address-help"
            />
            <p id="receipt-address-help" className="text-default-400 mt-1 text-sm">
              ไม่กรอกจะใช้ที่อยู่ของร้าน
            </p>
          </div>

          <div>
            <label htmlFor="receipt-tax-id" className="form-label">
              เลขประจำตัวผู้เสียภาษี <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
            </label>
            <input
              id="receipt-tax-id"
              type="text"
              inputMode="numeric"
              className="form-input"
              placeholder="0-0000-00000-00-0"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              disabled={busy}
              aria-invalid={Boolean(taxError)}
              aria-describedby={taxError ? 'receipt-tax-id-error' : undefined}
            />
            {taxError && (
              <p id="receipt-tax-id-error" className="text-danger mt-1 text-sm">
                {taxError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="receipt-phone" className="form-label">
              เบอร์โทรบนใบเสร็จ
            </label>
            <input
              id="receipt-phone"
              type="tel"
              className="form-input"
              placeholder="081-234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              maxLength={30}
              aria-describedby="receipt-phone-help"
            />
            <p id="receipt-phone-help" className="text-default-400 mt-1 text-sm">
              ไม่กรอกจะไม่แสดงเบอร์บนใบเสร็จ
            </p>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="receipt-stamp" className="form-label">
              ตราประทับ <span className="text-default-400 text-xs">(ไม่บังคับ)</span>
            </label>
            <div className="flex flex-wrap items-center gap-4">
              {stampUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- รูปจาก /api/files ขนาดเล็ก ไม่ต้อง optimize
                <img
                  src={stampUrl}
                  alt="ตราประทับปัจจุบัน"
                  className="bg-default-100 ring-default-200 size-20 rounded-lg object-contain ring-1"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <input
                  id="receipt-stamp"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="form-input"
                  onChange={handleStampUpload}
                  disabled={busy}
                  aria-describedby="receipt-stamp-help"
                />
                <p id="receipt-stamp-help" className="text-default-400 mt-1 text-sm">
                  แนะนำไฟล์ PNG พื้นใส · เปลี่ยนหรือเอาออกแล้วต้องกดบันทึก
                </p>
              </div>
              {stamp ? (
                <button
                  type="button"
                  onClick={() => setStamp('')}
                  disabled={busy}
                  className="btn border-default-300 text-default-700 min-h-11 border text-sm"
                >
                  เอาตราประทับออก
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="btn bg-primary hover:bg-primary-hover min-h-11 inline-flex w-full items-center justify-center gap-2 text-white disabled:opacity-50 md:w-auto"
          >
            {saving ? (
              <>
                <Icon icon="loader-2" className="animate-spin" aria-hidden="true" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Icon icon="device-floppy" aria-hidden="true" />
                บันทึกการเปลี่ยนแปลง
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
