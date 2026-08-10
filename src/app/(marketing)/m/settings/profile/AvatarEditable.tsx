'use client'

// avatar ที่แตะเปลี่ยนรูปได้ (mobile hub) — มือถือไม่มี AccountSidebar (desktop) จึงย้าย
// การเปลี่ยนรูปมาไว้ที่ avatar ในหัวโปรไฟล์แทน. flow เดิม: /api/upload → PATCH /api/users/me
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'react-toastify'
import { uploadFileId } from '@/lib/upload-client'

import CustomAvatar from '@core/components/mui/Avatar'

type Props = { src?: string; fallback: string; size?: number }

export default function AvatarEditable({ src, fallback, size = 70 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { update } = useSession()
  const [busy, setBusy] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // uncontrolled — reset กันเลือกไฟล์เดิมซ้ำไม่ trigger
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกิน 5MB')
      return
    }
    setBusy(true)
    try {
      // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
      const fileId = await uploadFileId(file, 'IMAGE')
      const save = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: `/api/files/${fileId}` })
      })
      if (!save.ok) throw new Error()
      toast.success('เปลี่ยนรูปโปรไฟล์แล้ว')
      await update()
      router.refresh()
    } catch {
      toast.error('เปลี่ยนรูปไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type='button'
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      aria-label='เปลี่ยนรูปโปรไฟล์'
      className='relative block p-0 border-0 bg-transparent cursor-pointer disabled:opacity-60'
    >
      <CustomAvatar src={src} size={size}>
        {fallback}
      </CustomAvatar>
      {/* badge กล้องมุมขวาล่าง */}
      <span className='absolute -bottom-0.5 -right-0.5 size-6 rounded-full bg-[var(--mui-palette-primary-main)] border-2 border-[var(--mui-palette-background-paper)] flex items-center justify-center'>
        <i className={`${busy ? 'tabler-loader-2 animate-spin' : 'tabler-camera'} text-[13px] text-white`} />
      </span>
      <input
        ref={inputRef}
        type='file'
        accept='image/png, image/jpeg, image/webp'
        hidden
        onChange={handleChange}
      />
    </button>
  )
}
