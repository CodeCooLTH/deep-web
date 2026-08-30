'use client'

/**
 * ShopExtraPages — หน้าเต็มจอ 2 หน้าในตัวเดียว: **เพจทางการ** และ **เหรียญของร้าน**
 *
 * Base: `deep_store_extra_pages_concept_new.html` (ไฟล์อ้างอิงที่ user ส่ง 2026-08-21)
 * ค่าที่ยกมาตรง ๆ: container 900px · header 62px sticky · store-head โลโก้ 56 + เส้นคั่นล่าง ·
 * แถบแท็บ gap 26 ขีดใต้ 2px · `.channel` กริด 56/1fr/auto · `.badge-layout` 300px + 1fr gap 28 ·
 * `.badge-stage` radius 26 + วงกลมจาง ๆ มุมขวาล่าง · `.feature-medal` 112px มีวงในซ้อน
 *
 * ## 🛑 ที่ต่างจากไฟล์อ้างอิงโดยตั้งใจ
 *
 * **1. ไม่มีย่อหน้าคำอธิบายเหรียญ (`.badge-detail-desc`)** — ไฟล์อ้างอิงเขียนไว้ทุกใบ เช่น
 * "ร้านมีจำนวนคำสั่งซื้อสะสมถึงเกณฑ์ที่ระบบกำหนด แสดงว่ามีลูกค้าเริ่มใช้งานและเกิดยอดขาย
 * อย่างต่อเนื่อง" แต่ `Badge` ในฐานข้อมูล **ไม่มีคอลัมน์คำอธิบายเลย** (`name`/`nameEN`/`icon`/
 * `imageUrl`/`type`/`criteria`) การแต่งข้อความขึ้นมาเองคือการสร้างคำมั่นแทนระบบ — สิ่งที่ตอบ
 * คำถาม "เหรียญนี้แปลว่าอะไร" ได้จริงคือ `criteriaLabel` ซึ่งแปลจากเกณฑ์จริง และอยู่ในช่อง
 * "เงื่อนไข" แล้ว
 *
 * **2. ขนาดตัวอักษรยกพื้นขึ้น** — ไฟล์อ้างอิงใช้ 9–11px กับข้อความประกอบเกือบทั้งหน้า ซึ่งเป็น
 * ขนาดของภาพจำลอง ไม่ใช่ของจริง ภาษาไทยมีสระบน-ล่างและวรรณยุกต์ที่ 9px อ่านไม่ออกบนมือถือ
 * ⇒ ยกพื้นเป็น 11px และไล่สเกลขึ้นตามลำดับชั้นเดิมของไฟล์ (สัดส่วนคงไว้ ตัวเลขไม่คงไว้)
 *
 * **3. ป้ายหมวดเหรียญมาจาก `criteria.type` ไม่ใช่ `Badge.type`** — ดูเหตุผลใน
 * `src/lib/badge-criteria.ts::badgeCategoryLabel` · `null` = ไม่แสดงป้าย ไม่ใช่ป้ายกลาง ๆ
 *
 * **4. คงข้อความกันเพจปลอมของเดิมไว้** — ไฟล์อ้างอิงมีแค่ `.info-line` ที่บอกว่าชื่อ/รูปดึงจาก
 * แพลตฟอร์มต้นทาง ส่วนประโยค "เพจที่ไม่อยู่ในรายการนี้ = ยังไม่ได้ยืนยันกับ Deep" เป็นของเรา
 * และเป็นสิ่งที่ทำให้รายการนี้เป็น *ทะเบียนอ้างอิง* ไม่ใช่แค่ลิงก์ ⇒ ห้ามตัดทิ้งเพราะ ref ไม่มี
 *
 * 🛑 **ห้ามเขียนว่า "Deep ตรวจสอบแล้วว่าเป็นเพจของร้าน"** — เราไม่ได้ตรวจ เรารับผลจาก OAuth
 * และ **ห้ามเรียกเพจนอกรายการว่า "ปลอม"** (ร้านอาจมีเพจจริงที่ยังไม่ได้เชื่อม) — กติกาเดิมจาก
 * `OfficialChannelsBlock.tsx` ยกมาทั้งชุด
 */

