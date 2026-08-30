'use client'

// Base (composed from multiple account-settings primitives — no single template):
//   - theme/vuexy/typescript-version/full-version/src/views/pages/account-settings/security/TwoFactorAuthenticationCard.tsx
//     → Card + CardHeader + CardContent + "description + action" pattern (L1 phone/email tiles)
//   - theme/vuexy/typescript-version/full-version/src/views/pages/account-settings/connections/index.tsx
//     → item row pattern: icon/thumbnail + title/subtitle + status chip + action button (L1 tiles, L2/L3 upload rows)
//   - theme/vuexy/typescript-version/full-version/src/views/pages/account-settings/security/ChangePasswordCard.tsx
//     → Grid-based form with `mbs-*`/`mbe-*` logical-property utility classes
// Dropped: Switch toggles, OpenDialogOnElementClick, CustomTextField password fields.

import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
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

type Props = {
  phoneVerified: boolean
  records: VerificationRecord[]
}

type LevelState = 'APPROVED' | 'PENDING' | 'REJECTED' | 'NONE'

function levelStatus(records: VerificationRecord[], level: number) {
  const list = records.filter((r) => r.level === level)
  const approved = list.find((r) => r.status === 'APPROVED')
  if (approved) return { state: 'APPROVED' as const, record: approved }
  const pending = list.find((r) => r.status === 'PENDING')
  if (pending) return { state: 'PENDING' as const, record: pending }
  const rejected = list.find((r) => r.status === 'REJECTED')
  if (rejected) return { state: 'REJECTED' as const, record: rejected }
  return { state: 'NONE' as const, record: null }
}

/**
 * direct upload (2026-08-10) — เดิมส่งผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
 * ทั้งที่หน้านี้บอกผู้ใช้ว่ารับถึง 5MB → ไฟล์ในช่วง 4.5–5MB ล้มโดยไม่มีใครรู้สาเหตุ
 *
 * throw แทน `return null` เพราะเหตุผลที่ล้มมีหลายแบบ (ชนิดไฟล์/ขนาด/เน็ตขาด) และ server
 * คืนข้อความไทยที่พร้อมโชว์มาแล้ว — การยุบทุกเหตุเป็น null ทำให้ผู้ใช้เห็นแต่ "ไม่สำเร็จ"
 */
async function uploadFile(file: File): Promise<string> {
  return uploadFileId(file, 'DOCUMENT')
}

