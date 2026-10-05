'use client'

/**
 * SmsAutoEnter — จอเปลี่ยนผ่านเมื่อเปิดจากลิงก์ SMS (แนวทาง 5 ที่ user เลือก 2026-10-04)
 *
 * เปิดลิงก์ → เห็นบัตรร้าน (รูป · ชื่อ · ระดับยืนยัน · คะแนน · ออเดอร์สำเร็จ) ระหว่างระบบ
 * เข้าสู่ระบบให้อัตโนมัติด้วยโค้ดในลิงก์ (provider `sms-link` — เผาโค้ด one-time + สร้าง/หาบัญชี
 * จากเบอร์ + ผูกลูกค้า/ออเดอร์) แล้วพาไปหน้าออเดอร์ฉบับเต็ม ไม่มีปุ่ม ไม่ต้องกรอกอะไร
 *
 * ทำไมเห็นร้านก่อน: ผู้ซื้อกลุ่มนี้ระแวงมิจฉาชีพ การเห็นว่าร้านยืนยันถึงระดับไหนและมีประวัติจริง
 * ก่อนเห็นยอดเงินคือสิ่งที่ Deep มีไว้ทำ · ทุกค่าที่นี่เป็นข้อมูลโปรไฟล์ร้านสาธารณะ ไม่มี PII ผู้ซื้อ
 *
 * 🛑 ไม่มีสถานะ "สำเร็จ"/เช็กเขียว — การเข้าสู่ระบบสำเร็จไม่ใช่การยืนยันความน่าเชื่อถือ (Verified-Means-Green)
 * 🛑 `useRef` กันยิง signIn ซ้ำ (Strict Mode/effect รันสองรอบ) — โค้ดใช้ได้ครั้งเดียว ยิงรอบสอง = ลิงก์ตาย
 * 🛑 bfcache: กด Back กลับมาจากหน้าเต็ม → reload ไม่งั้นค้างที่จอนี้กับโค้ดที่ถูกใช้ไปแล้ว
 *
 * ทางหนีเมื่อ JS ปิด/ช้า/ค้าง: บล็อก "เข้าสู่ระบบด้วยเบอร์โทรแทน" โผล่เองหลัง 6 วิ ด้วย CSS ล้วน
 * (ไม่พึ่ง JS — ครอบทั้ง JS ปิด · hydrate ช้า · signIn ไม่ resolve)
 *
 * Base: ม็อกอัพที่ user อนุมัติ docs/superpowers/specs/2026-10-04-sms-link-v5-detailed-mockup.html (สลิป)
 *   + src/app/(marketing)/o/[token]/GuestOrderView.tsx (avatar ring + ชื่อร้าน h1 clamp 2 + TrustPill)
 */
import { useEffect, useRef, useState } from 'react'

import Link from 'next/link'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import { Icon } from '@iconify/react'
import { signIn } from 'next-auth/react'

import Logo from '@components/layout/shared/Logo'

import { goAfterLogin } from '@/lib/go-after-login'
import { VERIFY_LEVEL_MAX, resolveVerifyBadge } from '@/lib/verify-badge'
import TrustPill from './TrustPill'

type Props = {
  code: string
  publicToken: string
  shopName: string
  avatarUrl: string | null
  maxVerifyLevel: number
  avgRating: number | null
  reviewCount: number
  completedOrders: number | null
  /** ป้ายตัวเลขสำเร็จผันตามประเภทร้าน — จาก shopCompletedLabel() ที่เดียว (ร้านบริการ = 'งานสำเร็จ' · #105) */
  completedLabel: string
  /** ล็อกอินบัญชีอื่นค้างอยู่ — ไม่มีปุ่มให้กดยินยอมแล้ว จึงต้องบอกให้รู้ว่าจะสลับบัญชี */
  switchingAccount: boolean
}

