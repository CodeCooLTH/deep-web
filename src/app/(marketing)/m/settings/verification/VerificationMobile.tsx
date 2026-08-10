'use client'

// ยืนยันตัวตน (mobile) — L1 (เบอร์/อีเมล), L2 (บัตร+เซลฟี่), L3 (ทะเบียนธุรกิจ).
// reuse API เดิมเป๊ะ: POST /api/upload → fileId, POST /api/verification { type, level, documents }.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import { uploadFileId } from '@/lib/upload-client'

type VerificationRecord = {
  id: string
  type: string
  level: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectedReason: string | null
  createdAt: string
}
type Props = { phoneVerified: boolean; records: VerificationRecord[] }
type LevelState = 'APPROVED' | 'PENDING' | 'REJECTED' | 'NONE'

// priority APPROVED > PENDING > REJECTED > NONE
const levelStatus = (records: VerificationRecord[], level: number): { state: LevelState; record: VerificationRecord | null } => {
  const forLevel = records.filter(r => r.level === level)
  for (const s of ['APPROVED', 'PENDING', 'REJECTED'] as const) {
    const rec = forLevel.find(r => r.status === s)
    if (rec) return { state: s, record: rec }
  }
  return { state: 'NONE', record: null }
}

const STATUS_META: Record<LevelState, { label: string; color: string }> = {
  APPROVED: { label: 'ยืนยันแล้ว', color: 'success' },
  PENDING: { label: 'กำลังตรวจสอบ', color: 'warning' },
  REJECTED: { label: 'ถูกปฏิเสธ — ส่งใหม่ได้', color: 'error' },
  NONE: { label: 'ยังไม่ยืนยัน', color: 'secondary' }
}

const Chip = ({ label, color }: { label: string; color: string }) => (
  <span
    className='inline-flex items-center text-[11px] font-medium leading-none pli-2 plb-1 rounded-full shrink-0'
    style={{ background: `var(--mui-palette-${color}-lightOpacity)`, color: `var(--mui-palette-${color}-main)` }}
  >
    {label}
  </span>
)

const Card = ({
  level,
  title,
  subtitle,
  state,
  children
}: {
  level: number
  title: string
  subtitle: string
  state: LevelState
  children?: React.ReactNode
}) => (
  <div className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] p-4 flex flex-col gap-3'>
    <div className='flex items-start justify-between gap-2'>
      <div className='flex items-center gap-2.5 min-w-0'>
        <span className='size-9 rounded-xl bg-[var(--mui-palette-primary-lightOpacity)] flex items-center justify-center text-[13px] font-bold text-[var(--mui-palette-primary-main)] shrink-0'>
          L{level}
        </span>
        <div className='min-w-0'>
          <p className='text-[14px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>{title}</p>
          <p className='text-[12px] m-0 text-[var(--mui-palette-text-secondary)] truncate'>{subtitle}</p>
        </div>
      </div>
      <Chip label={STATUS_META[state].label} color={STATUS_META[state].color} />
    </div>
    {children}
  </div>
)

