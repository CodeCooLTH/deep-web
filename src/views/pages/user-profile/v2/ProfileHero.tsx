'use client'

/**
 * ProfileHero — หัวหน้าร้านสาธารณะโฉมใหม่ (mockup อนุมัติ 2026-07-26 ทิศทาง C "กลางหน้า สมมาตร")
 * docs/superpowers/specs/2026-07-26-public-profile-final.html
 *
 * ทำไมจัดกลางแทนชื่อซ้าย-รูปขวา: แบบเดิมเหมือน reference ที่ user ส่งมามากเกินไป และแผ่นเนื้อหา
 * มุมโค้งที่ถูกดึงขึ้นทับแถบสีทำให้เกิดรอยบากสองข้างที่อ่านเป็นความบังเอิญ แบบนี้ให้รูปวงกลม
 * คร่อมรอยต่อแทนมุมโค้ง จึงไม่มีรอยบากและเปลี่ยนแกนการอ่านเป็นบน-ล่าง
 *
 * ลำดับหลักฐานตั้งใจเรียงตามน้ำหนัก: ตัวตนร้าน → ระดับความน่าเชื่อถือ → เหรียญ → ตัวเลขธุรกรรม
 * → อัตราความสำเร็จ (ตัวเลขเดียวที่ให้พื้นที่ใหญ่ที่สุด) → ปุ่มคุย
 *
 * เหรียญ/ช่องทาง/รีวิว ที่ไม่มีข้อมูลจะไม่ render เลย — แต่ตัวเลขสามช่อง (ออเดอร์/ลูกค้า/ซื้อซ้ำ)
 * แสดงเสมอโดยใส่ 0 ตามที่ user กำหนด 2026-07-26 เพราะเป็นโครงหลักของหน้า ถ้าซ่อนบางช่อง
 * layout จะขยับไปมาระหว่างร้าน และผู้ซื้อแยกไม่ออกว่าช่องที่หายคือไม่มีหรือแค่ไม่แสดง
 *
 * Base: theme/vuexy/typescript-version/full-version/src/@core/components/mui/Avatar.tsx (fallback initials)
 *   + src/app/(marketing)/auth/sign-in/OrderLinkShell.tsx (ภาษาภาพเดียวกัน: รูปเต็มกว้าง + ไล่เงา + สถิติ)
 */
import { useState } from 'react'

import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { badgeIconName } from '@/lib/badge-icons'

export type HeroBadge = { id: string; name: string; nameEN: string; icon: string }

export type ProfileHeroData = {
  shopName: string
  username: string
  avatar: string | null
  coverImage: string | null
  tierGradient: string
  trustScore: number
  tierLabel: string
  maxVerifyLevel: number
  category: string | null
  memberSince: string
  badges: HeroBadge[]
  totalBadgeCount: number
  completedOrders: number | null
  customerCount: number | null
  repeatCustomerCount: number | null
  completionRate: number | null
  canChat: boolean
  /** ร้านที่พักใช้คำคนละชุดกับร้านขายของ — ที่พักไม่มี "ออเดอร์" มีแต่ "การเข้าพัก" */
  isLodging?: boolean
}

/** คำเรียกตัวเลขตามประเภทกิจการ — เปลี่ยนแค่คำ ไม่เปลี่ยนวิธีนับ */
const STAT_LABELS = {
  general: {
    orders: 'ออเดอร์',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าใช้บริการซ้ำ',
    rateCaption: 'อัตราความสำเร็จจากออเดอร์ทั้งหมดบน Deep',
  },
  lodging: {
    orders: 'การเข้าพัก',
    customers: 'จำนวนลูกค้า',
    repeat: 'ลูกค้าใช้บริการซ้ำ',
    rateCaption: 'อัตราความสำเร็จจากการเข้าพักทั้งหมดบน Deep',
  },
} as const

/** จำนวนเหรียญที่โชว์เป็นไอคอน ที่เหลือยุบเป็นตัวนับ — กันแถวยาวจนดันเนื้อหาสำคัญตกจอ */
const MAX_BADGE_ICONS = 5

