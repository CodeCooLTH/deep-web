'use client'

/**
 * ClipLightbox — เนื้อในของ lightbox สำหรับคลิปปักหมุด (เปลือกคือ `ProfileLightbox`)
 *
 * 🛑 **ที่นี่โหลด iframe ทันทีที่เปิด ไม่มีปุ่มเล่นของเราคั่น** — กลับมติเดิม (2026-08-23)
 *
 * เดิมมี gate เหมือนในกริด ด้วยเหตุผลว่าสคริปต์ของแพลตฟอร์มหนักหลายเมกะไบต์ และแพลตฟอร์ม
 * จะเห็นว่าใครเปิดดู — **เหตุผลนั้นยังจริง แต่จริงเฉพาะในกริด** ซึ่งมีคลิป 12 ใบพร้อมกัน
 * (12 iframe ตั้งแต่เปิดหน้า) ส่วนที่นี่มีใบเดียว และผู้ชมกดไทล์เข้ามาเอง = แสดงเจตนาไปแล้ว
 *
 * ประตูบานนี้จึงเก็บค่าเป็น "คลิกเพิ่มอีกหนึ่ง" โดยไม่ได้ป้องกันอะไร — user ทักว่าต้องกดเล่น
 * 2 รอบ และ `autoplay=true` **แก้ไม่ได้** เพราะตัวเล่นของ Facebook ยังโชว์ปุ่มของตัวเองอยู่ดี
 * (ส่งภาพยืนยันมา) ⇒ ชั้นเดียวที่เราคุมได้คือชั้นของเราเอง จึงถอดออก
 *
 * 🛑 **ของที่กัน "โหลด iframe ทั้ง 12 ใบ" จริง ๆ คือกริด ไม่ใช่ประตูบานนี้** — ไทล์ในกริดเป็น
 * รูปนิ่งล้วน กดแล้วเปิด lightbox ไม่เคยฝัง iframe สักใบ ⇒ ถอดประตูนี้แล้วหน้าโปรไฟล์ยังโหลด
 * iframe = **0 ใบ** เหมือนเดิมทุกประการ · จะเกิด iframe ตัวแรกก็ต่อเมื่อผู้ชมกดไทล์เข้ามาแล้ว
 *
 * สถิติในแผงเป็น **snapshot ณ เวลาที่ร้านกดเลือก ไม่ใช่ค่าสด** และอ่านอย่างเดียว —
 * ปุ่มถูกใจของคลิปไม่ทำ (user เคาะ 2026-08-11) เพราะไลก์บนแพลตฟอร์มต้นทางเราสั่งไม่ได้
 * ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้นจริงบนแพลตฟอร์มคือปุ่มหลอก
 *
 * Base: src/views/pages/user-profile/v2/ShopVideos.tsx (VideoCell — สถิติ + รูปปก · gate ไม่ได้ยกมา)
 */
import { useEffect, useRef, useState } from 'react'

import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import { Icon } from '@iconify/react'

import { buildEmbedUrl, type VideoProvider } from '@/lib/shop-video'

import ProfileLightbox from './ProfileLightbox'
import { PROVIDER_UI, compactCount, type ShopVideoItem } from './ShopVideos'

/* 🛑 ผู้เรียกต้องส่ง `key={item.id}` — เปลี่ยนคลิปแล้วต้อง **remount** ไม่ใช่แค่เปลี่ยน props
   เพราะสัดส่วนกรอบมาจากรูปปกของคลิปใบนั้น (`posterRatio`) ถ้าไม่ remount ใบใหม่จะใช้สัดส่วน
   ของใบเก่าไปจนกว่ารูปจะโหลดเสร็จ = กรอบกระโดดทุกครั้งที่กดลูกศร
   ทำด้วย remount ไม่ใช่ setState ใน effect (ดูเหตุผลเดียวกันที่ `ProductMedia`) */