export default function VerificationClient({ phoneVerified, records }: Props) {
  const router = useRouter()
  const l2 = levelStatus(records, 2)
  const l3 = levelStatus(records, 3)

  const [submittingL2, setSubmittingL2] = useState(false)
  const [submittingL3, setSubmittingL3] = useState(false)
  const [idCardFile, setIdCardFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [bizFile, setBizFile] = useState<File | null>(null)
  const idCardInput = useRef<HTMLInputElement | null>(null)
  const selfieInput = useRef<HTMLInputElement | null>(null)
  const bizInput = useRef<HTMLInputElement | null>(null)

  const submitL2 = async () => {
    if (!idCardFile || !selfieFile) {
      toast.error('กรุณาอัพโหลดทั้งบัตรประชาชนและเซลฟี่')
      return
    }
    setSubmittingL2(true)
    try {
      const [idCardId, selfieId] = await Promise.all([
        uploadFile(idCardFile),
        uploadFile(selfieFile),
      ])
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ID_CARD',
          level: 2,
          documents: { idCard: idCardId, selfie: selfieId },
        }),
      })
      if (!res.ok) {
        toast.error('ส่งเอกสารไม่สำเร็จ')
        return
      }
      toast.success('ส่งเอกสารแล้ว รอแอดมินตรวจสอบ')
      setIdCardFile(null)
      setSelfieFile(null)
      router.refresh()
    } catch (e) {
      // uploadFile throw ข้อความไทยที่พร้อมโชว์มาแล้ว (ชนิดไฟล์/ขนาด/เน็ตขาด) — เดิมบล็อกนี้ไม่มี catch
      // เลย ถ้าอัปโหลดล้มจะไม่มีอะไรขึ้นบนจอสักอย่าง มีแต่สปินเนอร์หยุดหมุน
      toast.error(e instanceof Error && e.message ? e.message : 'อัพโหลดรูปไม่สำเร็จ')
    } finally {
      setSubmittingL2(false)
    }
  }

  const submitL3 = async () => {
    if (!bizFile) {
      toast.error('กรุณาอัพโหลดเอกสารจดทะเบียนธุรกิจ')
      return
    }
    setSubmittingL3(true)
    try {
      const docId = await uploadFile(bizFile)
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'BUSINESS_REG',
          level: 3,
          documents: { doc: docId },
        }),
      })
      if (!res.ok) {
        toast.error('ส่งเอกสารไม่สำเร็จ')
        return
      }
      toast.success('ส่งเอกสารแล้ว รอแอดมินตรวจสอบ')
      setBizFile(null)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'อัพโหลดเอกสารไม่สำเร็จ')
    } finally {
      setSubmittingL3(false)
    }
  }

  const validateFile = (f: File): boolean => {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) &&
      f.type !== 'application/pdf'
    ) {
      toast.error('รองรับเฉพาะ JPG, PNG, WEBP, PDF')
      return false
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('ไฟล์ต้องไม่เกิน 5MB')
      return false
    }
    return true
  }

  return (
    <Grid container spacing={6}>
      {/* Level 1 — base: security/TwoFactorAuthenticationCard.tsx + connections/index.tsx row pattern */}
      <Grid size={{ xs: 12 }}>
        <Card>
          <CardHeader
            title='ระดับ 1 — ยืนยันตัวตนพื้นฐาน'
            subheader='ยืนยันเบอร์โทรและอีเมลเพื่อเริ่มต้น'
            action={<Chip size='small' label='L1' color='info' variant='tonal' />}
          />
          <CardContent className='flex flex-col gap-4'>
            <div className='flex items-center justify-between gap-4'>
              <div className='flex grow items-center gap-4'>
                <div className='flex is-[40px] bs-[40px] items-center justify-center rounded bg-[var(--mui-palette-primary-lightOpacity)]'>
                  <i className='tabler-phone text-xl text-[var(--mui-palette-primary-main)]' />
                </div>
                <div className='grow'>
                  <Typography className='text-textPrimary font-medium'>เบอร์โทรศัพท์</Typography>
                  <Typography variant='body2'>
                    {phoneVerified ? 'ยืนยันแล้วผ่าน OTP' : 'ยังไม่ได้ยืนยันเบอร์'}
                  </Typography>
                </div>
              </div>
              <Chip
                size='small'
                color={phoneVerified ? 'success' : 'default'}
                label={phoneVerified ? 'ยืนยันแล้ว' : 'ยังไม่ยืนยัน'}
                variant={phoneVerified ? 'tonal' : 'outlined'}
              />
            </div>

            <div className='flex items-center justify-between gap-4'>
              <div className='flex grow items-center gap-4'>
                <div className='flex is-[40px] bs-[40px] items-center justify-center rounded bg-[var(--mui-palette-primary-lightOpacity)]'>
                  <i className='tabler-mail text-xl text-[var(--mui-palette-primary-main)]' />
                </div>
                <div className='grow'>
                  <Typography className='text-textPrimary font-medium'>อีเมล</Typography>
                  <Typography variant='body2'>ยังไม่เปิดให้ยืนยันในเวอร์ชันนี้</Typography>
                </div>
              </div>
              <Chip size='small' label='เร็วๆ นี้' variant='outlined' />
            </div>
          </CardContent>
        </Card>
      </Grid>

      {/* Level 2 — base: security/TwoFactorAuthenticationCard.tsx header + ChangePasswordCard.tsx grid form */}
      <Grid size={{ xs: 12 }}>
        <Card>
          <CardHeader
            title='ระดับ 2 — บัตรประชาชน + เซลฟี่'
            subheader='ส่งรูปบัตรประชาชนและเซลฟี่คู่กับบัตร ทีมงานจะตรวจสอบภายใน 1-2 วัน'
            action={
              <div className='flex items-center gap-2'>
                <Chip size='small' label='L2' color='info' variant='tonal' />
                <StatusChip state={l2.state} />
              </div>
            }
          />
          <CardContent className='flex flex-col gap-4'>
            {l2.state === 'REJECTED' && l2.record?.rejectedReason && (
              <Typography color='error.main' className='text-[13px]'>
                เหตุผลที่ปฏิเสธ: {l2.record.rejectedReason}
              </Typography>
            )}

            {(l2.state === 'NONE' || l2.state === 'REJECTED') && (
              <>
                <Grid container spacing={4}>
                  <Grid size={{ xs: 12 }}>
                    <UploadRow
                      label='บัตรประชาชน (ด้านหน้า)'
                      file={idCardFile}
                      onPick={() => idCardInput.current?.click()}
                      onClear={() => setIdCardFile(null)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <UploadRow
                      label='เซลฟี่คู่กับบัตร'
                      file={selfieFile}
                      onPick={() => selfieInput.current?.click()}
                      onClear={() => setSelfieFile(null)}
                    />
                  </Grid>
                </Grid>

                <input
                  ref={idCardInput}
                  type='file'
                  accept='image/jpeg,image/png,image/webp'
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && validateFile(f)) setIdCardFile(f)
                    e.target.value = ''
                  }}
                />
                <input
                  ref={selfieInput}
                  type='file'
                  accept='image/jpeg,image/png,image/webp'
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && validateFile(f)) setSelfieFile(f)
                    e.target.value = ''
                  }}
                />

                <div className='flex justify-end mbs-2'>
                  <Button
                    variant='contained'
                    onClick={submitL2}
                    disabled={submittingL2 || !idCardFile || !selfieFile}
                  >
                    {submittingL2 ? 'กำลังส่ง…' : 'ส่งเอกสารตรวจสอบ'}
                  </Button>
                </div>
              </>
            )}

            {l2.state === 'PENDING' && (
              <Typography color='text.secondary' className='text-[13px]'>
                เอกสารของคุณอยู่ระหว่างตรวจสอบ ทีมงานจะแจ้งผลภายใน 1-2 วัน
              </Typography>
            )}

            {l2.state === 'APPROVED' && (
              <Typography color='text.secondary' className='text-[13px]'>
                ยืนยันตัวตนระดับ 2 สำเร็จแล้ว
              </Typography>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Level 3 — same composition as L2 with a single upload row */}
      <Grid size={{ xs: 12 }}>
        <Card>
          <CardHeader
            title='ระดับ 3 — จดทะเบียนธุรกิจ'
            subheader='สำหรับผู้ประกอบการที่จดทะเบียนธุรกิจ ส่งเอกสารทางราชการเพื่อยืนยัน'
            action={
              <div className='flex items-center gap-2'>
                <Chip size='small' label='L3' color='info' variant='tonal' />
                <StatusChip state={l3.state} />
              </div>
            }
          />
          <CardContent className='flex flex-col gap-4'>
            {l3.state === 'REJECTED' && l3.record?.rejectedReason && (
              <Typography color='error.main' className='text-[13px]'>
                เหตุผลที่ปฏิเสธ: {l3.record.rejectedReason}
              </Typography>
            )}

            {(l3.state === 'NONE' || l3.state === 'REJECTED') && (
              <>
                <UploadRow
                  label='เอกสารจดทะเบียนธุรกิจ (ภพ.20 / ทะเบียนพาณิชย์)'
                  file={bizFile}
                  onPick={() => bizInput.current?.click()}
                  onClear={() => setBizFile(null)}
                />
                <input
                  ref={bizInput}
                  type='file'
                  accept='image/jpeg,image/png,image/webp,application/pdf'
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f && validateFile(f)) setBizFile(f)
                    e.target.value = ''
                  }}
                />
                <div className='flex justify-end mbs-2'>
                  <Button
                    variant='contained'
                    onClick={submitL3}
                    disabled={submittingL3 || !bizFile}
                  >
                    {submittingL3 ? 'กำลังส่ง…' : 'ส่งเอกสารตรวจสอบ'}
                  </Button>
                </div>
              </>
            )}

            {l3.state === 'PENDING' && (
              <Typography color='text.secondary' className='text-[13px]'>
                เอกสารของคุณอยู่ระหว่างตรวจสอบ ทีมงานจะแจ้งผลภายใน 1-2 วัน
              </Typography>
            )}

            {l3.state === 'APPROVED' && (
              <Typography color='text.secondary' className='text-[13px]'>
                ยืนยันตัวตนระดับ 3 สำเร็จแล้ว
              </Typography>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  )
}