import { useState } from 'react'

import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import logoDeepMark from '@/assets/images/logo-deep-mark.png'

import { CHANNEL_FOLLOWER_LABEL, CHANNEL_FULL_LABEL, channelProfileUrl } from '@/lib/official-channel-link'
import { compactCount } from '@/lib/format-compact-number'
import { formatDateTH } from '@/lib/format-date'

import { Artwork, type HeroBadge } from './BadgeShowcase'
import type { OfficialChannel } from './OfficialChannels'
import { ChannelMark } from './OfficialChannelsBlock'

export type ExtraPageTab = 'pages' | 'badges'

/**
 * Verified Ink — 🛑 ตัวหนังสือ/ไอคอนสีเขียว **บนพื้นขาว** ต้องใช้ค่านี้ ห้ามใช้ `text-success`
 * (`success.main` #28C76F) ซึ่งเป็น "สีพื้น" ไม่ใช่ "สีหมึก": บนขาวได้ **2.21:1** ตกเกณฑ์ข้อความ
 * (4.5:1) และตกแม้เกณฑ์ non-text (3:1) ด้วยซ้ำ ส่วน #18804A ได้ 4.97:1
 *
 * ค่านี้ไม่ได้คิดเอง — `.impeccable/design.json` กฎ "สองโทน: สีเป็นพื้น vs สีเป็นหมึก" ระบุ
 * ตัวเลข 2.21:1 → 4.97:1 ไว้ตรงตัว · ฝั่ง Paces มี token `--color-{semantic}-ink` ให้แล้ว
 * แต่ฝั่ง Vuexy/(marketing) ยังไม่มี (`success.dark` = #24B364 ก็ยังตก) จึงอ้างค่าจาก
 * design system ตรง ๆ พร้อมเหตุผลกำกับ
 */
const VERIFIED_INK = '#18804A'

/** `.container { width:min(900px, calc(100% - 32px)) }` ของไฟล์อ้างอิง */
const CONTAINER = 'is-[min(900px,calc(100%-32px))] mli-auto'

const TAB_TITLE: Record<ExtraPageTab, string> = {
  pages: 'เพจทางการ',
  badges: 'เหรียญของร้าน',
}