export default function VerificationMobile({ phoneVerified, records }: Props) {
  const router = useRouter()
  const l2 = levelStatus(records, 2)
  const l3 = levelStatus(records, 3)

  const [submittingL2, setSubmittingL2] = useState(false)
  const [submittingL3, setSubmittingL3] = useState(false)
  const [idCardFile, setIdCardFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [bizFile, setBizFile] = useState<File | null>(null)
  const idCardInput = useRef<HTMLInputElement>(null)
  const selfieInput = useRef<HTMLInputElement>(null)
  const bizInput = useRef<HTMLInputElement>(null)

  const validateFile = (f: File, allowPdf = false): boolean => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', ...(allowPdf ? ['application/pdf'] : [])]
    if (!ok.includes(f.type)) {
      toast.error(allowPdf ? 'รองรับ JPG / PNG / WEBP / PDF' : 'รองรับ JPG / PNG / WEBP')
      return false
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('ไฟล์ใหญ่เกิน 5MB')
      return false
    }
    return true
  }

  // direct upload (2026-08-10) — เดิมส่งผ่าน body ของ function ที่ Vercel จำกัด 4.5MB ทั้งที่
  // หน้านี้บอกผู้ใช้ว่ารับถึง 5MB. throw แทน return null เพื่อไม่ยุบทุกเหตุผลเป็น "ไม่สำเร็จ"
  const uploadFile = async (file: File): Promise<string> => uploadFileId(file, 'DOCUMENT')

  const submitL2 = async () => {
    if (!idCardFile || !selfieFile) {
      toast.error('กรุณาเลือกทั้งบัตรประชาชนและเซลฟี่')
      return
    }
    setSubmittingL2(true)
    try {
      const [idCard, selfie] = await Promise.all([uploadFile(idCardFile), uploadFile(selfieFile)])
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ID_CARD', level: 2, documents: { idCard, selfie } })
      })
      if (!res.ok) throw new Error()
      toast.success('ส่งเอกสารแล้ว รอแอดมินตรวจสอบ')
      setIdCardFile(null)
      setSelfieFile(null)
      router.refresh()
    } catch (e) {
      // uploadFile throw ข้อความไทยที่พร้อมโชว์ (ชนิดไฟล์/ขนาด/เน็ตขาด); `throw new Error()` เปล่า
      // จากด่านอื่นไม่มี message จึงตกไปข้อความกลางตามเดิม
      toast.error(e instanceof Error && e.message ? e.message : 'ส่งเอกสารไม่สำเร็จ')
    } finally {
      setSubmittingL2(false)
    }
  }

  const submitL3 = async () => {
    if (!bizFile) {
      toast.error('กรุณาเลือกเอกสารจดทะเบียนธุรกิจ')
      return
    }
    setSubmittingL3(true)
    try {
      const doc = await uploadFile(bizFile)
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'BUSINESS_REG', level: 3, documents: { doc } })
      })
      if (!res.ok) throw new Error()
      toast.success('ส่งเอกสารแล้ว รอแอดมินตรวจสอบ')
      setBizFile(null)
      router.refresh()
    } catch (e) {
      // uploadFile throw ข้อความไทยที่พร้อมโชว์ (ชนิดไฟล์/ขนาด/เน็ตขาด); `throw new Error()` เปล่า
      // จากด่านอื่นไม่มี message จึงตกไปข้อความกลางตามเดิม
      toast.error(e instanceof Error && e.message ? e.message : 'ส่งเอกสารไม่สำเร็จ')
    } finally {
      setSubmittingL3(false)
    }
  }

  const InfoRow = ({ icon, label, sub, chip }: { icon: string; label: string; sub: string; chip: React.ReactNode }) => (
    <div className='flex items-center gap-2.5'>
      <i className={`${icon} text-[20px] text-[var(--mui-palette-text-secondary)] shrink-0`} />
      <div className='flex-1 min-w-0'>
        <p className='text-[13px] m-0 text-[var(--mui-palette-text-primary)]'>{label}</p>
        <p className='text-[12px] m-0 text-[var(--mui-palette-text-disabled)] truncate'>{sub}</p>
      </div>
      {chip}
    </div>
  )

  const UploadRow = ({
    icon,
    label,
    file,
    onPick,
    onClear
  }: {
    icon: string
    label: string
    file: File | null
    onPick: () => void
    onClear: () => void
  }) => (
    <div className='flex items-center gap-3 rounded-xl border border-[var(--mui-palette-divider)] p-2.5'>
      <span className='size-10 rounded-lg bg-[var(--mui-palette-action-hover)] flex items-center justify-center shrink-0'>
        <i className={`${icon} text-[20px] text-[var(--mui-palette-primary-main)]`} />
      </span>
      <div className='flex-1 min-w-0'>
        <p className='text-[13px] font-medium m-0 text-[var(--mui-palette-text-primary)]'>{label}</p>
        <p className='text-[12px] m-0 text-[var(--mui-palette-text-disabled)] truncate'>{file?.name ?? 'ยังไม่ได้เลือกไฟล์'}</p>
      </div>
      {file ? (
        <button type='button' onClick={onClear} className='text-[12px] text-[var(--mui-palette-error-main)] border-0 bg-transparent cursor-pointer shrink-0'>
          ล้าง
        </button>
      ) : (
        <button type='button' onClick={onPick} className='text-[12px] font-medium text-[var(--mui-palette-primary-main)] border-0 bg-transparent cursor-pointer shrink-0'>
          เลือกไฟล์
        </button>
      )}
    </div>
  )

  const SubmitBtn = ({ onClick, disabled, busy }: { onClick: () => void; disabled: boolean; busy: boolean }) => (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className='h-10 rounded-lg text-[14px] font-medium text-white bg-[var(--mui-palette-primary-main)] border-0 cursor-pointer active:opacity-80 transition-opacity disabled:opacity-50'
    >
      {busy ? 'กำลังส่ง…' : 'ส่งเอกสารตรวจสอบ'}
    </button>
  )

  return (
    <div className='flex flex-col gap-3'>
      {/* L1 */}
      <Card level={1} title='ยืนยันพื้นฐาน' subtitle='เบอร์โทร / อีเมล' state={phoneVerified ? 'APPROVED' : 'NONE'}>
        <div className='flex flex-col gap-2.5 pbs-1'>
          <InfoRow
            icon='tabler-phone'
            label='เบอร์โทรศัพท์'
            sub={phoneVerified ? 'ยืนยันแล้วผ่าน OTP' : 'ยังไม่ได้ยืนยันเบอร์'}
            chip={<Chip label={phoneVerified ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'} color={phoneVerified ? 'success' : 'secondary'} />}
          />
          <InfoRow icon='tabler-mail' label='อีเมล' sub='ยังไม่เปิดให้ยืนยันในเวอร์ชันนี้' chip={<Chip label='เร็วๆ นี้' color='warning' />} />
        </div>
      </Card>

      {/* L2 */}
      <Card level={2} title='บัตรประชาชน + เซลฟี่' subtitle='ยืนยันตัวตนระดับกลาง' state={l2.state}>
        {l2.state === 'REJECTED' && l2.record?.rejectedReason && (
          <p className='text-[12px] m-0 text-[var(--mui-palette-error-main)]'>เหตุผลที่ปฏิเสธ: {l2.record.rejectedReason}</p>
        )}
        {l2.state === 'APPROVED' ? (
          <p className='text-[13px] m-0 text-[var(--mui-palette-text-secondary)]'>ยืนยันตัวตนระดับ 2 สำเร็จแล้ว</p>
        ) : l2.state === 'PENDING' ? (
          <p className='text-[13px] m-0 text-[var(--mui-palette-text-secondary)]'>เอกสารอยู่ระหว่างตรวจสอบ รอแอดมินยืนยัน</p>
        ) : (
          <div className='flex flex-col gap-2.5'>
            <UploadRow icon='tabler-id' label='บัตรประชาชน (ด้านหน้า)' file={idCardFile} onPick={() => idCardInput.current?.click()} onClear={() => setIdCardFile(null)} />
            <UploadRow icon='tabler-camera-selfie' label='เซลฟี่คู่กับบัตร' file={selfieFile} onPick={() => selfieInput.current?.click()} onClear={() => setSelfieFile(null)} />
            <SubmitBtn onClick={submitL2} disabled={submittingL2 || !idCardFile || !selfieFile} busy={submittingL2} />
            <input
              ref={idCardInput}
              type='file'
              accept='image/png, image/jpeg, image/webp'
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f && validateFile(f)) setIdCardFile(f)
              }}
            />
            <input
              ref={selfieInput}
              type='file'
              accept='image/png, image/jpeg, image/webp'
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f && validateFile(f)) setSelfieFile(f)
              }}
            />
          </div>
        )}
      </Card>

      {/* L3 */}
      <Card level={3} title='จดทะเบียนธุรกิจ' subtitle='ภพ.20 / ทะเบียนพาณิชย์' state={l3.state}>
        {l3.state === 'REJECTED' && l3.record?.rejectedReason && (
          <p className='text-[12px] m-0 text-[var(--mui-palette-error-main)]'>เหตุผลที่ปฏิเสธ: {l3.record.rejectedReason}</p>
        )}
        {l3.state === 'APPROVED' ? (
          <p className='text-[13px] m-0 text-[var(--mui-palette-text-secondary)]'>ยืนยันตัวตนระดับ 3 สำเร็จแล้ว</p>
        ) : l3.state === 'PENDING' ? (
          <p className='text-[13px] m-0 text-[var(--mui-palette-text-secondary)]'>เอกสารอยู่ระหว่างตรวจสอบ รอแอดมินยืนยัน</p>
        ) : (
          <div className='flex flex-col gap-2.5'>
            <UploadRow icon='tabler-file-certificate' label='เอกสารจดทะเบียนธุรกิจ' file={bizFile} onPick={() => bizInput.current?.click()} onClear={() => setBizFile(null)} />
            <SubmitBtn onClick={submitL3} disabled={submittingL3 || !bizFile} busy={submittingL3} />
            <input
              ref={bizInput}
              type='file'
              accept='image/png, image/jpeg, image/webp, application/pdf'
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f && validateFile(f, true)) setBizFile(f)
              }}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