function ClipMedia({ item }: { item: ShopVideoItem }) {
  const [imgFailed, setImgFailed] = useState(false)

  /**
   * 🛑 ต้องวัดกล่องจริงแล้วส่งตัวเลขเข้า URL — **ปลั๊กอินวิดีโอของ Facebook เรนเดอร์ตามค่า
   * `width` ใน URL ไม่ใช่ตามขนาด iframe** ไม่ส่ง = มันใช้ค่าตั้งต้นของตัวเอง แล้วภาพไม่พอดีกรอบ
   * (user ทัก 2026-08-23 "พอเปิดวิดีโอรันมันยังซูมอยู่" — คนละอาการกับภาพนิ่งที่แก้ไปแล้ว
   *  ด้วย `object-contain` เพราะตัวนี้เกิดหลังกดเล่น)
   *
   * เป็นบทเรียนซ้ำจาก feature 00029 (แท็บความคิดเห็น 2026-08-03) — ท่าที่ใช้เหมือนกันทั้งชุด
   *
   * 🛑 `ResizeObserver` ไม่ใช่วัดครั้งเดียวตอน mount — กล่องนี้เปลี่ยนขนาดได้จากการหมุนจอ
   * และจากการที่แผงขวายุบ/กางที่ 900px · วัดครั้งเดียวแล้วค้าง = ซูมกลับมาใหม่ตอนหมุนจอ
   */
  const stageRef = useRef<HTMLDivElement>(null)
  const [playerWidth, setPlayerWidth] = useState(0)

  /**
   * สัดส่วนจริงของคลิป อ่านจาก **ขนาดธรรมชาติของรูปปก** — ข้อมูลคลิปไม่มี width/height มาให้
   * รูปปกจึงเป็นแหล่งเดียวที่บอกได้ว่าคลิปนี้แนวตั้งหรือแนวนอน
   * `null` = ยังไม่รู้ → ใช้ 16/9 ไปก่อน (คลิปจากเพจส่วนใหญ่เป็นแนวนอน)
   */
  const [posterRatio, setPosterRatio] = useState<number | null>(null)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setPlayerWidth(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const provider = item.provider as VideoProvider
  const ui = PROVIDER_UI[provider]

  return (
    <Box
      ref={stageRef}
      sx={{
        position: 'relative',
        /**
         * 🛑 **สัดส่วนต้องมาจากรูปปกจริง ไม่ใช่ค่าที่เดาไว้**
         *
         * เดิมตั้ง `aspectRatio:'9/16'` ตายตัวโดยเดาว่าคลิปทุกใบเป็นคลิปสั้นแนวตั้ง ซึ่งไม่จริง —
         * คลิปจากเพจ Facebook ส่วนใหญ่เป็นแนวนอน · และค่านั้น **ไม่เคยมีผลจริงสักครั้ง** ด้วย
         * เพราะ `inlineSize:100%` กำหนดความกว้างก่อน แล้ว 9/16 จะขอความสูง = กว้าง×1.78
         * ซึ่งชนเพดาน `maxBlockSize` ทันที ⇒ กล่องจริงกลายเป็นแนวนอน ตรงข้ามกับที่คอมเมนต์เขียนไว้
         * (คลาสเดียวกับที่ `ProfileLightbox` เจอเอง: CSS ถูกตามชนิด แต่ไม่มีใครเป็นคนบอกความสูง)
         *
         * ตอนนี้อ่านสัดส่วนจาก `naturalWidth/naturalHeight` ของรูปปก (ดู `onLoad` ด้านล่าง) —
         * ข้อมูลคลิปไม่มี width/height มาให้ รูปปกจึงเป็นแหล่งเดียวที่บอกได้ว่าแนวตั้งหรือแนวนอน
         *
         * 🛑 ที่ md ให้ **ความสูง** เป็นตัวคุมแล้วความกว้างคำนวณตาม (`blockSize:100%` +
         * `inlineSize:auto`) ไม่ใช่กลับกัน — ไม่งั้นคลิปแนวตั้ง (ratio ~0.56) จะสูงเป็น 1.8 เท่า
         * ของความกว้างแล้วทะลุกรอบออกไป · เป็นบทเรียนเดียวกับที่แท็บความคิดเห็นเจอ 2026-08-04
         * ("พอจะกดเล่น video มันเต็มจอเฉย")
         *
         * ที่ xs กล่องแม่ไม่ได้ตั้งความสูงไว้ (ไม่มี `flex:1`) ⇒ ให้ความกว้างเป็นตัวคุมแทน
         */
        aspectRatio: String(posterRatio ?? 16 / 9),
        inlineSize: { xs: '100%', md: 'auto' },
        blockSize: { md: '100%' },
        maxInlineSize: '100%',
        maxBlockSize: '100%',
        bgcolor: 'common.black',
        marginInline: 'auto',
      }}
    >
      {/* รูปปก — อยู่ **ใต้** iframe เสมอ ทำ 2 หน้าที่:
          (1) มีอะไรให้ดูระหว่าง iframe ของแพลตฟอร์มยังโหลดไม่เสร็จ
          (2) เป็นแหล่งเดียวที่บอกสัดส่วนจริงของคลิป (`naturalWidth/Height`) เพราะข้อมูลคลิป
              ไม่มี width/height มาให้ ⇒ ถ้าถอดออก กรอบจะกลับไปเดาสัดส่วนเหมือนเดิม */}
      {item.thumbnailUrl && !imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element -- รูปปกจาก storage ของเรา (mirror) หรือ CDN ของแพลตฟอร์ม
        <img
          src={item.thumbnailUrl}
          alt=''
          onError={() => setImgFailed(true)}
          onLoad={(e) => {
            const el = e.currentTarget
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              setPosterRatio(el.naturalWidth / el.naturalHeight)
            }
          }}
          /* 🛑 `contain` ไม่ใช่ `cover` — นี่คือภาพนิ่งของคลิป ไม่ใช่ภาพประกอบ
             `cover` ครอปขอบทิ้งเพื่อเติมกรอบ ⇒ คลิปแนวนอนในกรอบที่สูงกว่าถูกซูมจนเห็นแค่กลางภาพ */
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}

      {/* 🛑 **ไม่มีปุ่มเล่นของเราคั่นแล้ว** (user ทัก 2026-08-23 "ต้องกดเล่น 2 รอบ")

          เดิมมี "ประตู" ของเราเอง: ต้องกดรูปปกก่อน iframe ถึงจะถูกสร้าง — เหตุผลคือกันไม่ให้
          โหลด iframe ของบุคคลที่สามก่อนผู้ชมสนใจ **ซึ่งยังถูกอยู่ แต่ถูกเฉพาะในกริด**
          (กริดมีคลิป 12 ใบ = 12 iframe ถ้าโหลดหมดตั้งแต่เปิดหน้า)

          ใน lightbox มีคลิปใบเดียว และผู้ชม **กดไทล์เข้ามาเองแล้ว** = แสดงเจตนาไปแล้วหนึ่งครั้ง
          ประตูบานนี้จึงเก็บค่าใช้จ่ายเป็น "คลิกเพิ่มอีกหนึ่ง" โดยไม่ได้ป้องกันอะไรเลย

          🛑 และ `autoplay=true` **แก้ปัญหานี้ไม่ได้** — เบราว์เซอร์กับตัวเล่นของ Facebook
          ยังโชว์ปุ่มเล่นของตัวเองอยู่ดี (user ส่งภาพยืนยัน) ⇒ ถ้าเก็บประตูของเราไว้ ยังไงก็ 2 ชั้น
          ทางเดียวที่คุมได้เองคือถอดชั้นที่เป็นของเราออก */}
      {playerWidth > 0 && (
        <iframe
          /* 🛑 `playerWidth > 0` เป็นเงื่อนไขจริง ไม่ใช่กันเหนียว — เรนเดอร์ก่อนวัดเสร็จ
             = ส่ง `width=0` เข้า URL ของ Facebook แล้วมันจะตกไปใช้ค่าตั้งต้น ซึ่งคืออาการซูม */
          src={buildEmbedUrl({ provider, videoId: item.videoId }, { widthPx: playerWidth, autoplay: true })}
          title={item.caption ?? `คลิปจาก ${ui.label}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow='accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture'
          allowFullScreen
          // sandbox แน่นที่สุดเท่าที่ยังเล่นได้ — ไม่ให้ iframe พาหน้าเราไปที่อื่นเอง
          sandbox='allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox'
          referrerPolicy='strict-origin-when-cross-origin'
        />
      )}
    </Box>
  )
}

export default function ClipLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  shopId,
  isOwnShop,
}: {
  items: ShopVideoItem[]
  index: number
  onIndexChange: (next: number) => void
  onClose: () => void
  shopId: string | null
  isOwnShop?: boolean
}) {
  const router = useRouter()
  const { status: sessionStatus } = useSession()

  const item = items[index]
  if (!item) return null

  const ui = PROVIDER_UI[item.provider as VideoProvider]

  const canChat = Boolean(shopId) && !isOwnShop
  const handleChat = () => {
    if (!shopId) return
    const target = `/messages/${shopId}`
    if (sessionStatus !== 'authenticated') {
      router.push(`/auth/sign-in?callbackUrl=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  const stats: { icon: string; label: string; value: number }[] = [
    ...(item.viewCount != null ? [{ icon: 'lucide:play', label: 'ยอดดู', value: item.viewCount }] : []),
    ...(item.likeCount != null ? [{ icon: 'lucide:heart', label: 'ถูกใจ', value: item.likeCount }] : []),
    ...(item.commentCount != null && item.commentCount > 0
      ? [{ icon: 'lucide:message-circle', label: 'ความคิดเห็น', value: item.commentCount }]
      : []),
  ]

  return (
    <ProfileLightbox
      open
      onClose={onClose}
      onPrev={index > 0 ? () => onIndexChange(index - 1) : undefined}
      onNext={index < items.length - 1 ? () => onIndexChange(index + 1) : undefined}
      index={index + 1}
      total={items.length}
      ariaLabel={item.caption ?? `คลิปจาก ${ui.label}`}
      mediaSlot={<ClipMedia key={item.id} item={item} />}
      panelSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', blockSize: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            {ui.logo && (
              <Box component='span' sx={{ inlineSize: 24, blockSize: 24, flex: 'none' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ static ใน public/ */}
                <img src={ui.logo} alt={ui.label} style={{ width: '100%', height: '100%' }} />
              </Box>
            )}
            <Box sx={{ minInlineSize: 0 }}>
              {item.accountName && (
                <Typography variant='body2' sx={{ fontWeight: 700 }} noWrap>
                  {`@${item.accountName}`}
                </Typography>
              )}
              <Typography variant='caption' color='text.secondary'>
                {ui.label}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1, minBlockSize: 0 }}>
            {item.caption && <Typography variant='body2'>{item.caption}</Typography>}

            {stats.length > 0 && (
              <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
                {stats.map((s) => (
                  <Box key={s.label} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                    <Icon icon={s.icon} width={15} />
                    <Typography component='span' variant='body2' sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {compactCount(s.value)}
                    </Typography>
                    <Typography component='span' variant='caption' color='text.secondary'>
                      {s.label}
                    </Typography>
                  </Box>
                ))}
                {/* 🛑 ต้องบอกว่าเป็นตัวเลข ณ วันที่ร้านกดเลือก ไม่ใช่ค่าสด — ไม่งั้นผู้ชมที่ไปเทียบ
                    กับแพลตฟอร์มต้นทางแล้วเห็นไม่ตรงจะสรุปว่าเราปั้นตัวเลข ซึ่งแย่กว่าไม่โชว์เลย */}
                <Typography variant='caption' color='text.secondary' sx={{ inlineSize: '100%' }}>
                  ตัวเลขบันทึกไว้ตอนที่ร้านเลือกคลิปนี้ ไม่ใช่ค่าล่าสุด
                </Typography>
              </Box>
            )}
          </Box>

          {canChat && (
            <Box
              sx={{
                position: 'sticky',
                insetBlockEnd: 0,
                p: 2,
                bgcolor: 'background.paper',
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Button fullWidth variant='contained' startIcon={<Icon icon='tabler-message-circle' fontSize={18} />} onClick={handleChat}>
                แชทกับร้าน
              </Button>
            </Box>
          )}
        </Box>
      }
    />
  )
}