export default function ShopExtraPages({
  open,
  tab,
  onClose,
  shop,
  channels,
  badges,
  totalBadges,
}: {
  open: boolean
  /** หน้าไหน — 🛑 **ไม่มีแถบแท็บให้สลับในหน้านี้** (user เคาะ 2026-08-21: "เอา tab เปลี่ยนออก
   *  เพราะกดจากข้างนอกไง") ทางเข้ามีทางเดียวคือการ์ดบนโปรไฟล์ซึ่งรู้อยู่แล้วว่าจะเปิดหน้าไหน
   *  แท็บที่สลับไปอีกหน้าได้ทั้งที่ผู้ใช้เพิ่งเลือกมาแล้ว = ทางเลือกซ้ำที่ไม่มีใครใช้ */
  tab: ExtraPageTab
  onClose: () => void
  shop: {
    shopName: string
    username: string
    avatar?: string | null
    tierLabel: string
    avgRating?: number | null
  }
  channels: OfficialChannel[]
  badges: HeroBadge[]
  totalBadges: number
}) {
  const [picked, setPicked] = useState(0)

  /* 🛑 หนีบช่วงตอน **render** ไม่ใช่ `setState` ใน effect — ถ้ารายการสั้นลง (สลับร้านใน SPA)
     `badges[picked]` จะเป็น undefined แล้วแผงขวาว่างเปล่าโดยไม่มีอะไรฟ้อง
     ท่า effect+setState ผิดกฎ eslint ของรีโป (`react-hooks/set-state-in-effect`) และยังทำให้
     เกิดเฟรมที่วาดด้วยค่าผิดก่อนหนึ่งครั้งเสมอ ส่วนการหนีบตอน render ไม่มีเฟรมนั้นเลย
     ต้องใช้ `safeIdx` ทุกที่ที่เทียบว่า "ใบไหน active" ไม่ใช่ `picked` ดิบ ไม่งั้นรายการซ้าย
     จะไม่ไฮไลต์ใบที่แผงขวากำลังแสดงอยู่ */
  const safeIdx = picked < badges.length ? picked : 0
  const current = badges[safeIdx] ?? null

  return (
    /* 🛑 ห้ามเรียก `useLockBodyScroll` ที่นี่ — `<Dialog>` ล็อก scroll ให้เองอยู่แล้ว
       การมีสองเจ้าของคือบั๊กที่ `src/__tests__/overlay-scroll-lock-single-owner.test.ts` กันไว้ */
    <Dialog fullScreen open={open} onClose={onClose} aria-labelledby='shop-extra-page-title'>
      <div className='flex flex-col bs-full bg-[var(--mui-palette-background-paper)]'>
        {/* ── header 62px sticky + เบลอหลัง (ref) ── */}
        <div
          className='sticky inset-block-start-0 z-30 border-be'
          style={{
            background: 'color-mix(in srgb, var(--mui-palette-background-paper) 94%, transparent)',
            backdropFilter: 'blur(16px)',
            paddingBlockStart: 'env(safe-area-inset-top)',
          }}
        >
          <div className={`${CONTAINER} flex items-center gap-2.5 bs-[62px]`}>
            {/* 🛑 `size='large'` ไม่ใช่ค่าตั้งต้น — ค่าตั้งต้นได้ padding 8 ⇒ 8×2+21 = 37px
                ตกเกณฑ์ tap target 44px ของ design.json (กลุ่มผู้ใช้ตาม PRODUCT.md มีผู้สูงวัย/
                digital-literacy ต่ำ) · `large` ได้ padding 12 ⇒ 45px */}
            <IconButton onClick={onClose} aria-label='ย้อนกลับ' size='large' className='shrink-0'>
              <Icon icon='tabler:arrow-left' width={21} />
            </IconButton>
            <Typography id='shop-extra-page-title' component='h1' className='text-[16px] font-bold min-is-0 truncate'>
              {TAB_TITLE[tab]}
            </Typography>
            {/* ตราแบรนด์ชิดขวาตาม ref — โลโก้ Deep ของจริง ไม่ใช่สี่เหลี่ยมม่วงหมุน 45° ของภาพจำลอง */}
            <span className='mis-auto flex items-center gap-2 shrink-0'>
              {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ที่ import มาแล้ว */}
              <img src={logoDeepMark.src} alt='' className='bs-[18px] is-auto' />
              <span className='text-[13px] font-bold'>Deep</span>
            </span>
          </div>
        </div>

        <div className='flex-1 overflow-y-auto overscroll-contain'>
          <div className={`${CONTAINER} pbs-7 pbe-16`}>
            {/* ── `.store-head` ── */}
            {/* `pbe-[22px]` + `mbe-7` = ระยะที่แถบแท็บเคยกินไว้ (mbs-22 + mbe-7 ของ ref)
                ถอดแท็บออกแล้วต้องเว้นเอง ไม่งั้นหัวข้อ ACHIEVEMENTS ไปติดเส้นคั่น */}
            <div className='flex items-start sm:items-center gap-3.5 pbe-[22px] mbe-7 border-be'>
              <StoreLogo shop={shop} />
              <div className='min-is-0 flex-1'>
                {/* 🛑 ไม่มีบรรทัด `small` เหนือชื่อร้าน — ไฟล์อ้างอิงวางชื่อ "แบรนด์สั้น"
                    ("BT Premium") ไว้เหนือชื่อเต็ม ("BT Premium - คลอง 4 ธัญบุรี") แต่ระบบเรา
                    มี `shopName` ค่าเดียว การใส่ทั้งสองบรรทัดจึงได้ชื่อเดียวกันซ้อนกันสองครั้ง
                    (user เจอเองจากภาพหน้าจอ 2026-08-21) — เติมชื่อสั้นเองไม่ได้ เพราะการตัดคำ
                    ชื่อร้านคนอื่นคือการเปลี่ยนชื่อเขา */}
                <Typography component='h2' className='text-[18px] font-bold leading-tight' style={{ letterSpacing: '-.02em' }}>
                  {shop.shopName}
                </Typography>
                <Typography className='text-[12px] mbs-1' color='text.secondary'>
                  {`@${shop.username} · ${shop.tierLabel}`}
                </Typography>
              </div>
              {/* `.rating` — ref ซ่อนบนมือถือ (`@media max-width:760px`) ทำตาม เพราะแถวนี้แคบ
                  และคะแนนมีอยู่แล้วบนหน้าโปรไฟล์ที่ผู้ใช้เพิ่งกดออกมา */}
              {shop.avgRating != null && (
                <div className='hidden sm:block text-[12px] shrink-0' style={{ color: '#6e6d77' }}>
                  <b className='text-[16px] text-[var(--mui-palette-text-primary)] tabular-nums'>
                    {shop.avgRating.toFixed(1)}
                  </b>
                  {' / 5'}
                </div>
              )}
            </div>

            {tab === 'pages' ? (
              <PagesPanel channels={channels} shopName={shop.shopName} />
            ) : (
              <BadgesPanel
                badges={badges}
                totalBadges={totalBadges}
                picked={safeIdx}
                onPick={setPicked}
                current={current}
              />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

/** โลโก้ร้าน 56px มุมมน 16 ตาม `.store-logo` — ไม่มีรูป = อักษรตัวแรกบนแผ่นทึบ (ไม่ใช่กรอบว่าง) */
function StoreLogo({ shop }: { shop: { shopName: string; avatar?: string | null } }) {
  const [failed, setFailed] = useState(false)
  const src = shop.avatar

  return (
    <span
      className='shrink-0 is-14 bs-14 rounded-2xl overflow-hidden border flex items-center justify-center'
      style={{ background: '#111' }}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL หลากโดเมน (storage/CDN)
        <img src={src} alt='' onError={() => setFailed(true)} className='is-full bs-full object-cover' />
      ) : (
        <span className='text-[22px] font-bold text-white'>{shop.shopName.trim().charAt(0)}</span>
      )}
    </span>
  )
}

/** หัวข้อของแต่ละ panel — `.section-kicker` / `.section-title` / `.section-sub` */
/**
 * หัวข้อของแต่ละ panel — `.section-title` / `.section-sub` ของไฟล์อ้างอิง
 *
 * 🛑 **ไม่มี `.section-kicker`** ("ACHIEVEMENTS" / "Official channels") ทั้งที่ไฟล์อ้างอิงมี —
 * `.impeccable/design.json` ระบุไว้ในหัวข้อ `donts` ตรงตัวว่าเป็นลายเซ็นของเทมเพลต AI-SaaS:
 * *"eyebrow ตัวพิมพ์ใหญ่จิ๋วเหนือทุก section"* และยังชนข้อ *"Don't ใช้ ALL CAPS"* อีกชั้น
 * (เคยถอดออกมาแล้วครั้งหนึ่งที่ `ProfileForm` รอบ Impeccable 2026-07-04 — precedent เดียวกัน)
 *
 * มันไม่ได้บอกอะไรที่หัวข้อใต้มันไม่ได้บอกอยู่แล้ว ("ACHIEVEMENTS" เหนือ "เหรียญของร้าน")
 * HR8: theme ชนะเรื่อง markup แต่ **Impeccable ชนะเรื่องน้ำเสียง/ลำดับชั้น**
 */
function PanelHead({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <Typography component='h3' className='text-[22px] sm:text-[26px] font-bold leading-tight' style={{ letterSpacing: '-.035em' }}>
        {title}
      </Typography>
      <Typography className='text-[13px] leading-[1.8] mbs-2.5 max-is-[580px]' color='text.secondary'>
        {sub}
      </Typography>
    </>
  )
}

/** `.info-line` / `.badge-footnote` — ไอคอน i ในวงกลมเทา + ข้อความกำกับ */
function NoteLine({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex items-start gap-2.5 mbs-[18px] text-[11px] leading-[1.7]' style={{ color: '#8a8993' }}>
      <span
        aria-hidden
        className='shrink-0 is-5 bs-5 rounded-full flex items-center justify-center text-[12px] font-bold'
        style={{ background: '#f3f3f5', color: '#6e6d77' }}
      >
        i
      </span>
      <div>{children}</div>
    </div>
  )
}

// ─────────────────────────────── หน้าเพจทางการ ───────────────────────────────

function PagesPanel({ channels, shopName }: { channels: OfficialChannel[]; shopName: string }) {
  return (
    <section>
      <PanelHead
        title='เพจทางการ'
        sub='ช่องทางที่ร้านเชื่อมกับ Deep โดยตรง เพื่อให้ลูกค้าตรวจสอบและติดต่อผ่านแพลตฟอร์มต้นทางได้ง่ายขึ้น'
      />

      <div className='mbs-[26px]'>
        {channels.map((c, i) => {
          const href = channelProfileUrl(c)

          return (
            <article
              key={`${c.provider}-${c.externalId}`}
              /* `.channel` — 3 คอลัมน์บนจอกว้าง · ≤760px ปุ่มตกลงไปแถวสองใต้ข้อความ (ref)
                 `minmax(0,1fr)` ไม่ใช่ `1fr`: ชื่อเพจยาว ๆ จะดันคอลัมน์ล้นจอ (บทเรียน prod 2026-08-12) */
              className={`grid items-center gap-3.5 plb-[18px] border-bs [grid-template-columns:52px_minmax(0,1fr)_auto] max-[760px]:[grid-template-columns:52px_minmax(0,1fr)] ${
                i === channels.length - 1 ? 'border-be' : ''
              }`}
            >
              <ChannelMark c={c} size={52} />
              <div className='min-is-0'>
                <div className='text-[15px] font-bold leading-snug truncate max-is-full'>{c.name}</div>
                <Typography component='div' className='text-[12px] mbs-1' color='text.secondary'>
                  {CHANNEL_FULL_LABEL[c.provider] ?? c.provider}
                  {typeof c.followerCount === 'number' && (
                    <>
                      {' · '}
                      <span className='font-medium tabular-nums text-[var(--mui-palette-text-primary)]'>
                        {compactCount(c.followerCount)}
                      </span>
                      {` ${CHANNEL_FOLLOWER_LABEL[c.provider] ?? 'ผู้ติดตาม'}`}
                    </>
                  )}
                </Typography>
                {/* `.connected` — 🛑 คำต้องเป็น "เชื่อมกับ Deep แล้ว" เท่านั้น ห้ามเป็น
                    "Deep ตรวจสอบแล้ว" เพราะเราไม่ได้ตรวจ เรารับผลจาก OAuth ของแพลตฟอร์ม */}
                <div className='mbs-2 text-[11px] font-bold flex items-center gap-1' style={{ color: VERIFIED_INK }}>
                  <Icon icon='tabler:circle-check-filled' width={13} aria-hidden />
                  เชื่อมกับ Deep แล้ว
                </div>
              </div>
              {href && (
                <a
                  href={href}
                  target='_blank'
                  rel='noopener noreferrer'
                  /* ≤760px ปุ่มย้ายไปคอลัมน์ 2 ชิดซ้าย ตาม ref (`grid-column:2;justify-self:start`) */
                  /* `min-bs-[44px]` — ลิงก์นี้เป็น action หลักของแถว ที่ plb-2 ได้แค่ 36px
                     ตกเกณฑ์ tap target 44px · ใช้ min-height แทนการเพิ่ม padding เพราะ padding
                     จะดันความสูงของทั้งแถวการ์ดขึ้นด้วย ส่วน min-height กินเฉพาะตอนเตี้ยกว่าเกณฑ์ */
                  className='text-[13px] font-bold text-primary no-underline flex items-center gap-1 plb-2 min-bs-[44px] max-[760px]:[grid-column:2] max-[760px]:justify-self-start max-[760px]:pli-0 pli-2'
                  aria-label={`เปิด ${c.name} ใน ${CHANNEL_FULL_LABEL[c.provider] ?? c.provider}`}
                >
                  {`เปิดใน ${CHANNEL_FULL_LABEL[c.provider] ?? c.provider}`}
                  <Icon icon='lucide:external-link' width={13} aria-hidden />
                </a>
              )}
            </article>
          )
        })}
      </div>

      <NoteLine>ชื่อและรูปเพจดึงจากแพลตฟอร์มต้นทางโดยตรง จึงอาจต่างจากชื่อร้านบน Deep ได้</NoteLine>

      {/* 🛑 ของเรา ไม่ใช่ของ ref — ประโยคนี้คือสิ่งที่ทำให้รายการนี้เป็นทะเบียนอ้างอิง ห้ามตัดทิ้ง
          และห้ามเปลี่ยนเป็นคำว่า "เพจปลอม" (ร้านอาจมีเพจจริงที่ยังไม่ได้เชื่อม) */}
      <div
        className='mbs-5 rounded-lg pli-4 plb-3 flex items-start gap-2'
        style={{ background: 'var(--mui-palette-background-default)' }}
      >
        <Icon
          icon='tabler:alert-triangle'
          width={17}
          className='shrink-0 text-[var(--mui-palette-text-secondary)]'
          style={{ marginBlockStart: 2 }}
          aria-hidden
        />
        <Typography className='text-[13px] leading-relaxed' color='text.primary'>
          {`หากพบเพจอื่นที่อ้างว่าเป็น "${shopName}" แต่ไม่อยู่ในรายการนี้ แปลว่ายังไม่ได้ยืนยันกับ Deep`}
        </Typography>
      </div>
    </section>
  )
}

// ─────────────────────────────── หน้าเหรียญ ───────────────────────────────

function BadgesPanel({
  badges,
  totalBadges,
  picked,
  onPick,
  current,
}: {
  badges: HeroBadge[]
  totalBadges: number
  picked: number
  onPick: (i: number) => void
  current: HeroBadge | null
}) {
  return (
    <section>
      <PanelHead
        title='เหรียญของร้าน'
        sub='เลือกเหรียญเพื่อดูว่าแต่ละเหรียญได้รับจากเงื่อนไขไหน และได้รับเมื่อใด'
      />

      {/* `.badge-layout` — 300px + 1fr · ≤760px ยุบเป็นคอลัมน์เดียวแล้วรายการกลายเป็นแถบเลื่อนข้าง */}
      <div className='grid gap-7 mbs-7 [grid-template-columns:300px_minmax(0,1fr)] max-[760px]:[grid-template-columns:minmax(0,1fr)] max-[760px]:gap-[18px]'>
        <aside className='border-ie pie-[22px] max-[760px]:border-ie-0 max-[760px]:pie-0'>
          <div className='flex items-end justify-between mbe-4'>
            <b className='text-[14px] tabular-nums'>{`${totalBadges} เหรียญ`}</b>
            <span className='text-[11px]' style={{ color: '#85858f' }}>
              ได้รับแล้วทั้งหมด
            </span>
          </div>

          {/* ≤760px: แถวเลื่อนข้าง (ref) — `overflow-y-hidden` คู่เสมอ เพราะ `overflow-x:auto`
              เดี่ยว ๆ ทำให้แกน y กลายเป็น auto ตามสเปก แล้วเกิดแถบเลื่อนตั้งซ้อน */}
          <div
            role='tablist'
            aria-orientation='vertical'
            aria-label='รายการเหรียญ'
            className='grid gap-[5px] max-[760px]:flex max-[760px]:overflow-x-auto max-[760px]:overflow-y-hidden max-[760px]:gap-2 max-[760px]:pbe-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          >
            {badges.map((b, i) => {
              const active = i === picked

              return (
                <button
                  key={b.id}
                  type='button'
                  role='tab'
                  id={`badge-tab-${b.id}`}
                  aria-controls='badge-stage'
                  aria-selected={active}
                  onClick={() => onPick(i)}
                  className={`is-full border-0 rounded p-2.5 grid items-center gap-2.5 text-start cursor-pointer font-[inherit] transition-colors [grid-template-columns:34px_minmax(0,1fr)_auto] max-[760px]:min-is-[168px] max-[760px]:[grid-template-columns:32px_minmax(0,1fr)] ${
                    active ? 'bg-[var(--mui-palette-primary-lightOpacity)]' : 'bg-transparent hover:bg-[var(--mui-palette-action-hover)]'
                  }`}
                >
                  <span
                    className='is-8 bs-8 rounded-lg flex items-center justify-center shrink-0'
                    style={
                      active
                        ? { background: 'var(--mui-palette-background-paper)', boxShadow: '0 3px 10px rgba(36,31,80,.07)' }
                        : { background: '#f3f3f5' }
                    }
                  >
                    <Artwork b={b} size={20} />
                  </span>
                  <span className='min-is-0'>
                    <b className='block text-[13px] leading-tight truncate max-is-full'>{b.name}</b>
                    {/* หมวด — ไม่มีหมวด (เกณฑ์ชนิดใหม่) ก็ไม่แสดงบรรทัด ไม่ใช่เดาคำกลาง ๆ */}
                    {b.categoryLabel && (
                      <span className='block text-[11px] mbs-0.5' style={{ color: '#85858f' }}>
                        {b.categoryLabel}
                      </span>
                    )}
                  </span>
                  <Icon
                    icon='tabler:check'
                    width={13}
                    aria-hidden
                    className='max-[760px]:hidden'
                    style={{ color: VERIFIED_INK }}
                  />
                </button>
              )
            })}
          </div>
        </aside>

        <section className='min-is-0 flex flex-col justify-between'>
          {current && (
            <div
              id='badge-stage'
              role='tabpanel'
              aria-labelledby={`badge-tab-${current.id}`}
              /* `.badge-stage` — radius 26 + ไล่สีจาง ๆ + วงกลมเส้นบางมุมขวาล่าง
                 🛑 `role="tab"` ที่ไม่มี `aria-controls` ชี้ไปยัง `role="tabpanel"` = ประกาศว่า
                 เป็นแท็บโดยไม่มีอะไรให้คุม screen reader จะอ่านว่า "แท็บ 1 จาก 6" แล้วผู้ใช้
                 กดแล้วไม่รู้ว่าอะไรเปลี่ยน (คลาสเดียวกับ `aria-name-requires-supporting-role.md`
                 — markup ถูกทุกตัวอักษร แต่ความหมายไม่ครบ และไม่มี gate ไหนจับได้) */
              className='relative overflow-hidden rounded-2xl border p-7 max-[760px]:p-[22px] min-bs-[300px] max-[760px]:min-bs-[320px]'
              style={{
                background:
                  'radial-gradient(circle at 70% 18%, rgba(115,103,240,.065), transparent 24%), linear-gradient(180deg, var(--mui-palette-background-paper), var(--mui-palette-background-default))',
              }}
            >
              <span
                aria-hidden
                className='absolute rounded-full border pointer-events-none'
                style={{ insetInlineEnd: -80, insetBlockEnd: -100, inlineSize: 260, blockSize: 260 }}
              />

              <div className='relative z-[2] flex items-center justify-between gap-3'>
                <div className='text-[11px] font-bold uppercase' style={{ color: '#85858f', letterSpacing: '.08em' }}>
                  {current.categoryLabel ?? ''}
                </div>
                <div className='text-[11px] font-bold flex items-center gap-1' style={{ color: VERIFIED_INK }}>
                  ได้รับแล้ว
                  <Icon icon='tabler:check' width={13} aria-hidden />
                </div>
              </div>

              {/* `.feature-medal` — วงนอก 112 + วงในซ้อนอีกชั้น (ref ใช้ `:before` inset 12) */}
              <div
                /* 🛑 `mli-auto` จัดกึ่งกลาง (user เคาะ 2026-08-21) — กล่องนี้มีขนาดตายตัว (is-28)
                   จึงจัดกลางด้วย margin auto ได้ตรง ๆ ไม่ต้องพึ่ง `text-align` ของพ่อ
                   ซึ่งไม่มีผลกับ block ที่มีความกว้างของตัวเอง */
                className='relative z-[2] is-28 bs-28 max-[760px]:is-24 max-[760px]:bs-24 rounded-full flex items-center justify-center mli-auto mbs-9 mbe-6 max-[760px]:mbs-7 max-[760px]:mbe-5 border'
                style={{
                  background: 'var(--mui-palette-background-paper)',
                  boxShadow: '0 18px 40px rgba(31,28,55,.08), inset 0 0 0 10px var(--mui-palette-background-default)',
                }}
              >
                <span aria-hidden className='absolute inset-3 rounded-full border pointer-events-none' />
                <Artwork b={current} size={52} />
              </div>

              <Typography
                component='h4'
                /* จัดกลางให้ตรงแกนเดียวกับเหรียญด้านบน — แถวข้อมูลใต้เส้นคั่นยังชิดซ้ายตามเดิม
                   เพราะมันเป็น "ตาราง 2 ช่อง" ที่หัวข้อกับค่าต้องเรียงตรงกัน ไม่ใช่หัวเรื่อง */
                className='relative z-[2] text-[21px] sm:text-[24px] font-bold leading-tight text-center'
                style={{ letterSpacing: '-.035em' }}
              >
                {current.name}
              </Typography>

              {/* `.badge-detail-meta` — 🛑 ไม่มีย่อหน้าคำอธิบายเหนือแถวนี้ ดูเหตุผลหัวไฟล์ */}
              <div className='relative z-[2] grid gap-4 mbs-[18px] pbs-[15px] border-bs [grid-template-columns:1fr_1fr] max-[760px]:[grid-template-columns:1fr]'>
                {current.criteriaLabel && (
                  <div>
                    <Typography component='small' className='block text-[11px] mbe-1' color='text.secondary'>
                      เงื่อนไข
                    </Typography>
                    <b className='text-[13px] leading-snug'>{current.criteriaLabel}</b>
                  </div>
                )}
                {current.earnedAtIso && (
                  <div>
                    <Typography component='small' className='block text-[11px] mbe-1' color='text.secondary'>
                      วันที่ได้รับ
                    </Typography>
                    <b className='text-[13px] leading-snug'>{formatDateTH(current.earnedAtIso)}</b>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 🛑 ประโยคนี้คือสิ่งที่ทำให้เหรียญเป็นหลักฐาน ไม่ใช่ของประดับ — DESIGN.md ห้าม
              "badge ตกแต่งที่ตีความไม่ได้" ไว้ตรงตัว ห้ามตัดทิ้ง */}
          <NoteLine>ระบบมอบเหรียญให้อัตโนมัติจากข้อมูลจริงของร้าน ร้านซื้อหรือเลือกเหรียญเองไม่ได้</NoteLine>

          {/* จำนวนที่แสดงอาจน้อยกว่าทั้งหมด — ต้องบอก ไม่ใช่เงียบ ผู้ใช้ที่นับแล้วไม่ตรงกับหัวข้อ
              จะเลิกเชื่อตัวเลขทั้งหน้า */}
          {badges.length < totalBadges && (
            <Typography variant='caption' color='text.disabled' className='block mbs-2'>
              {`แสดง ${badges.length} จาก ${totalBadges} เหรียญ`}
            </Typography>
          )}
        </section>
      </div>
    </section>
  )
}