function ProfileImg({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  // eslint-disable-next-line @next/next/no-img-element -- URL หลากโดเมน (storage/CDN/OAuth) ตาม pattern
  // ShopAvatar เดิมใน ChooseShopClient.tsx ที่ fallback initials เมื่อโหลดรูปไม่ได้
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
}

export default function ProfileHero({ data }: { data: ProfileHeroData }) {
  const L = data.isLodging ? STAT_LABELS.lodging : STAT_LABELS.general

  // แสดงครบสามค่าเสมอ ไม่มีข้อมูลให้เป็น 0 (user กำหนด 2026-07-26) — ต่างจากบล็อกอื่นในหน้านี้
  // ที่ซ่อนเมื่อไม่มีข้อมูล เพราะสามค่านี้เป็นโครงหลักของหน้า การซ่อนบางช่องทำให้ layout ขยับ
  // ไปมาระหว่างร้าน และผู้ซื้อเทียบสองร้านกันไม่ได้ว่าช่องที่หายไปคือไม่มีหรือแค่ไม่แสดง
  const stats = [
    { value: data.completedOrders ?? 0, label: L.orders },
    { value: data.customerCount ?? 0, label: L.customers },
    { value: data.repeatCustomerCount ?? 0, label: L.repeat },
  ]

  const shownBadges = data.badges.slice(0, MAX_BADGE_ICONS)
  const restBadgeCount = data.totalBadgeCount - shownBadges.length

  return (
    <div className='is-full'>
      {/* ── ปก: รูปจริงถ้าร้านอัปโหลด ไม่งั้นใช้ไล่สีตามระดับความน่าเชื่อถือ ── */}
      <div className='relative bs-[104px] overflow-hidden' style={{ background: data.tierGradient }}>
        <ProfileImg src={data.coverImage} alt='' className='absolute inset-0 is-full bs-full object-cover' />
      </div>

      {/* ── ตัวตนร้าน: รูปวงกลมคร่อมรอยต่อระหว่างปกกับเนื้อหา แทนการใช้มุมโค้งทับ ── */}
      <div className='text-center pli-5 pbe-3 -mbs-[42px] relative'>
        <div className='is-[84px] bs-[84px] rounded-full border-4 mli-auto mbe-2.5 overflow-hidden bg-primary flex items-center justify-center text-white text-3xl font-extrabold border-[var(--mui-palette-background-paper)]'>
          <ProfileImg src={data.avatar} alt={data.shopName} className='is-full bs-full object-cover' />
          {!data.avatar && data.shopName.trim().charAt(0)}
        </div>

        <Typography component='h1' className='text-xl font-extrabold' sx={{ letterSpacing: '-0.02em' }}>
          {data.shopName}
        </Typography>

        <div className='flex items-center justify-center gap-1.5 flex-wrap mbs-1.5'>
          {data.maxVerifyLevel > 0 && (
            <span
              className='is-[18px] bs-[18px] rounded-full bg-success text-white flex items-center justify-center'
              title='ยืนยันตัวตนแล้ว'
            >
              <Icon icon='lucide:check' width={11} />
            </span>
          )}
          {/* คะแนนความน่าเชื่อถือ — ตำแหน่งข้างชื่อตามที่ user กำหนด สีของตัวเลขมาจากระดับจริง
              ไม่ได้ตายตัวเป็นเหลือง (ยึด SSOT docs/10 - Business Rules/Tier Lists.md) */}
          <span className='inline-flex items-center gap-1 rounded-full plb-1 pli-2.5 text-[12.5px] font-extrabold bg-[var(--mui-palette-text-primary)] text-[var(--mui-palette-background-paper)]'>
            {data.trustScore}
          </span>
          <span className='rounded-lg plb-1 pli-2.5 text-xs font-semibold bg-[var(--mui-palette-action-hover)] text-[var(--mui-palette-text-secondary)]'>
            {data.tierLabel}
          </span>
        </div>

        <Typography variant='caption' color='text.disabled' className='block mbs-1'>
          {[`@${data.username}`, data.category, `เปิดร้านตั้งแต่ ${data.memberSince}`]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </div>

      {/* ── เหรียญ: ไอคอนล้วนเพื่อให้อ่านรวดเดียวจบ รายละเอียดอยู่ในหน้าเหรียญเต็ม ── */}
      {shownBadges.length > 0 && (
        <div className='flex justify-center gap-2.5 flex-wrap pli-5 pbe-3.5'>
          {shownBadges.map((b) => (
            <span
              key={b.id}
              title={b.name}
              className='is-[38px] bs-[38px] rounded-full flex items-center justify-center bg-warning/10 text-warning border border-warning/25'
            >
              <Icon icon={badgeIconName(b.nameEN, b.icon)} width={18} />
            </span>
          ))}
          {restBadgeCount > 0 && (
            <span className='is-[38px] bs-[38px] rounded-full flex items-center justify-center bg-[var(--mui-palette-action-hover)] text-[var(--mui-palette-text-disabled)] text-xs font-bold'>
              {`+${restBadgeCount}`}
            </span>
          )}
        </div>
      )}

      {/* ── ตัวเลขธุรกรรม: แสดงครบสามช่องเสมอ ── */}
      {/* ใช้ flex กระจายกลาง ไม่ใช่ grid 3 คอลัมน์ตายตัว — ร้านที่มีสถิติไม่ครบสามตัว (เช่นออเดอร์
          เก่าที่ยังไม่ผูก Customer) จะเหลือช่องเดียวแล้วเบี้ยวไปชิดซ้าย ดูเหมือนหน้าพัง (เจอตอน QA จริง) */}
      <div className='flex justify-around gap-2 pli-5 plb-3.5 border-bs'>
          {stats.map((s) => (
            <div key={s.label} className='text-center min-is-[84px]'>
              <div className='text-[22px] font-extrabold tabular-nums leading-tight' style={{ letterSpacing: '-0.025em' }}>
                {s.value}
              </div>
              <Typography variant='caption' color='text.disabled'>
                {s.label}
              </Typography>
            </div>
          ))}
      </div>

      {/* ── อัตราความสำเร็จ: ตัวเลขที่ได้พื้นที่ใหญ่สุดในหน้า เพราะเป็นสิ่งที่คนกำลังจะโอนเงินอยากรู้
             ที่สุด และเป็นสีเขียวตามหลัก verified-means-green ที่ใช้ทั้งระบบ ── */}
      {data.completionRate != null && (
        <div className='flex items-baseline gap-2.5 pli-5 plb-3.5 border-bs'>
          <span className='text-[32px] font-extrabold text-success tabular-nums leading-none' style={{ letterSpacing: '-0.03em' }}>
            {`${data.completionRate}%`}
          </span>
          <Typography variant='body2' color='text.secondary'>
            {L.rateCaption}
          </Typography>
        </div>
      )}

      {data.canChat && (
        <div className='pli-5 pbs-4 pbe-4'>
          <Button
            fullWidth
            variant='contained'
            size='large'
            startIcon={<Icon icon='lucide:message-circle' width={19} />}
            sx={{ minBlockSize: 50, borderRadius: '13px' }}
          >
            แชทกับร้าน
          </Button>
        </div>
      )}
    </div>
  )
}
