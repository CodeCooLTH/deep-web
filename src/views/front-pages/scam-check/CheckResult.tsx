// MUI Imports
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'

// Component Imports
import { LinkButton } from '@/app/(marketing)/_components/mui-link'
import ScamSearchBar from '@views/front-pages/scam-check/ScamSearchBar'

// Constants / utils
import { IDENTIFIER_LABELS, SCAM_TYPE_LABELS } from '@/lib/scam-constants'
import type { IdentifierType } from '@/lib/scam-constants'
import type { ScamSearchResult } from '@/services/scam-report.service'
import { maskIdentifier } from '@/lib/scam-identifier'
import { formatDate } from '@/lib/format-date'

// Styles
import frontCommonStyles from '@views/front-pages/styles.module.css'

type Props = {
  type: IdentifierType | null
  q: string
  result: ScamSearchResult | null
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className='rounded-2xl border bg-backgroundDefault text-center p-5'>
    <Typography variant='h5' className='font-extrabold' color='text.primary'>
      {value}
    </Typography>
    <Typography variant='body2' color='text.disabled' className='mbs-1'>
      {label}
    </Typography>
  </div>
)

const CheckResult = ({ type, q, result }: Props) => {
  const found = result?.found ?? false
  const displayValue = type && q ? maskIdentifier(type, q) : ''

  return (
    <section className='pbs-[110px] md:pbs-[140px] pbe-16 md:pbe-[120px] bg-backgroundPaper min-bs-[78vh]'>
      <div className={frontCommonStyles.layoutSpacing}>
        <div className='mli-auto max-is-[720px] flex flex-col'>
          {/* หัวข้อหน้า */}
          <div className='text-center mbe-8'>
            <Typography variant='h4' className='font-extrabold'>
              ตรวจสอบความเสี่ยงมิจฉาชีพ
            </Typography>
            <Typography color='text.secondary' className='mbs-1'>
              ค้นด้วยเบอร์ ชื่อ เลขบัตรประชาชน หรือเลขบัญชี ก่อนโอนทุกครั้ง
            </Typography>
          </div>

          {/* ช่องค้นหา (pre-fill ค่าล่าสุด) */}
          <ScamSearchBar defaultType={type ?? 'PHONE'} defaultQ={q} />

          {/* ผลลัพธ์ */}
          {!type ? (
            <Alert severity='warning' className='mbs-10'>
              ไม่พบเงื่อนไขการค้นหา — กรุณากรอกข้อมูลด้านบนแล้วกดตรวจสอบ
            </Alert>
          ) : (
            <div className='mbs-10'>
              {/* ป้ายผลการค้นหา + สิ่งที่ค้น (mask) */}
              <div className='flex items-center justify-between gap-2 flex-wrap mbe-4'>
                <Typography className='font-medium' color='text.primary'>
                  ผลการค้นหา
                </Typography>
                <div className='inline-flex items-center gap-2 rounded-full border bg-backgroundDefault plb-[6px] pli-3'>
                  <Typography variant='body2' color='text.secondary'>
                    {IDENTIFIER_LABELS[type]}
                  </Typography>
                  <span className='bs-1 is-1 rounded-full bg-textDisabled' />
                  <Typography variant='body2' className='font-medium' color='text.primary'>
                    {displayValue}
                  </Typography>
                </div>
              </div>

              {!found ? (
                /* ── ไม่พบ ── */
                <div className='rounded-2xl border bg-backgroundPaper md: shadow-sm text-center p-5'>
                  <div
                    className='mli-auto mbe-5 flex bs-[88px] is-[88px] items-center justify-center rounded-full'
                    style={{ backgroundColor: 'var(--mui-palette-success-lightOpacity)' }}
                  >
                    <i className='tabler-shield-check text-[46px] text-success' />
                  </div>
                  <Typography variant='h4' className='font-extrabold'>
                    ไม่พบการรายงาน
                  </Typography>
                  <Typography color='text.secondary' className='mbs-2 mli-auto max-is-[420px]'>
                    ยังไม่มีรายงานที่ตรวจสอบแล้วสำหรับข้อมูลนี้
                  </Typography>
                  <div
                    className='mbs-6 mli-auto inline-flex items-center gap-2 rounded-2xl p-5'
                    style={{ backgroundColor: 'var(--mui-palette-warning-lightOpacity)' }}
                  >
                    <i className='tabler-alert-triangle text-warning' />
                    <Typography variant='body2' color='warning.main' className='font-medium'>
                      ไม่ได้แปลว่าปลอดภัย 100% — โปรดระมัดระวังเสมอ
                    </Typography>
                  </div>
                </div>
              ) : (
                /* ── พบการรายงาน ── */
                <div className='rounded-2xl border bg-backgroundPaper md: shadow-md p-5'>
                  <div className='flex flex-col items-center text-center'>
                    <div
                      className='mbe-4 flex bs-[88px] is-[88px] items-center justify-center rounded-full'
                      style={{ backgroundColor: 'var(--mui-palette-warning-lightOpacity)' }}
                    >
                      <i className='tabler-alert-triangle text-[46px] text-warning' />
                    </div>
                    <Typography color='text.secondary'>พบข้อมูลการรายงาน</Typography>
                    <Typography variant='h2' color='warning.main' className='font-extrabold leading-none mbs-1'>
                      {result!.count} ครั้ง
                    </Typography>
                  </div>

                  <div className='mbs-8 grid grid-cols-2 gap-4'>
                    <Stat label='มูลค่าเสียหายรวม' value={`฿${result!.totalLoss.toLocaleString('th-TH')}`} />
                    <Stat
                      label='รายงานล่าสุด'
                      value={result!.lastReportedAt ? formatDate(result!.lastReportedAt) : '-'}
                    />
                  </div>

                  <div className='mbs-6'>
                    <Typography variant='body2' color='text.disabled' className='mbe-2'>
                      ประเภทที่ถูกรายงาน
                    </Typography>
                    <div className='flex flex-wrap gap-2'>
                      {Object.entries(result!.byType).map(([t, n]) => (
                        <Chip key={t} variant='tonal' color='warning' label={`${SCAM_TYPE_LABELS[t] ?? t} · ${n}`} />
                      ))}
                    </div>
                  </div>

                  <div
                    className='mbs-6 flex items-start gap-2 rounded-2xl p-5'
                    style={{ backgroundColor: 'var(--mui-palette-info-lightOpacity)' }}
                  >
                    <i className='tabler-info-circle text-info text-lg shrink-0 mbs-[2px]' />
                    <Typography variant='body2' color='text.secondary'>
                      ตัวเลขนี้คือ <b>จำนวนการรายงาน</b> จากผู้ใช้ที่ผ่านการตรวจสอบหลักฐานโดยทีมงาน ไม่ใช่คำตัดสินทางกฎหมาย โปรดใช้วิจารณญาณ
                    </Typography>
                  </div>
                </div>
              )}

              <div className='flex justify-center mbs-6'>
                <LinkButton href='/report' variant='contained'>
                  แจ้งรายงานมิจฉาชีพ
                </LinkButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default CheckResult
