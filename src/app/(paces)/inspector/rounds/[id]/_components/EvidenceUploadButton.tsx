'use client'

/**
 * EvidenceUploadButton — แนบไฟล์หลักฐานต่อข้อตรวจ (feature 00060 · T13 · API §3.4/§4.8)
 *
 * Base: Paces `.btn` primitive (§1 ของ paces-component-reference.md, ที่มา
 *   theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx — ปุ่ม soft `bg-{color}/15`)
 *
 * 🛑 **ห้ามส่งไฟล์ผ่าน body ของ API** — ใช้ `@/lib/upload-client` (ticket → PUT → commit)
 * เท่านั้น ตาม `docs/conventions/upload-body-size-limit.md` และ API §3.4
 *
 * `capture="environment"` เปิดกล้องหลังตรงบนมือถือ — ผู้ตรวจยืนอยู่หน้างานจริง ไม่ต้องเข้า
 * gallery ก่อน (ยังเลือกจาก gallery ได้ตามปกติถ้าอุปกรณ์ไม่รองรับ capture)
 */

import { useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { uploadToStorage } from '@/lib/upload-client'
import { pacesToast } from '@/lib/paces-toast'

export type UploadKind = 'PHOTO' | 'VIDEO_STILL' | 'DOCUMENT'

type Props = {
  label: string
  kind: UploadKind
  /** true = แนบได้หลายไฟล์ต่อครั้ง (เช่น อัลบั้มภาพขั้น 4) */
  multiple?: boolean
  disabled?: boolean
  onUploaded: (fileId: string) => void
}

// PHOTO/VIDEO_STILL คือรูปที่ผู้ตรวจถ่ายเอง → purpose 'IMAGE'; DOCUMENT (ตรวจเอกสาร) → 'DOCUMENT'
const PURPOSE_OF: Record<UploadKind, 'IMAGE' | 'DOCUMENT'> = {
  PHOTO: 'IMAGE',
  VIDEO_STILL: 'IMAGE',
  DOCUMENT: 'DOCUMENT',
}
const ACCEPT_OF: Record<UploadKind, string> = {
  PHOTO: 'image/*',
  VIDEO_STILL: 'image/*',
  DOCUMENT: 'image/*,.pdf',
}

export default function EvidenceUploadButton({ label, kind, multiple = false, disabled = false, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadToStorage(file, { purpose: PURPOSE_OF[kind] })
        onUploaded(uploaded.fileId)
      }
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'แนบไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_OF[kind]}
        capture={kind === 'DOCUMENT' ? undefined : 'environment'}
        multiple={multiple}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        className="btn btn-sm inline-flex items-center gap-1.5 border border-default-300 text-default-800"
      >
        {busy ? (
          <Icon icon="loader-2" className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Icon icon="camera" className="size-3.5" aria-hidden="true" />
        )}
        {busy ? 'กำลังอัปโหลด…' : label}
      </button>
    </>
  )
}
