// เช็กมิจฉาชีพ (mobile) — redesign แนว home (ตัด padding landing ของ CheckResult).
// reuse ScamSearchBar (logic เดียวกับ /check guest) + render ผลลัพธ์แบบการ์ด mobile.
// proxy rewrite: authed mobile /check → /m/check (query ?type=&q= คงไว้); guest → /check ปกติ
import type { Metadata } from 'next'
import Link from 'next/link'

import ScamSearchBar from '@views/front-pages/scam-check/ScamSearchBar'
import { searchScamByIdentifier } from '@/services/scam-report.service'
import { IDENTIFIER_TYPES, IDENTIFIER_LABELS, SCAM_TYPE_LABELS } from '@/lib/scam-constants'
import type { IdentifierType } from '@/lib/scam-constants'
import type { ScamSearchResult } from '@/services/scam-report.service'
import { maskIdentifier } from '@/lib/scam-identifier'
import { formatDate } from '@/lib/format-date'
import { MPageTitle } from '../_components/ui'

export const metadata: Metadata = { title: 'เช็กมิจฉาชีพ' }

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className='rounded-2xl border border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-default)] text-center p-5'>
    <p className='text-[16px] font-extrabold m-0 text-[var(--mui-palette-text-primary)]'>{value}</p>
    <p className='text-[11px] m-0 mbs-0.5 text-[var(--mui-palette-text-disabled)]'>{label}</p>
  </div>
)