export default function SmsAutoEnter(props: Props) {
  const { code, publicToken, shopName, avatarUrl, maxVerifyLevel, avgRating, reviewCount, completedOrders, completedLabel } = props
  const back = `/o/${publicToken}`
  const phoneLogin = `/auth/sign-in?callbackUrl=${encodeURIComponent(back)}`
  const fired = useRef(false)
  const failRef = useRef<HTMLHeadingElement>(null)
  const [failed, setFailed] = useState(false)

  const enter = async () => {
    setFailed(false)
    try {
      const res = await signIn('sms-link', { code, redirect: false })
      if (res?.ok) {
        await goAfterLogin(back) // ตัวกลางเดียวของทุกทางเข้าระบบ (รอ session แล้ว hard-navigate)
        return
      }
      // โค้ดใช้ไปแล้ว/หมดอายุ → หน้าเข้าสู่ระบบด้วยเบอร์ (หน้านั้นแสดงแถบบอกเหตุผล + เปิดฟอร์มเบอร์ให้เลย)
      window.location.href = `/auth/sign-in?smsExpired=1&callbackUrl=${encodeURIComponent(back)}`
    } catch {
      // เน็ตหลุด = ยังไม่ได้ไปไหน (โค้ดยังไม่ถูกเผาฝั่ง server ถ้าคำขอไม่ถึง) → ให้ลองใหม่ได้
      setFailed(true)
    }
  }

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    void enter()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ยิงครั้งเดียวตอน mount เท่านั้น
  }, [])

  useEffect(() => {
    if (failed) failRef.current?.focus()
  }, [failed])

  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  const verifyBadge = resolveVerifyBadge(maxVerifyLevel)

  // ช่องเรียงแบบสลิป: ป้ายซ้าย · เส้นจุดนำสายตา · ค่าขวา — แถวที่ไม่มีข้อมูลไม่แสดง (ไม่ประจานร้านใหม่ด้วยเลข 0)
  // 🛑 คำต้องเป็นชุดเดียวกับระบบ (HR16): "ยืนยันเบอร์แล้ว" จาก verify-badge.ts · "ออเดอร์สำเร็จ" ชุดเดียวกับ
  // ShopEvidence — ห้ามเขียนว่า "ผู้ซื้อยืนยันรับของ" เพราะ CONFIRMED เกิดได้จาก COD/ระบบปิดเองด้วย (audit 2026-10-04)
  const rows: { icon: string; label: string; value: React.ReactNode }[] = []
  if (verifyBadge) rows.push({ icon: verifyBadge.icon, label: verifyBadge.label, value: <TrustPill tone={verifyBadge.tone} label={`ระดับ ${Math.min(maxVerifyLevel, VERIFY_LEVEL_MAX)} จาก ${VERIFY_LEVEL_MAX}`} /> })
  // D-11 — 0 ไม่เขียน (ป้าย "ร้านใหม่" บอกแทน) · null = ไม่รู้ ก็ไม่เขียน
  if (completedOrders != null && completedOrders > 0) rows.push({ icon: 'tabler-circle-check', label: completedLabel, value: <b>{completedOrders} ครั้ง</b> })
  if (avgRating != null)
    rows.push({
      icon: 'tabler-star',
      label: 'คะแนนรีวิว',
      value: (
        <span>
          <b>{avgRating}</b>
          <Box component='span' sx={{ color: 'text.secondary' }}> · {reviewCount} รีวิว</Box>
        </span>
      ),
    })

  return (
    <div className='flex min-bs-[100dvh] justify-center items-center p-6'>
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        {/* ── สลิปหลักฐานของร้าน — พระเอกของจอ (ขอบล่างแบบฉีกจากเครื่องพิมพ์) ── */}
        <Card
          sx={{
            borderRadius: '12px 12px 0 0',
            pb: 3,
            // ขอบฉีก: mask ครึ่งวงกลมซ้ำตามแนวนอนที่ขอบล่าง (ตกแต่ง ไม่กระทบเนื้อหา)
            WebkitMask: 'radial-gradient(circle at 8px 100%, transparent 6.5px, #000 7px) 0 0 / 16px 100% repeat-x',
            mask: 'radial-gradient(circle at 8px 100%, transparent 6.5px, #000 7px) 0 0 / 16px 100% repeat-x',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 5,
              py: 3,
              borderBottom: '1.5px dashed',
              borderColor: 'divider',
            }}
          >
            <Link href='/' aria-label='กลับหน้าแรก' className='inline-flex'>
              <Logo />
            </Link>
            <Typography variant='caption' color='text.secondary'>
              หลักฐานของร้าน
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center', px: 5, pt: 5 }}>
            <Box
              sx={{
                width: 104,
                height: 104,
                borderRadius: '50%',
                border: '4px solid',
                borderColor: 'background.paper',
                bgcolor: 'background.paper',
                boxShadow: 'var(--mui-customShadows-lg)',
                mx: 'auto',
                display: 'grid',
                placeItems: 'center',
                fontSize: '2rem',
                fontWeight: 800,
                color: 'text.secondary',
                overflow: 'hidden',
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                shopName.slice(0, 1)
              )}
            </Box>
            {/* ชื่อร้านเด่น (user สั่ง 2026-10-04) — 24px Strong · ชื่อยาวสุดในระบบ ~38 ตัวอักษร ตัด 2 บรรทัด */}
            <Typography
              component='h1'
              sx={{
                mt: 4,
                fontSize: '1.75rem' /* Headline ใน DESIGN.md — ชื่อร้านเป็นพระเอกของจอ (user สั่งให้เด่น) */,
                fontWeight: 700,
                lineHeight: 1.3,
                textWrap: 'balance',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {shopName}
            </Typography>
          </Box>

          {rows.length > 0 && (
            <Box component='dl' sx={{ m: 0, px: 5, pt: 4, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {rows.map((r) => (
                <Box key={r.label} sx={{ display: 'flex', alignItems: 'flex-end', fontSize: '0.9375rem' }}>
                  <Icon icon={r.icon} fontSize={18} aria-hidden style={{ color: 'var(--mui-palette-text-secondary)', marginRight: 8, flexShrink: 0 }} />
                  <Box component='dt'>{r.label}</Box>
                  <Box aria-hidden sx={{ flex: 1, borderBottom: '1.5px dotted', borderColor: 'divider', mx: 2, mb: '5px' }} />
                  <Box component='dd' sx={{ m: 0 }}>{r.value}</Box>
                </Box>
              ))}
            </Box>
          )}
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', px: 5, pt: 3 }}>
            ตัวเลขจากระบบ Deep ร้านแก้เองไม่ได้
          </Typography>
        </Card>

            {/* ── สถานะ ── */}
            {failed ? (
              <Box sx={{ mt: 6, textAlign: 'center' }}>
                <Icon icon='tabler-wifi-off' fontSize={28} style={{ color: 'var(--mui-palette-text-secondary)' }} />
                <Typography ref={failRef} tabIndex={-1} role='alert' variant='h6' sx={{ mt: 1, outline: 'none' }}>
                  ยังเปิดลิงก์ไม่ได้
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                  สัญญาณอินเทอร์เน็ตอาจหลุด กรุณาตรวจสัญญาณแล้วลองใหม่
                </Typography>
                <Button fullWidth variant='contained' onClick={() => void enter()} sx={{ mt: 4, minHeight: 48 }}>
                  ลองอีกครั้ง
                </Button>
                <Button fullWidth color='secondary' href={phoneLogin} sx={{ mt: 1, minHeight: 44 }}>
                  เข้าสู่ระบบด้วยเบอร์โทรแทน
                </Button>
              </Box>
            ) : (
              <Box sx={{ mt: 6, textAlign: 'center' }}>
                <Box
                  aria-live='polite'
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: 'text.secondary' }}
                >
                  {/* .animate-spin ถูกยกเว้นจาก reduced-motion ไว้แล้ว (marketing.css) — MUI CircularProgress จะหยุดนิ่ง */}
                  <Icon icon='tabler-loader-2' fontSize={20} className='animate-spin' style={{ color: 'var(--mui-palette-primary-main)' }} />
                  <Typography color='text.secondary'>กำลังเปิดคำสั่งซื้อของคุณ…</Typography>
                </Box>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
                  ลิงก์นี้ส่งเข้าเบอร์ของคุณ จึงไม่ต้องกรอกเบอร์หรือรหัส OTP
                </Typography>
                {props.switchingAccount && (
                  <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
                    คุณล็อกอินอยู่ ระบบจะเข้าสู่ระบบใหม่ด้วยเบอร์ที่รับลิงก์นี้
                  </Typography>
                )}
                {/* ทางหนี — โผล่เองหลัง 6 วิด้วย CSS ล้วน (ไม่พึ่ง JS) · reduced-motion ไม่ฆ่า delay */}
                <Box
                  sx={{
                    mt: 4,
                    visibility: 'hidden',
                    animation: 'smsEscape 0s linear 6s forwards',
                    '@keyframes smsEscape': { to: { visibility: 'visible' } },
                  }}
                >
                  <Typography variant='body2' color='text.secondary'>
                    ยังเปิดไม่ได้?{' '}
                    <Link href={phoneLogin} style={{ color: 'var(--mui-palette-primary-main)', fontWeight: 600 }}>
                      เข้าสู่ระบบด้วยเบอร์โทรแทน
                    </Link>
                  </Typography>
                </Box>
                <noscript>
                  <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
                    ต้องเปิด JavaScript จึงจะเปิดลิงก์นี้ให้อัตโนมัติ ·{' '}
                    <a href={phoneLogin}>เข้าสู่ระบบด้วยเบอร์โทรแทน</a>
                  </Typography>
                </noscript>
              </Box>
            )}
      </Box>
    </div>
  )
}
