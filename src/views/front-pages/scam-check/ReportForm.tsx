'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// MUI Imports
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Alert from '@mui/material/Alert'

// Third-party Imports
import { toast } from 'react-toastify'
import { uploadFileId } from '@/lib/upload-client'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Constants
import {
  IDENTIFIER_TYPES,
  IDENTIFIER_LABELS,
  IDENTIFIER_PLACEHOLDERS,
  SCAM_TYPE_OPTIONS
} from '@/lib/scam-constants'
import type { IdentifierType } from '@/lib/scam-constants'

// Styles
import frontCommonStyles from '@views/front-pages/styles.module.css'

type IdRow = { type: IdentifierType; value: string; bankName: string }

const ReportForm = () => {
  // Hooks
  const router = useRouter()

  // States
  const [rows, setRows] = useState<IdRow[]>([{ type: 'PHONE', value: '', bankName: '' }])
  const [scamType, setScamType] = useState(SCAM_TYPE_OPTIONS[0].value)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const updateRow = (i: number, patch: Partial<IdRow>) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const addRow = () => rows.length < 4 && setRows(prev => [...prev, { type: 'PHONE', value: '', bankName: '' }])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    if (rows.some(r => r.value.trim().length < 2)) return toast.error('กรุณากรอกตัวระบุให้ครบ')
    if (description.trim().length < 10) return toast.error('กรุณาอธิบายเหตุการณ์อย่างน้อย 10 ตัวอักษร')
    if (files.length < 1) return toast.error('ต้องแนบหลักฐานอย่างน้อย 1 ไฟล์')
    if (!consent) return toast.error('กรุณายอมรับเงื่อนไขก่อนส่งรายงาน')

    setSubmitting(true)

    try {
      // อัปโหลดหลักฐานทีละไฟล์ → เก็บ fileId
      const evidence: string[] = []

      for (const file of files) {
        // direct upload (2026-08-10) — ไม่ผ่าน body ของ function ที่ Vercel จำกัด 4.5MB
        // (รูปหลักฐานจากมือถือเกิน 4.5MB เป็นเรื่องปกติ — ดู upload-policy.ts)
        evidence.push(await uploadFileId(file, 'IMAGE'))
      }

      const res = await fetch('/api/scam-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifiers: rows.map(r => ({
            type: r.type,
            value: r.value.trim(),
            ...(r.type === 'BANK_ACCOUNT' && r.bankName.trim() ? { bankName: r.bankName.trim() } : {})
          })),
          scamType,
          amountLost: Number(amount) || 0,
          description: description.trim(),
          evidence
        })
      })

      if (res.status === 201) {
        toast.success('ส่งรายงานแล้ว ทีมงานจะตรวจสอบก่อนแสดงผล ขอบคุณที่ช่วยกัน')
        router.push('/')

        return
      }

      const data = await res.json().catch(() => ({}))

      if (res.status === 409) toast.error(data.error ?? 'คุณเคยรายงานตัวระบุนี้แล้ว')
      else if (res.status === 401) toast.error('กรุณาเข้าสู่ระบบก่อน')
      else toast.error(data.error ?? 'ส่งรายงานไม่สำเร็จ')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className='pbs-[100px] md:pbs-[120px] pbe-12 md:pbe-[100px] bg-backgroundPaper'>
      <div className={frontCommonStyles.layoutSpacing}>
        <div className='mli-auto max-is-[680px] flex flex-col gap-6'>
          <div className='flex flex-col gap-1'>
            <Typography variant='h4' className='font-extrabold'>
              แจ้งรายงานมิจฉาชีพ
            </Typography>
            <Typography color='text.secondary'>
              ช่วยเตือนภัยคนอื่น — รายงานจะถูกตรวจสอบหลักฐานโดยทีมงานก่อนนำไปแสดงผล
            </Typography>
          </div>

          <Alert severity='warning'>
            โปรดรายงานตามความจริงและมีหลักฐานประกอบ — การให้ข้อมูลเท็จอาจมีความผิดตามกฎหมาย (หมิ่นประมาท / พ.ร.บ.คอมพิวเตอร์)
          </Alert>

          <Card className='border'>
            <CardContent className='flex flex-col gap-6'>
              {/* ตัวระบุ */}
              <div className='flex flex-col gap-4'>
                <Typography className='font-medium' color='text.primary'>
                  ข้อมูลผู้ต้องสงสัย (อย่างน้อย 1 อย่าง)
                </Typography>
                {rows.map((row, i) => (
                  <div key={i} className='flex flex-col sm:flex-row gap-3 items-start'>
                    <CustomTextField
                      select
                      label='ประเภท'
                      value={row.type}
                      onChange={e => updateRow(i, { type: e.target.value as IdentifierType })}
                      className='is-full sm:max-is-[180px]'
                    >
                      {IDENTIFIER_TYPES.map(t => (
                        <MenuItem key={t} value={t}>
                          {IDENTIFIER_LABELS[t]}
                        </MenuItem>
                      ))}
                    </CustomTextField>
                    <div className='flex gap-2 is-full'>
                      <CustomTextField
                        fullWidth
                        label='ข้อมูล'
                        placeholder={IDENTIFIER_PLACEHOLDERS[row.type]}
                        value={row.value}
                        onChange={e => updateRow(i, { value: e.target.value })}
                      />
                      {rows.length > 1 && (
                        <IconButton color='error' onClick={() => removeRow(i)} className='mbs-5'>
                          <i className='tabler-trash' />
                        </IconButton>
                      )}
                    </div>
                    {row.type === 'BANK_ACCOUNT' && (
                      <CustomTextField
                        label='ธนาคาร'
                        placeholder='เช่น กสิกรไทย'
                        value={row.bankName}
                        onChange={e => updateRow(i, { bankName: e.target.value })}
                        className='is-full sm:max-is-[180px]'
                      />
                    )}
                  </div>
                ))}
                {rows.length < 4 && (
                  <Button variant='tonal' size='small' className='self-start' onClick={addRow}>
                    <i className='tabler-plus text-base mie-1' /> เพิ่มข้อมูล
                  </Button>
                )}
              </div>

              {/* ประเภท + มูลค่า */}
              <div className='flex flex-col sm:flex-row gap-4'>
                <CustomTextField
                  select
                  fullWidth
                  label='ประเภทการหลอกลวง'
                  value={scamType}
                  onChange={e => setScamType(e.target.value)}
                >
                  {SCAM_TYPE_OPTIONS.map(o => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))}
                </CustomTextField>
                <CustomTextField
                  fullWidth
                  type='number'
                  label='มูลค่าความเสียหาย (บาท)'
                  placeholder='0'
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>

              {/* รายละเอียด */}
              <CustomTextField
                fullWidth
                multiline
                rows={4}
                label='รายละเอียดเหตุการณ์'
                placeholder='เล่าเหตุการณ์ที่เกิดขึ้น...'
                value={description}
                onChange={e => setDescription(e.target.value)}
              />

              {/* หลักฐาน */}
              <div className='flex flex-col gap-2'>
                <Typography className='font-medium' color='text.primary'>
                  หลักฐาน (บังคับ — สลิป / แชต / ภาพหน้าจอ)
                </Typography>
                <Button variant='tonal' component='label' className='self-start'>
                  <i className='tabler-upload text-base mie-1' /> เลือกไฟล์
                  <input
                    type='file'
                    hidden
                    multiple
                    accept='image/*,application/pdf'
                    onChange={e => setFiles(Array.from(e.target.files ?? []))}
                  />
                </Button>
                {files.length > 0 && (
                  <Typography variant='body2' color='text.secondary'>
                    เลือกแล้ว {files.length} ไฟล์: {files.map(f => f.name).join(', ')}
                  </Typography>
                )}
              </div>

              <FormControlLabel
                control={<Checkbox checked={consent} onChange={e => setConsent(e.target.checked)} />}
                label='ข้าพเจ้ายืนยันว่าข้อมูลเป็นความจริง และยินยอมรับผิดชอบหากเป็นข้อมูลเท็จ'
              />

              <Button variant='contained' size='large' onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'กำลังส่ง...' : 'ส่งรายงาน'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

export default ReportForm
