'use client'

/**
 * useSlipUpload — state + handler แนบสลิปของผู้ซื้อ (00068 TD-005)
 * สกัดตรง ๆ จาก `handleSlipUpload` ใน OrderDetailMobile — เส้นทางเดิมทุกบรรทัด
 *
 * 🛑 ผู้เรียกต้อง destructure ค่าที่ต้องใช้ ห้ามเอา object ที่ hook คืนทั้งก้อนไปใส่ dep array
 * (docs/conventions/hook-return-identity-in-deps.md) — object นี้เกิดใหม่ทุก render
 * `upload` เองเสถียร (useCallback ผูกกับ token) จึงใส่ deps ได้
 *
 * Base: N/A (hook ไม่มี UI) — ยกจาก `./OrderDetailMobile.tsx` `handleSlipUpload`
 */

import { useCallback, useRef, useState } from 'react'

import { toast } from 'react-toastify'

import { uploadFileId } from '@/lib/upload-client'

export function useSlipUpload(token: string, initialSlipFileId: string | null) {
  // slipFileId เริ่มจาก server (order.slipFileId) — อัปโหลดใหม่แล้วอัปเดต local state
  const [slipFileId, setSlipFileId] = useState(initialSlipFileId)
  // object URL สร้างใน session นี้เท่านั้น — ไม่ fetch กลับจาก server
  const [slipPreview, setSlipPreview] = useState<string | null>(null)
  const [slipName, setSlipName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // hidden file input ref — ผู้เรียกสั่ง .click() เอง
  const inputRef = useRef<HTMLInputElement>(null)

  // feature 00015 TD-004: ไม่ส่ง contact — server ยืนยันด้วย session+ownership
  const upload = useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        // direct upload: ticket → PUT เข้า storage ตรง → commit
        // 🛑 ห้ามกลับไปส่งไฟล์ผ่าน body ของ API route (ตัน 4.5MB — docs/conventions/upload-body-size-limit.md)
        const fileId = await uploadFileId(file, 'DOCUMENT')

        const res = await fetch(`/api/orders/${token}/slip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId }),
        })

        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null

          toast.error(err?.error || 'แนบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')

          return
        }

        const data = (await res.json()) as { slipFileId: string }

        setSlipFileId(data.slipFileId)
        setSlipPreview(URL.createObjectURL(file))
        setSlipName(file.name)
        toast.success('แนบสลิปแล้ว')
      } catch (err) {
        // uploadFileId โยน Error ข้อความไทยบอกสาเหตุจริง (ไฟล์ใหญ่เกิน/ชนิดไม่รองรับ) — ใช้ก่อนข้อความกลางเสมอ
        // "ลองอีกครั้ง" กับไฟล์ที่ใหญ่เกินคือคำเชิญให้ทำสิ่งที่ไม่มีวันสำเร็จ
        toast.error(err instanceof Error ? err.message : 'แนบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      } finally {
        setUploading(false)
        // reset เพื่อให้เลือกไฟล์เดิมซ้ำได้ (onChange ไม่ยิงถ้า value ไม่เปลี่ยน)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [token],
  )

  return { slipFileId, slipPreview, slipName, uploading, inputRef, upload }
}