function StatusChip({ state }: { state: LevelState }) {
  if (state === 'APPROVED')
    return <Chip size='small' color='success' label='ยืนยันแล้ว' variant='tonal' />
  if (state === 'PENDING')
    return <Chip size='small' color='warning' label='กำลังตรวจสอบ' variant='tonal' />
  if (state === 'REJECTED')
    return <Chip size='small' color='error' label='ถูกปฏิเสธ — ส่งใหม่ได้' variant='tonal' />
  return <Chip size='small' label='ยังไม่ยืนยัน' variant='outlined' />
}

function UploadRow({
  label,
  file,
  onPick,
  onClear,
}: {
  label: string
  file: File | null
  onPick: () => void
  onClear: () => void
}) {
  // Base: connections/index.tsx item row pattern (thumbnail + title/subtitle + action buttons)
  return (
    <div className='flex items-center justify-between gap-4 flex-wrap is-full p-3 rounded-md border border-[var(--mui-palette-divider)]'>
      <div className='flex grow items-center gap-4 min-is-0'>
        <div className='flex is-[40px] bs-[40px] items-center justify-center rounded bg-[var(--mui-palette-action-hover)]'>
          <i className='tabler-file-upload text-xl text-[var(--mui-palette-text-secondary)]' />
        </div>
        <div className='grow min-is-0'>
          <Typography className='text-textPrimary font-medium'>{label}</Typography>
          <Typography variant='body2' className='truncate'>
            {file ? file.name : 'ยังไม่ได้เลือกไฟล์'}
          </Typography>
        </div>
      </div>
      <div className='flex gap-2'>
        <Button variant='tonal' size='small' onClick={onPick}>
          เลือกไฟล์
        </Button>
        {file && (
          <Button variant='tonal' color='error' size='small' onClick={onClear}>
            ล้าง
          </Button>
        )}
      </div>
    </div>
  )
}
