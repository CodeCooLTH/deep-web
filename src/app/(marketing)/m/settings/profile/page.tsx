import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getMaxVerificationLevel } from '@/services/verification.service'
import { getTierDisplay } from '@/services/trust-score.service'
import { getTierGradient, getNextTierInfo, getTierColor } from '@/lib/trust-tier'
import type { TierChipColor } from '@/lib/trust-tier'

import SignOutButton from '@/app/(marketing)/(buyer-app)/dashboard/SignOutButton'
import AvatarEditable from './AvatarEditable'

export const metadata: Metadata = { title: 'บัญชีของฉัน' }

// avatar → URL. avatar ถูกเก็บเป็น path เต็ม (/api/files/<id>) จาก AvatarEditable/AccountSidebar หรือ http (FB)
// → ปล่อยผ่านถ้าเป็น http/ขึ้นต้น '/'; prefix เฉพาะกรณี key ดิบ (กัน bug prefix ซ้ำ = /api/files//api/files/xxx)
const resolveImg = (u: string | null) => (!u ? undefined : u.startsWith('http') || u.startsWith('/') ? u : `/api/files/${u}`)

type SemColor = 'warning' | 'info' | 'success' | 'error'
const semBg = (c: SemColor) => `var(--mui-palette-${c}-lightOpacity)`
const semFg = (c: SemColor) => `var(--mui-palette-${c}-main)`

const tierBg = (c: TierChipColor) =>
  c === 'default' ? 'var(--mui-palette-action-selected)' : `var(--mui-palette-${c}-lightOpacity)`
const tierFg = (c: TierChipColor) =>
  c === 'default' ? 'var(--mui-palette-text-secondary)' : `var(--mui-palette-${c}-main)`

// stat column สไตล์ IG (ตัวเลขใหญ่ + label); accent = ตัวเลขม่วงแบรนด์ (ใช้กับ Trust — core identity)
const Stat = ({ value, label, accent }: { value: number; label: string; accent?: boolean }) => (
  <div className='flex-1 flex flex-col items-center'>
    <span
      className={`text-[17px] font-extrabold leading-tight ${accent ? 'text-[var(--mui-palette-primary-main)]' : 'text-[var(--mui-palette-text-primary)]'}`}
    >
      {value}
    </span>
    <span className='text-[11px] text-[var(--mui-palette-text-secondary)]'>{label}</span>
  </div>
)

const ORDER_STRIP: Array<{ key: string; label: string; icon: string; color: SemColor }> = [
  { key: 'PENDING', label: 'รอดำเนินการ', icon: 'tabler-clock', color: 'warning' },
  { key: 'SHIPPED', label: 'จัดส่งแล้ว', icon: 'tabler-truck-delivery', color: 'info' },
  { key: 'CONFIRMED', label: 'สำเร็จ', icon: 'tabler-circle-check', color: 'success' },
  { key: 'CANCELLED', label: 'ยกเลิก', icon: 'tabler-x', color: 'error' },
]

// ระดับยืนยันตัวตน → label สั้น
const VERIFY_LABEL = ['ยังไม่ยืนยัน', 'ยืนยันเบอร์', 'ยืนยันเอกสาร', 'ยืนยันธุรกิจ']

type Row = { href: string; icon: string; label: string; count?: number; external?: boolean }

const MenuRow = ({ href, icon, label, count, external }: Row) => (
  <Link
    href={href}
    className='flex items-center gap-3 pli-4 plb-3.5 no-underline border-b border-[var(--mui-palette-divider)] last:border-b-0 active:bg-[var(--mui-palette-action-hover)] transition-colors'
  >
    <i className={`${icon} text-[21px] text-[var(--mui-palette-text-secondary)] shrink-0`} />
    <span className='flex-1 text-[14px] text-[var(--mui-palette-text-primary)]'>{label}</span>
    {typeof count === 'number' && count > 0 && (
      <span className='text-[13px] text-[var(--mui-palette-text-secondary)]'>{count}</span>
    )}
    <i
      className={`${external ? 'tabler-external-link' : 'tabler-chevron-right'} text-[18px] text-[var(--mui-palette-text-disabled)] shrink-0`}
    />
  </Link>
)

const MenuSection = ({ title, rows }: { title: string; rows: Row[] }) => (
  <div className='flex flex-col gap-2'>
    <h2 className='text-[13px] font-semibold m-0 pli-1 text-[var(--mui-palette-text-secondary)]'>{title}</h2>
    <div className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] overflow-hidden'>
      {rows.map(r => (
        <MenuRow key={r.href + r.label} {...r} />
      ))}
    </div>
  </div>
)

