'use client'

// แก้ไขโปรไฟล์ (mobile) — แก้ชื่อที่แสดงได้อย่างเดียว (username/เบอร์/อีเมล ล็อก); reuse PATCH /api/users/me.
// รูปโปรไฟล์เปลี่ยนที่ avatar หน้าบัญชี (AvatarEditable) แล้ว จึงไม่ซ้ำที่นี่.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'react-toastify'

type Props = {
  displayName: string
  username: string
  phone: string | null
  email: string | null
  summary: { trustScore: number; trustLevel: string; memberSince: string; badgeCount: number }
}

const ReadonlyRow = ({ icon, label, value, note, accent }: { icon: string; label: string; value: string; note?: string; accent?: boolean }) => (
  <div className='flex items-center gap-3 pli-4 plb-3 border-b border-[var(--mui-palette-divider)] last:border-b-0'>
    <i className={`${icon} text-[20px] shrink-0 ${accent ? 'text-[var(--mui-palette-primary-main)]' : 'text-[var(--mui-palette-text-secondary)]'}`} />
    <span className='text-[13px] text-[var(--mui-palette-text-secondary)] shrink-0'>{label}</span>
    <span className='flex-1 min-w-0 text-[14px] text-[var(--mui-palette-text-primary)] text-right truncate'>{value}</span>
    {note && <span className='text-[11px] text-[var(--mui-palette-text-disabled)] shrink-0'>{note}</span>}
  </div>
)

export default function ProfileEditMobile({ displayName, username, phone, email, summary }: Props) {
  const router = useRouter()
  const { update } = useSession()
  const [name, setName] = useState(displayName)
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const dirty = trimmed !== displayName && trimmed.length >= 2 && trimmed.length <= 50

  const onSave = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed })
      })
      if (!res.ok) throw new Error()
      toast.success('บันทึกโปรไฟล์แล้ว')
      await update()
      router.refresh()
    } catch {
      toast.error('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className='flex flex-col gap-5'>
      {/* ชื่อที่แสดง (แก้ได้) */}
      <div className='flex flex-col gap-2'>
        <label className='text-[13px] font-semibold pli-1 text-[var(--mui-palette-text-secondary)]'>ชื่อที่แสดง</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={50}
          placeholder='ชื่อ-นามสกุล หรือชื่อเล่น'
          className='h-11 pli-4 rounded bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] text-[15px] text-[var(--mui-palette-text-primary)] outline-none focus:border-[var(--mui-palette-primary-main)] transition-colors'
        />
        {trimmed.length > 0 && trimmed.length < 2 && (
          <span className='text-[12px] pli-1 text-[var(--mui-palette-error-main)]'>อย่างน้อย 2 ตัวอักษร</span>
        )}
      </div>

      {/* ข้อมูลที่แก้ไม่ได้ */}
      <div className='flex flex-col gap-2'>
        <span className='text-[13px] font-semibold pli-1 text-[var(--mui-palette-text-secondary)]'>ข้อมูลบัญชี</span>
        <div className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] overflow-hidden'>
          <ReadonlyRow icon='tabler-at' label='ชื่อผู้ใช้' value={`@${username}`} note='ล็อก' />
          <ReadonlyRow icon='tabler-phone' label='เบอร์โทร' value={phone ?? '-'} note={phone ? 'ยืนยันแล้ว' : undefined} />
          <ReadonlyRow icon='tabler-mail' label='อีเมล' value={email ?? '-'} note='เร็วๆ นี้' />
        </div>
      </div>

      {/* สรุป */}
      <div className='flex flex-col gap-2'>
        <span className='text-[13px] font-semibold pli-1 text-[var(--mui-palette-text-secondary)]'>สรุป</span>
        <div className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] overflow-hidden'>
          <ReadonlyRow icon='tabler-shield-check' label='Trust Score' value={`${summary.trustScore} · ${summary.trustLevel}`} accent />
          <ReadonlyRow icon='tabler-calendar' label='สมาชิกตั้งแต่' value={summary.memberSince} />
          <ReadonlyRow icon='tabler-award' label='Badge' value={`${summary.badgeCount} รายการ`} />
        </div>
      </div>

      {/* บันทึก */}
      <button
        type='button'
        onClick={onSave}
        disabled={!dirty || saving}
        className='h-11 rounded text-[15px] font-medium text-white bg-[var(--mui-palette-primary-main)] border-0 cursor-pointer active:opacity-80 transition-opacity disabled:opacity-50'
      >
        {saving ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </div>
  )
}