export default async function MobileCheckPage({
  searchParams
}: {
  searchParams: Promise<{ type?: string; q?: string }>
}) {
  const sp = await searchParams
  const type = (IDENTIFIER_TYPES as string[]).includes(sp.type ?? '') ? (sp.type as IdentifierType) : null
  const q = (sp.q ?? '').trim()

  let result: ScamSearchResult | null = null
  if (type && q.length >= 2) result = await searchScamByIdentifier(type, q)

  const found = result?.found ?? false
  const displayValue = type && q ? maskIdentifier(type, q) : ''

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <MPageTitle title='เช็กมิจฉาชีพ' />
        <p className='text-[13px] m-0 mbs-0.5 text-[var(--mui-palette-text-secondary)]'>
          ค้นเบอร์ / ชื่อ / เลขบัตร / เลขบัญชี ก่อนโอนทุกครั้ง
        </p>
      </div>

      <ScamSearchBar defaultType={type ?? 'PHONE'} defaultQ={q} />

      {!type ? (
        <div className='flex items-start gap-2.5 rounded-2xl border border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)] p-5'>
          <i className='tabler-search text-[20px] text-[var(--mui-palette-text-secondary)] shrink-0 mbs-0.5' />
          <p className='text-[13px] m-0 text-[var(--mui-palette-text-secondary)]'>
            กรอกข้อมูลด้านบนแล้วกดตรวจสอบ เพื่อค้นว่ามีการรายงานหรือไม่
          </p>
        </div>
      ) : (
        <div className='flex flex-col gap-3'>
          {/* ป้ายผล + ค่าที่ค้น (mask) */}
          <div className='flex items-center justify-between gap-2'>
            <span className='text-[14px] font-semibold text-[var(--mui-palette-text-primary)]'>ผลการค้นหา</span>
            <span className='inline-flex items-center gap-1.5 rounded-full border border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-default)] plb-1 pli-2.5'>
              <span className='text-[12px] text-[var(--mui-palette-text-secondary)]'>{IDENTIFIER_LABELS[type]}</span>
              <span className='size-1 rounded-full bg-[var(--mui-palette-text-disabled)]' />
              <span className='text-[12px] font-semibold text-[var(--mui-palette-text-primary)]'>{displayValue}</span>
            </span>
          </div>

          {!found ? (
            /* ── ไม่พบ ── */
            <div className='rounded-2xl border border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)] text-center flex flex-col items-center p-5'>
              <span
                className='size-[72px] rounded-full flex items-center justify-center mbe-3'
                style={{ background: 'var(--mui-palette-success-lightOpacity)' }}
              >
                <i className='tabler-shield-check text-[38px] text-[var(--mui-palette-success-main)]' />
              </span>
              <p className='text-[18px] font-extrabold m-0 text-[var(--mui-palette-text-primary)]'>ไม่พบการรายงาน</p>
              <p className='text-[13px] m-0 mbs-1 text-[var(--mui-palette-text-secondary)]'>
                ยังไม่มีรายงานที่ตรวจสอบแล้วสำหรับข้อมูลนี้
              </p>
              <div
                className='mbs-4 inline-flex items-center gap-2 rounded-2xl p-5'
                style={{ background: 'var(--mui-palette-warning-lightOpacity)' }}
              >
                <i className='tabler-alert-triangle text-[16px] text-[var(--mui-palette-warning-main)]' />
                <span className='text-[12px] font-medium text-[var(--mui-palette-warning-main)]'>
                  ไม่ได้แปลว่าปลอดภัย 100% — ระวังเสมอ
                </span>
              </div>
            </div>
          ) : (
            /* ── พบการรายงาน ── */
            <div className='rounded-2xl border border-[var(--mui-palette-divider)] bg-[var(--mui-palette-background-paper)] p-5'>
              <div className='flex flex-col items-center text-center'>
                <span
                  className='size-[72px] rounded-full flex items-center justify-center mbe-3'
                  style={{ background: 'var(--mui-palette-warning-lightOpacity)' }}
                >
                  <i className='tabler-alert-triangle text-[38px] text-[var(--mui-palette-warning-main)]' />
                </span>
                <p className='text-[13px] m-0 text-[var(--mui-palette-text-secondary)]'>พบข้อมูลการรายงาน</p>
                <p className='text-[32px] font-extrabold leading-none m-0 mbs-1 text-[var(--mui-palette-warning-main)]'>
                  {result!.count} ครั้ง
                </p>
              </div>

              <div className='mbs-5 grid grid-cols-2 gap-2.5'>
                <Stat label='มูลค่าเสียหายรวม' value={`฿${result!.totalLoss.toLocaleString('th-TH')}`} />
                <Stat label='รายงานล่าสุด' value={result!.lastReportedAt ? formatDate(result!.lastReportedAt) : '-'} />
              </div>

              <div className='mbs-4'>
                <p className='text-[12px] m-0 mbe-1.5 text-[var(--mui-palette-text-disabled)]'>ประเภทที่ถูกรายงาน</p>
                <div className='flex flex-wrap gap-1.5'>
                  {Object.entries(result!.byType).map(([t, n]) => (
                    <span
                      key={t}
                      className='text-[11px] font-medium leading-none pli-2 plb-1 rounded-full'
                      style={{ background: 'var(--mui-palette-warning-lightOpacity)', color: 'var(--mui-palette-warning-main)' }}
                    >
                      {SCAM_TYPE_LABELS[t] ?? t} · {n}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className='mbs-4 flex items-start gap-2 rounded-2xl p-5'
                style={{ background: 'var(--mui-palette-info-lightOpacity)' }}
              >
                <i className='tabler-info-circle text-[16px] text-[var(--mui-palette-info-main)] shrink-0 mbs-0.5' />
                <p className='text-[12px] m-0 text-[var(--mui-palette-text-secondary)]'>
                  ตัวเลขนี้คือ <b>จำนวนการรายงาน</b> จากผู้ใช้ที่ผ่านการตรวจสอบหลักฐาน ไม่ใช่คำตัดสินทางกฎหมาย โปรดใช้วิจารณญาณ
                </p>
              </div>
            </div>
          )}

          <Link
            href='/report'
            className='h-11 rounded flex items-center justify-center gap-1.5 no-underline text-[14px] font-medium text-white bg-[var(--mui-palette-primary-main)] active:opacity-80 transition-opacity'
          >
            <i className='tabler-flag text-[18px]' />
            แจ้งรายงานมิจฉาชีพ
          </Link>
        </div>
      )}
    </div>
  )
}