/** หน้าบัญชี mobile (/m) — hub แนว home: tier hero (gradient) → ออเดอร์ → stats → เมนู → ออกจากระบบ */
export default async function MobileAccountPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/auth/sign-in?callbackUrl=/settings/profile')
  const userId = (session.user as { id: string }).id

  const [user, orderGroups, reviewCount, badgeCount, verifyLevel] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true, avatar: true, trustScore: true }
    }),
    // นับสถานะออเดอร์ด้วย groupBy (query เดียว ไม่ join items/shop/review) — เบากว่าดึงทั้งหมดมานับ
    prisma.order.groupBy({ by: ['status'], where: { buyerUserId: userId }, _count: true }),
    prisma.review.count({ where: { reviewerUserId: userId } }),
    prisma.userBadge.count({ where: { userId } }),
    getMaxVerificationLevel(userId)
  ])
  if (!user) redirect('/auth/sign-in')

  const counts: Record<string, number> = { PENDING: 0, SHIPPED: 0, CONFIRMED: 0, CANCELLED: 0 }
  for (const g of orderGroups) if (g.status in counts) counts[g.status] = g._count

  const { tier } = getTierDisplay(user.trustScore)
  const gradient = getTierGradient(user.trustScore)
  const tierColor = getTierColor(user.trustScore)
  const next = getNextTierInfo(user.trustScore)
  const progress = Math.min(100, Math.round((user.trustScore / 90) * 100)) // 90 = ถึง Deep Star

  return (
    <div className='flex flex-col gap-5'>
      {/* ── โปรไฟล์ (สไตล์ IG) ── */}
      <div className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] p-4 flex flex-col gap-3.5'>
        <div className='flex items-center gap-4'>
          {/* avatar + วงแหวน tier (story-ring) — แตะเปลี่ยนรูปได้ */}
          <div className='rounded-full p-[3px] shrink-0' style={{ background: gradient }}>
            <div className='rounded-full p-[2px] bg-[var(--mui-palette-background-paper)]'>
              <AvatarEditable src={resolveImg(user.avatar)} fallback={user.displayName.slice(0, 1)} size={70} />
            </div>
          </div>
          {/* stats */}
          <div className='flex-1 flex items-center'>
            <Stat value={user.trustScore} label='Trust' accent />
            <Link href='/reviews' className='flex-1 no-underline'>
              <Stat value={reviewCount} label='รีวิว' />
            </Link>
            <Link href='/badges' className='flex-1 no-underline'>
              <Stat value={badgeCount} label='Badge' />
            </Link>
          </div>
        </div>

        {/* ชื่อ + tier + username */}
        <div className='flex flex-col gap-0.5'>
          <div className='flex items-center gap-1.5 min-w-0'>
            <p className='text-[16px] font-bold m-0 truncate text-[var(--mui-palette-text-primary)]'>{user.displayName}</p>
            {verifyLevel > 0 && (
              <i className='tabler-rosette-discount-check-filled text-[17px] text-[var(--mui-palette-primary-main)] shrink-0' />
            )}
            <span
              className='text-[10px] font-semibold pli-2 plb-0.5 rounded-full shrink-0'
              style={{ background: tierBg(tierColor), color: tierFg(tierColor) }}
            >
              {tier}
            </span>
          </div>
          <p className='text-[13px] m-0 text-[var(--mui-palette-text-secondary)] truncate'>@{user.username}</p>
        </div>

        {/* progress ความน่าเชื่อถือ (แถบบางแนว IG bio) */}
        <div>
          <div className='flex items-center justify-between mbe-1'>
            <span className='text-[11px] text-[var(--mui-palette-text-secondary)]'>ความน่าเชื่อถือ · {user.trustScore}/100</span>
            <span className='text-[11px] text-[var(--mui-palette-text-secondary)]'>
              {next ? `อีก ${next.pointsToNext} → ${next.nextTierLabel}` : 'ระดับสูงสุด'}
            </span>
          </div>
          <div className='h-1.5 rounded-full bg-[var(--mui-palette-action-hover)] overflow-hidden'>
            <div className='h-full rounded-full' style={{ width: `${progress}%`, background: gradient }} />
          </div>
        </div>

        {/* ปุ่ม แก้ไข / โปรไฟล์สาธารณะ */}
        <div className='flex gap-2'>
          <Link
            href='/m/settings/profile/edit'
            className='flex-1 flex items-center justify-center gap-1 h-9 rounded-lg no-underline text-[13px] font-medium bg-[var(--mui-palette-action-hover)] border border-[var(--mui-palette-divider)] text-[var(--mui-palette-text-primary)] active:opacity-80 transition-opacity'
          >
            <i className='tabler-edit text-[16px]' />
            แก้ไขโปรไฟล์
          </Link>
          <Link
            href={`/u/${user.username}`}
            className='flex-1 flex items-center justify-center gap-1 h-9 rounded-lg no-underline text-[13px] font-medium bg-[var(--mui-palette-action-hover)] border border-[var(--mui-palette-divider)] text-[var(--mui-palette-text-primary)] active:opacity-80 transition-opacity'
          >
            <i className='tabler-user-star text-[16px]' />
            โปรไฟล์สาธารณะ
          </Link>
        </div>
      </div>

      {/* ── คำสั่งซื้อของฉัน ── */}
      <div className='rounded-2xl bg-[var(--mui-palette-background-paper)] border border-[var(--mui-palette-divider)] p-4'>
        <div className='flex items-center justify-between mbe-3'>
          <h2 className='text-[15px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>คำสั่งซื้อของฉัน</h2>
          <Link href='/orders' className='text-[13px] font-medium text-[var(--mui-palette-primary-main)] no-underline flex items-center gap-0.5'>
            ดูทั้งหมด
            <i className='tabler-chevron-right text-[15px]' />
          </Link>
        </div>
        <div className='flex items-stretch'>
          {ORDER_STRIP.map(s => (
            <Link key={s.key} href={`/orders?status=${s.key}`} className='flex flex-1 flex-col items-center gap-1.5 no-underline'>
              <span className='relative size-11 rounded-2xl flex items-center justify-center' style={{ background: semBg(s.color) }}>
                <i className={`${s.icon} text-[23px]`} style={{ color: semFg(s.color) }} />
                {counts[s.key] > 0 && (
                  <span className='absolute -top-1 -right-1 min-is-[18px] h-[18px] pli-1 rounded-full bg-[var(--mui-palette-error-main)] text-white text-[10px] font-bold leading-[18px] text-center'>
                    {counts[s.key]}
                  </span>
                )}
              </span>
              <span className='text-[11px] text-[var(--mui-palette-text-secondary)]'>{s.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── nudge ยืนยันตัวตน (โชว์เมื่อยังไม่ครบ L3) ── */}
      {verifyLevel < 3 && (
        <Link href='/settings/verification' className='no-underline block'>
          <div className='flex items-center gap-3 rounded-2xl bg-[var(--mui-palette-success-lightOpacity)] border border-[var(--mui-palette-success-main)]/30 p-3'>
            <span className='size-9 rounded-xl bg-[var(--mui-palette-success-main)] flex items-center justify-center shrink-0'>
              <i className='tabler-shield-check text-[20px] text-white' />
            </span>
            <div className='flex-1 min-w-0'>
              <p className='text-[14px] font-semibold m-0 text-[var(--mui-palette-text-primary)]'>
                {verifyLevel === 0 ? 'ยืนยันตัวตน เพิ่มความน่าเชื่อถือ' : `เลื่อนขั้นถัดไป — ${VERIFY_LABEL[verifyLevel + 1] ?? ''}`}
              </p>
              <p className='text-[12px] m-0 text-[var(--mui-palette-text-secondary)] truncate'>
                ปัจจุบัน: {VERIFY_LABEL[verifyLevel]} · ยิ่งยืนยัน Trust ยิ่งสูง
              </p>
            </div>
            <i className='tabler-chevron-right text-[20px] text-[var(--mui-palette-success-main)] shrink-0' />
          </div>
        </Link>
      )}

      {/* ── เกี่ยวกับฉัน ── */}
      <MenuSection
        title='เกี่ยวกับฉัน'
        rows={[
          { href: '/m/settings/profile/edit', icon: 'tabler-user', label: 'ข้อมูลส่วนตัว' },
          { href: '/settings/verification', icon: 'tabler-shield-check', label: 'ยืนยันตัวตน', count: verifyLevel },
          { href: '/reviews', icon: 'tabler-star', label: 'รีวิวที่ให้', count: reviewCount },
          { href: '/badges', icon: 'tabler-award', label: 'ความสำเร็จ', count: badgeCount },
          { href: `/u/${user.username}`, icon: 'tabler-user-star', label: 'โปรไฟล์สาธารณะ', external: true }
        ]}
      />

      {/* ── นโยบายและเงื่อนไข ── */}
      <MenuSection
        title='นโยบายและเงื่อนไข'
        rows={[
          { href: '/terms', icon: 'tabler-file-text', label: 'ข้อกำหนดการใช้บริการ' },
          { href: '/privacy', icon: 'tabler-lock', label: 'นโยบายความเป็นส่วนตัว' }
        ]}
      />

      <div className='flex justify-center plb-1'>
        <SignOutButton />
      </div>
    </div>
  )
}
