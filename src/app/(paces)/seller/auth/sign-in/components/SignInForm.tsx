/**
 * Seller sign-in form — redesign P2 S-P2-1 (username+password แทน phone-OTP)
 *
 * Base: theme/paces/Admin/TS/src/app/auth/card/sign-in/components/Form.tsx
 * Field error style: theme/paces/Admin/TS/src/app/(admin)/form/validation/components/CustomValidation.tsx
 *
 * Changes vs base:
 * - เปลี่ยน email → username field (icon tabler:user)
 * - เปลี่ยน password label เป็นภาษาไทย + icon tabler:lock-password
 * - ตัด "Keep me signed in" checkbox (ตาม OQ-2 — ไม่มี remember-me)
 * - เพิ่ม Facebook button (w-full, icon bxl:facebook-circle) + dashed divider
 * - เพิ่ม link "ลืมรหัสผ่าน?" → /auth/reset-pass
 * - form state จัดการด้วย react-hook-form + Yup (แทน useState ของ base)
 * - onSubmit: signIn('seller-credentials') → ok hard-navigate ไป callbackUrl;
 *   fail → setError('root') inline แทน toast (generic กัน enumeration)
 * - loading state: "กำลังเข้าสู่ระบบ..." + disabled
 * - login error แสดง inline ใต้ submit (errors.root) ไม่ใช่ toast
 * - field error style: cn('form-input', errors.x && '!border-danger') + invalid-msg
 *
 * feature 00012 ext — เคารพ `?callbackUrl=`:
 *   เดิมทุกช่องทางเด้ง /dashboard ตายตัว ทำให้ผู้ถูกเชิญที่มาจาก /i/<slug> เสียบริบทคำเชิญทิ้ง
 *   (ลิงก์ "เข้าสู่ระบบด้วยวิธีอื่น" ส่ง callbackUrl มาแล้ว แต่ฟอร์มนี้ไม่เคยอ่าน) ตอนนี้ทั้ง
 *   credentials / Facebook / LINE / Instagram พากลับปลายทางเดิม โดย sanitize ผ่าน safeCallbackUrl
 *   กัน open-redirect (ค่าจาก query string = ผู้โจมตีแก้ได้)
 */

'use client'

import { Icon as BxIcon } from '@iconify/react'
import { yupResolver } from '@hookform/resolvers/yup'
import { getCsrfToken, signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as Yup from 'yup'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import type { Dictionary } from '@/i18n/dictionaries/th'
import { canUseAppleNative, runAppleNativeSignIn } from '@/lib/apple-native-signin'
import { goAfterLogin } from '@/lib/go-after-login'
import { MOBILE_RULE_TEXT, isLoginPhone } from '@/lib/phone'
import { safeCallbackUrl } from '@/lib/safe-callback-url'
import { cn } from '@/utils/helpers'
import {
  sendSigninOtp,
  signinOtpVerifyUrl,
  type SigninOtpFailReason,
} from '../../components/send-signin-otp'

/**
 * schema ต้องสร้างจาก dictionary ไม่ใช่ค่าคงที่ระดับ module (feature 00047)
 * ข้อความ validation เป็นสิ่งที่ผู้ใช้เห็นบนจอ จึงต้องเปลี่ยนตามภาษาเหมือนข้อความอื่นทุกตัว
 * ถ้าปล่อยไว้นอก component มันจะถูกผูกกับภาษาที่โหลดตอน bundle แล้วค้างเป็นไทยตลอดไป
 */
function makeSchema(t: Dictionary) {
  return Yup.object({
    username: Yup.string().min(3, t.auth.signIn.errUsernameMin).required(t.auth.signIn.errUsernameRequired),
    password: Yup.string().min(1, t.auth.signIn.errPasswordRequired).required(t.auth.signIn.errPasswordRequired),
  })
}

/**
 * เบอร์โทร — ยึด SSOT เดียวกับทั้งระบบ ผ่าน `isLoginPhone()`
 * (= `MOBILE_PHONE_RE` `^0[689][0-9]{8}$` บน production · นอก production รับเบอร์บัญชีทดสอบด้วย)
 *
 * 🛑 ข้อความ "เบอร์ผิดยังไง" ต้องเป็น `MOBILE_RULE_TEXT` ตัวเดียวกับที่ฟอร์มอื่นใช้ ห้าม mint
 * คีย์ใหม่ใน dictionary — คอมมิต `3ceb477f` เพิ่งไล่เก็บกรณี "คำเดียวกันเขียน 3 แบบ" ไปหมาด ๆ
 * การมีคำที่ 4 แปลว่าผู้ใช้จะได้ยินกฎคนละอย่างจากสองจอที่ทำเรื่องเดียวกัน (Hard Rule 16)
 * แลกกับการที่สตริงนี้ยังไม่มีคำแปล EN — ยอมรับได้ เพราะ "กฎที่บอกผิด" เสียหายกว่า "ไม่ได้แปล"
 */
function makePhoneSchema(t: Dictionary) {
  return Yup.object({
    phone: Yup.string()
      .test('login-phone', MOBILE_RULE_TEXT, (v) => isLoginPhone(v ?? ''))
      .required(t.auth.signIn.errPhoneRequired),
  })
}

type FormValues = Yup.InferType<ReturnType<typeof makeSchema>>
type PhoneFormValues = Yup.InferType<ReturnType<typeof makePhoneSchema>>

/**
 * @param hideSignUp ในแอป iOS ห้ามมีทางไปสมัครบัญชี (Guideline 3.1.1 — Apple สั่ง 2026-08-23)
 *   ค่ามาจาก server component แม่ (`shouldHideSignUp()`) — component นี้เป็น `'use client'`
 *   จึงอ่าน cookie/UA เองไม่ได้ และ **ไม่ควรอ่าน** เพราะเกณฑ์ต้องมีที่เดียว (`app-shell.ts`)
 */
export default function SignInForm({ hideSignUp = false }: { hideSignUp?: boolean }) {
  const t = useT()
  const schema = useMemo(() => makeSchema(t), [t])
  const router = useRouter()
  const searchParams = useSearchParams()
  // ปลายทางหลัง login — มาจาก query string จึงต้อง sanitize ทุกครั้ง (open-redirect)
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'))
  const [showPw, setShowPw] = useState(false)
  /**
   * ทางเข้า 2 แบบในจอเดียว — default = 'password' เสมอ เพื่อไม่เปลี่ยนพฤติกรรมของคนที่มี
   * รหัสผ่านอยู่แล้ว. โหมด 'otp' มีไว้ให้บัญชีที่สมัครด้วย OTP ล้วน (ไม่เคยตั้งรหัสผ่าน)
   * ซึ่งก่อนหน้านี้เข้าฝั่งผู้ขายไม่ได้เลยสักทาง
   */
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password')
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: { username: '', password: '' },
  })

  const phoneSchema = useMemo(() => makePhoneSchema(t), [t])
  const otpForm = useForm<PhoneFormValues>({
    resolver: yupResolver(phoneSchema),
    defaultValues: { phone: '' },
  })
  /** ผลของการขอ OTP ครั้งล่าสุด — เก็บเป็น "รหัสเหตุผล" แล้วค่อยแปลเป็นคำตอนแสดง */
  const [otpError, setOtpError] = useState<SigninOtpFailReason | null>(null)

  /**
   * ปุ่มล็อกอินพร้อมให้กดหรือยัง — แก้อาการ "กดครั้งแรกแล้วไม่ไปไหน" (หัวหน้าเจอ 2026-09-16)
   *
   * ## อาการ
   *
   * ลบแอปแล้วติดตั้งใหม่ → เปิดครั้งแรก → กด Sign in with Apple → **ไม่เกิดอะไรขึ้นเลย**
   * ต้องกดครั้งที่สองถึงจะไป · เจอหลายจุดไม่ใช่เฉพาะปุ่มนี้
   *
   * ## ตัวเดียวปิดสองสาเหตุพร้อมกัน
   *
   * **1. ช่วงที่หน้าแสดงผลแล้วแต่ยังไม่ hydrate** — เปลือกแอปเอาโครงหน้า (skeleton) ออกตอน
   * `onLoadEnd` ซึ่งเกิด **ก่อน** React ผูก `onClick` เสร็จ ⇒ ผู้ใช้เห็นปุ่มครบทุกปุ่มและกดได้
   * แต่ไม่มีอะไรรับการกดนั้น · ติดตั้งใหม่ = ไม่มี cache = ช่วงนี้ยาวที่สุด
   *
   * **2. คุกกี้ CSRF ยังไม่ทันถูกเก็บ** — โปรเจกต์นี้ไม่มี `SessionProvider` และไม่เคยเรียก
   * `getCsrfToken()` ที่ไหนเลย ⇒ คุกกี้ถูกสร้าง **ตอนกดปุ่มครั้งแรกพอดี** แล้ว `signIn()`
   * ยิง POST ตามมาทันที · ถ้า WebView ยังเขียนคุกกี้ไม่ลง next-auth จะตอบ
   * `redirect: /signin?csrf=true` (`core/index.js:242`) ⇒ **เด้งกลับหน้าเดิมเงียบ ๆ**
   * ซึ่งผู้ใช้อ่านว่า "กดแล้วไม่ไปไหน" เหมือนกันเป๊ะ
   *
   * เปิดปุ่มหลัง `getCsrfToken()` จบ ⇒ ได้ทั้ง "hydrate แล้วแน่นอน" (useEffect ทำงาน = hydrate
   * เสร็จ) และ "คุกกี้พร้อมแล้ว" ในกลไกเดียว
   *
   * 🛑 **ล้มก็ต้องเปิดปุ่ม** — ถ้าเน็ตสะดุดตอนอุ่นคุกกี้แล้วเราปล่อยปุ่มปิดไว้ ผู้ใช้จะล็อกอิน
   * ไม่ได้เลยทั้งหน้า ซึ่งแย่กว่าอาการเดิมมาก ⇒ `finally` เสมอ ไม่ใช่ `then`
   */
  /**
   * ปุ่ม Apple กำลังทำงานอยู่ไหม + ผลลัพธ์ที่ต้องค้างไว้บนจอ (แก้ 2.1(a) · 2026-09-27)
   *
   * 🛑 Apple ตีกลับเพราะ *"no action took place when we using Sign in with Apple"* —
   * กดปุ่มแล้ว **จอไม่ขยับเลยสักพิกเซล** ระหว่างรอแผ่นของระบบ และถ้าผู้ใช้ปัดแผ่นทิ้ง
   * โค้ดเดิม `return` เฉย ๆ ⇒ เงียบสนิทตั้งแต่ต้นจนจบ
   *
   * ⇒ ทุกเส้นทางต้องทิ้งร่องรอยไว้บนจอ: ระหว่างรอมีสปินเนอร์ · จบแล้วมีข้อความค้าง
   */
  /**
   * ปุ่มไหนกำลังทำงาน — **ตัวเดียวคุมทุกเจ้า** ไม่ใช่ state แยกต่อ provider
   *
   * 🛑 ต้องเป็นตัวเดียว เพราะนอกจากโชว์สปินเนอร์แล้วมันต้อง **ปิดปุ่มที่เหลือ** ด้วย —
   * กดเจ้าที่สองซ้อนระหว่างที่เจ้าแรกกำลังพาออกไป = คุกกี้ระหว่างเดินทาง (state/pkce/
   * callback-url) ของเจ้าแรกถูกเขียนทับ แล้วจบที่หน้า error โดยไม่มีอะไรบอกว่าทำไม
   * (ปัญหาเดียวกับที่ `ConnectedAccountsClient` แก้ด้วย prop `disabled` เมื่อ 2026-08-12)
   */
  const [oauthBusy, setOauthBusy] = useState<'apple' | 'facebook' | 'line' | 'instagram' | null>(
    null,
  )
  const appleBusy = oauthBusy === 'apple'
  const [appleNotice, setAppleNotice] = useState<string | null>(null)
  const [oauthReady, setOauthReady] = useState(false)
  useEffect(() => {
    let alive = true
    void getCsrfToken()
      .catch(() => null)
      .finally(() => {
        if (alive) setOauthReady(true)
      })
    return () => {
      alive = false
    }
  }, [])

  /**
   * Sign in with Apple — App Store Guideline 4.8 (rejection 2026-08-04)
   *
   * Apple บังคับว่าถ้ามีล็อกอินของเจ้าอื่น (Facebook/LINE) ต้องมีตัวเลือกที่เก็บข้อมูลแค่ชื่อ+อีเมล
   * และให้ผู้ใช้ซ่อนอีเมลจริงได้ ให้เลือกด้วย — ไม่มี = ตีกลับทั้ง build
   *
   * ชี้ตรงปลายทางเหมือน Facebook (ไม่ผ่านหน้า loading กลาง) — Apple ส่งกลับแบบ form_post
   * ซึ่งผ่าน callback ของ NextAuth ที่ตั้ง session cookie ให้ก่อน redirect อยู่แล้ว
   */
  const handleApple = async () => {
    /**
     * ── ในแอป iOS: ต้องเป็น "แผ่นของระบบ" ไม่ใช่หน้าเว็บ (Guideline 4 · ตีกลับ 2026-09-24) ──
     *
     * ทีมรีวิวแนบภาพหน้า `appleid.apple.com` ที่ถาม *"Email or Phone Number"* มา 3 ใบ —
     * นั่นคือหน้าเว็บของ Apple ที่ `signIn('apple')` พาไป ซึ่ง Apple ไม่ยอมรับในแอป iOS
     *
     * 🛑 **ปุ่มหน้าตาเหมือนเดิมทุกอย่าง ไม่มีหน้าใหม่** — สิ่งที่เปลี่ยนคือ *ใครเป็นคนเปิด
     * จอของ Apple* เท่านั้น · ทำหน้าใหม่แยกสำหรับแอปไม่ช่วยเลย เพราะปุ่มในหน้านั้นก็ยัง
     * ต้องไป `appleid.apple.com` อยู่ดี
     *
     * 🛑 **ทุกเส้นทางที่ไม่สำเร็จต้องถอยไปทางเว็บ ห้ามค้าง** — เบราว์เซอร์ปกติ · แอปรุ่นเก่า
     * ที่ยังไม่มีโมดูล native · แผ่นระบบล้ม · เซิร์ฟเวอร์ปฏิเสธโทเคน ⇒ ตกมาบรรทัดล่างสุด
     * ซึ่งเป็นทางเดิมที่ใช้งานได้อยู่แล้วทุกประการ (เกณฑ์รวมอยู่ใน `runAppleNativeSignIn`)
     */
    const inApp = canUseAppleNative(typeof window === 'undefined' ? undefined : window)
    if (inApp) {
      setAppleNotice(null)
      setOauthBusy('apple')
      const outcome = await runAppleNativeSignIn()

      if (outcome.kind === 'ticket') {
        const result = await signIn('mobile-ticket', { ticket: outcome.ticket, redirect: false })
        if (result?.ok) {
          /* 🛑 ห้ามล้าง appleBusy ตรงนี้ — หน้ากำลังจะถูกทิ้งทั้งหน้า ปล่อยสปินเนอร์ค้างไว้
             คือคำตอบที่ถูก (บทเรียนเดียวกับ ConnectedAccountsClient 2026-08-12) */
          await goAfterLogin(callbackUrl)
          return
        }
      }

      setOauthBusy(null)

      if (outcome.kind === 'cancelled') {
        /* 🛑 เดิม `return` เฉย ๆ = เงียบสนิท ซึ่งแยกไม่ออกจาก "ปุ่มเสีย"
           และเป็นเส้นทางที่ทีมรีวิวเดินมากที่สุด (เขาไม่อยากผูก Apple ID ส่วนตัว) */
        setAppleNotice(t.auth.signIn.oauthError.appleCancelled)
        return
      }
      if (outcome.kind === 'no-account') {
        router.replace('/auth/sign-in?app_no_account=1')
        return
      }

      /**
       * 🛑 อยู่ในแอปแล้วทาง native ล้มเหลว — **ห้ามถอยไปเปิดหน้าเว็บของ Apple**
       *
       * หน้านั้นคือสิ่งที่ Apple เพิ่งยอมรับว่าเราเอาออกแล้ว (Guideline 4 · ผ่านรอบ 27 ก.ย.)
       * เปิดกลับมาเมื่อไหร่ = เอาข้อที่แก้ผ่านแล้วกลับมาแลกกับข้อที่กำลังแก้
       * ⇒ บอกให้ชัดแล้วชี้ไปช่องชื่อผู้ใช้/รหัสผ่านซึ่งอยู่บนหน้าเดียวกันอยู่แล้ว
       */
      setAppleNotice(
        `${t.auth.signIn.oauthError.appleUnavailable} — ${t.auth.signIn.oauthError.useUsernameInstead}`,
      )
      return
    }

    await signIn('apple', {
      callbackUrl: `/auth/callback/apple?next=${encodeURIComponent(callbackUrl)}`,
    })
  }

  /**
   * พาออกไปหน้าผู้ให้บริการ — ใช้ร่วมกันทั้ง Facebook / LINE / Instagram
   *
   * 🛑 **ต้องตั้งสปินเนอร์ก่อน `await` เสมอ** — `signIn()` ตั้ง `window.location.href` แล้ว
   * **resolve promise ทันที** โดยเบราว์เซอร์ยังไม่ไปไหน (`next-auth/react/index.js:263`)
   * ⇒ ถ้าไม่มีอะไรขยับ ผู้ใช้จะเห็นจอนิ่ง ๆ อีกครึ่งวินาทีถึงหลายวินาที **แล้วกดซ้ำ**
   * ซึ่งคืออาการเดียวกับที่ Apple ตีกลับด้วยข้อ 2.1(a) *"no action took place"*
   *
   * 🛑 **ห้ามล้าง `oauthBusy` หลัง `await`** — หน้ากำลังจะถูกทิ้งทั้งหน้า การล้างตรงนั้นทำให้
   * สปินเนอร์วาบเดียวแล้วกลับมานิ่งก่อนหน้าจะเปลี่ยนจริง = อาการ "แวบ ๆ" ที่หัวหน้ารายงาน
   * เมื่อ 2026-08-12 · ล้างเฉพาะตอน **โยน error** ซึ่งแปลว่าไม่ได้ไปไหนแน่นอน
   */
  const goToProvider = async (
    provider: 'facebook' | 'line' | 'instagram',
    options: Parameters<typeof signIn>[1],
  ) => {
    setAppleNotice(null)
    setOauthBusy(provider)
    try {
      await signIn(provider, options)
    } catch {
      setOauthBusy(null)
      setAppleNotice(t.auth.signIn.oauthError.oauthSignin)
    }
  }

  const handleFacebook = async () => {
    // ชี้ตรงปลายทาง (ไม่ผ่านหน้า loading กลาง /auth/callback/facebook) เพื่อลด redirect chain
    // — NextAuth set session cookie ก่อน 302, proxy อ่าน JWT เด้ง onboarding/register ถูกอยู่แล้ว.
    //   redirect chain สั้นลงช่วยลด phishing-heuristic false-positive ของ Safe Browsing (2026-06-20)
    await goToProvider('facebook', { callbackUrl })
  }

  const handleLine = async () => {
    // LINE/IG ยังผ่านหน้า loading กลางเพื่อรอ session ให้นิ่งก่อน (ต่างจาก FB) — ส่งปลายทางจริง
    // ต่อไปทาง ?next= ให้หน้านั้น redirect ต่อ แทนที่จะจบตายตัวที่ /dashboard
    await goToProvider('line', {
      callbackUrl: `/auth/callback/line?next=${encodeURIComponent(callbackUrl)}`,
    })
  }

  const handleInstagram = async () => {
    await goToProvider('instagram', {
      callbackUrl: `/auth/callback/instagram?next=${encodeURIComponent(callbackUrl)}`,
    })
  }

  const onSubmit = async ({ username, password }: FormValues) => {
    const result = await signIn('seller-credentials', {
      username,
      password,
      redirect: false,
    })

    if (result?.ok) {
      /**
       * บั๊กจริง (หัวหน้าเจอ 2026-09-17): ล็อกอิน `appreview` ด้วยรหัสผ่านแล้ว **ไม่พาเข้าไป
       * ต้องรีเฟรชเอง** — ตระกูลเดียวกับบั๊ก Apple (#66) ต่างกันแค่ทางเข้า
       *
       * 🛑 ทั้ง "รอ session" และ "hard-navigate" จำเป็นทั้งคู่และแก้คนละปัญหา —
       * เหตุผลเต็มอยู่ใน src/lib/go-after-login.ts (ตัวกลางของทุกจุดที่ล็อกอินแล้วเปลี่ยนหน้า)
       */
      await goAfterLogin(callbackUrl)
    } else {
      // generic error — ไม่บอก username/password อันไหนผิดเพื่อกัน enumeration
      // ทั้ง 2 field ขึ้น border แดงโดยไม่โชว์ text ซ้อน; ข้อความรวมอยู่ที่ errors.root
      setError('username', { type: 'server', message: '' })
      setError('password', { type: 'server', message: '' })
      setError('root', { message: t.auth.signIn.errInvalidCredentials })
    }
  }

  const onOtpSubmit = async ({ phone }: PhoneFormValues) => {
    setOtpError(null)
    const result = await sendSigninOtp(phone)
    if (result.ok) {
      // ส่ง callbackUrl ดิบต่อไป — ปลายทางนั้น sanitize เองอีกชั้น (ท่าเดียวกับฝั่ง buyer)
      router.push(signinOtpVerifyUrl(phone, searchParams.get('callbackUrl')))
      return
    }
    setOtpError(result.reason)
  }

  /** สลับโหมด — ล้าง error ของโหมดที่เพิ่งออกมา ไม่ให้ค้างไปพูดกับฟอร์มที่ไม่เกี่ยวกัน */
  const switchMode = (next: 'password' | 'otp') => {
    setOtpError(null)
    setLoginMode(next)
  }

  const otpErrorMessage: Record<SigninOtpFailReason, string> = {
    NO_ACCOUNT: t.auth.signIn.otpNoAccount,
    RATE_LIMITED: t.auth.signIn.otpRateLimited,
    FAILED: t.auth.signIn.otpSendError,
  }

  return (
    <>
      {/* ผลลัพธ์ของทาง native ที่ต้องค้างไว้บนจอ — เหตุผลเต็มอยู่ที่ appleNotice */}
      {appleNotice && (
        <div
          className="bg-warning/15 text-warning-ink mb-4 flex w-full items-start gap-2.5 rounded px-4 py-3"
          role="status"
        >
          <Icon icon="info-circle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
          <span className="text-sm">{appleNotice}</span>
        </div>
      )}

      {/* กลุ่มปุ่ม Social Login — stack แนวตั้ง */}
      <div className="flex flex-col gap-3">
        {/* ปุ่ม Sign in with Apple — วางบนสุดของกลุ่ม
            🛑 Apple บังคับให้อยู่ "ระดับเดียวกัน" กับล็อกอินเจ้าอื่น (Guideline 4.8) ห้ามซ่อนไว้
            หลังลิงก์ "ตัวเลือกอื่น" หรือทำให้เล็กกว่าปุ่มอื่น — วางบนสุดจึงชัดเจนที่สุดว่าไม่ได้ลดชั้น
            โลโก้ Apple ต้องเป็นสีดำบนพื้นขาวตาม Human Interface Guidelines (brand asset —
            carve-out จาก Paces token ตาม Hard Rule 6 เหมือน Facebook/LINE ด้านล่าง) */}
        <button
          type="button"
          onClick={handleApple}
          disabled={!oauthReady || oauthBusy !== null}
          aria-busy={appleBusy}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full disabled:opacity-60"
        >
          <BxIcon
            icon="bxl:apple"
            width={18}
            height={18}
            className="me-2 flex-shrink-0"
            style={{ color: '#000000' }} // brand asset Apple — carve-out จาก Paces token (Hard Rule 6)
          />
          {/* 🛑 สปินเนอร์ต้องขึ้นตั้งแต่วินาทีที่กด — ไม่ใช่รอให้แผ่นของระบบโผล่
              คนตรวจของ Apple เห็น "จอไม่ขยับ" แล้วสรุปว่าปุ่มเสีย (2.1(a) 2026-09-27) */}
          {appleBusy && (
            <Icon icon="loader-2" className="me-2 animate-spin text-base" aria-hidden="true" />
          )}
          {appleBusy ? t.auth.signIn.loading : t.auth.signIn.withApple}
        </button>

        {/* ปุ่ม Facebook OAuth */}
        <button
          type="button"
          onClick={handleFacebook}
          disabled={!oauthReady || oauthBusy !== null}
          aria-busy={oauthBusy === 'facebook'}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full disabled:opacity-60"
        >
          {/* BxIcon = raw Iconify เพราะ Facebook icon อยู่ใน boxicons set (bxl:)
              ขณะที่ Icon wrapper ของโปรเจกต์ fix prefix เป็น tabler: เท่านั้น */}
          <BxIcon
            icon="bxl:facebook-circle"
            width={18}
            height={18}
            className="me-2 flex-shrink-0"
            style={{ color: '#1877f2' }} // brand asset Facebook — carve-out จาก Paces token (Hard Rule 6)
          />
          {oauthBusy === 'facebook' && (
            <Icon icon="loader-2" className="me-2 animate-spin text-base" aria-hidden="true" />
          )}
          {oauthBusy === 'facebook' ? t.auth.signIn.loading : t.auth.signIn.withFacebook}
        </button>

        {/* ปุ่ม LINE OAuth — mirror structure เดียวกับ FB */}
        <button
          type="button"
          onClick={handleLine}
          disabled={!oauthReady || oauthBusy !== null}
          aria-busy={oauthBusy === 'line'}
          className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full disabled:opacity-60"
        >
          {/* LINE brand green #06C755 — brand asset exception จาก Paces token (Hard Rule 6) */}
          <BxIcon
            icon="ri:line-fill"
            width={18}
            height={18}
            className="me-2 flex-shrink-0"
            style={{ color: '#06C755' }} // brand asset LINE — carve-out จาก Paces token (Hard Rule 6)
          />
          {oauthBusy === 'line' && (
            <Icon icon="loader-2" className="me-2 animate-spin text-base" aria-hidden="true" />
          )}
          {oauthBusy === 'line' ? t.auth.signIn.loading : t.auth.signIn.withLine}
        </button>

        {/* ปุ่ม Instagram OAuth — flag-off by default (NEXT_PUBLIC_ENABLE_IG_LOGIN) */}
        {process.env.NEXT_PUBLIC_ENABLE_IG_LOGIN === 'true' && (
          <button
            type="button"
            onClick={handleInstagram}
            disabled={!oauthReady || oauthBusy !== null}
            aria-busy={oauthBusy === 'instagram'}
            className="btn border border-default-300 text-default-900 hover:border-default-400 hover:bg-default-50 w-full disabled:opacity-60"
          >
            {/* Instagram brand pink #E1306C — brand asset exception จาก Paces token (Hard Rule 6) */}
            <BxIcon
              icon="ri:instagram-fill"
              width={18}
              height={18}
              className="me-2 flex-shrink-0"
              style={{ color: '#E1306C' }} // brand asset Instagram — carve-out จาก Paces token (Hard Rule 6)
            />
            {oauthBusy === 'instagram' && (
              <Icon icon="loader-2" className="me-2 animate-spin text-base" aria-hidden="true" />
            )}
            {oauthBusy === 'instagram' ? t.auth.signIn.loading : t.auth.signIn.withInstagram}
          </button>
        )}
      </div>

      {/* dashed divider — copy structure จาก base theme ตรง ๆ */}
      <p className="relative my-5 text-center text-default-400 after:absolute after:start-0 after:end-0 after:top-2.75 after:h-0.75 after:border-t after:border-b after:border-dashed after:border-default-300">
        <span className="relative z-10 bg-card font-medium px-4">
          {loginMode === 'otp' ? t.auth.signIn.orPhone : t.auth.signIn.orUsername}
        </span>
      </p>

      {loginMode === 'otp' ? (
        <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} noValidate>
          {/* Phone field — โครงเดียวกับช่องเบอร์โทรใน SignUpForm.tsx (input-icon-group + form-input) */}
          <div className="mb-5">
            <label htmlFor="signin-phone" className="form-label">
              {t.auth.signIn.phoneLabel}
              <span className="text-danger">*</span>
            </label>
            <div className="input-icon-group">
              <Icon icon="phone" className="input-icon" />
              <input
                id="signin-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="08xxxxxxxx"
                maxLength={10}
                className={cn('form-input', otpForm.formState.errors.phone && '!border-danger')}
                {...otpForm.register('phone')}
              />
            </div>
            {otpForm.formState.errors.phone?.message && (
              <p className="invalid-msg mt-1 text-sm text-danger">
                {otpForm.formState.errors.phone.message}
              </p>
            )}
          </div>

          {/* ผลของการขอ OTP — NO_ACCOUNT มีทางออกจริงจึงพ่วงลิงก์ไปสมัครพร้อมเบอร์ที่พิมพ์ไว้แล้ว */}
          {otpError && (
            <div className="mb-4">
              <p className="invalid-msg text-sm text-danger">
                {otpErrorMessage[otpError]}
                {/* 🛑 ในแอป iOS ตัดลิงก์ทิ้ง เหลือแต่ข้อความบอกว่าไม่มีบัญชี —
                    ปลายทาง `/auth/sign-up` redirect ออกอยู่แล้ว ปล่อยลิงก์ไว้ = ปุ่มที่กดแล้ว
                    เด้งกลับที่เดิม ซึ่งอ่านเป็น "แอปพัง" มากกว่า "ทางนี้ปิด" */}
                {otpError === 'NO_ACCOUNT' && !hideSignUp && (
                  <>
                    {' '}
                    <Link
                      href={`/auth/sign-up?phone=${encodeURIComponent(otpForm.getValues('phone'))}`}
                      className="text-primary font-semibold underline underline-offset-4"
                    >
                      {t.auth.signIn.signUp}
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={otpForm.formState.isSubmitting}
              className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {otpForm.formState.isSubmitting ? t.auth.signIn.sendingOtp : t.auth.signIn.sendOtp}
            </button>
          </div>

          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => switchMode('password')}
              className="text-primary inline-flex min-h-11 items-center justify-center text-sm font-semibold underline underline-offset-4"
            >
              {t.auth.signIn.usePasswordInstead}
            </button>
          </div>
        </form>
      ) : (
      /* loginMode === 'password' — ฟอร์มเดิม ไม่แตะเนื้อใน (คงย่อหน้าเดิมไว้ให้ diff อ่านง่าย) */
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Username field */}
        <div className="mb-5">
          <label htmlFor="username" className="form-label">
            {t.auth.signIn.usernameLabel}
            <span className="text-danger">*</span>
          </label>
          <div className="input-icon-group">
            {/* Icon wrapper ใส่ tabler: อัตโนมัติ → tabler:user */}
            <Icon icon="user" className="input-icon" />
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="your_username"
              className={cn('form-input', errors.username && '!border-danger')}
              {...register('username')}
            />
          </div>
          {errors.username && errors.username.message && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.username.message}</p>
          )}
        </div>

        {/* Password field */}
        <div className="mb-5">
          <label htmlFor="password" className="form-label">
            {t.auth.signIn.passwordLabel}
            <span className="text-danger">*</span>
          </label>
          <div className="input-icon-group relative">
            {/* Icon wrapper ใส่ tabler: อัตโนมัติ → tabler:lock-password */}
            <Icon icon="lock-password" className="input-icon" />
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className={cn('form-input pe-10', errors.password && '!border-danger')}
              {...register('password')}
            />
            {/* eye toggle — React state ไม่ใช่ Preline data-hs-toggle-password (robust กว่า) */}
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? t.auth.signIn.hidePassword : t.auth.signIn.showPassword}
              className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-center text-default-500 hover:text-default-700"
            >
              <Icon icon={showPw ? 'eye-off' : 'eye'} className="text-base" />
            </button>
          </div>
          {errors.password && errors.password.message && (
            <p className="invalid-msg mt-1 text-sm text-danger">{errors.password.message}</p>
          )}
        </div>

        {/* Row: ลืมรหัสผ่าน? */}
        <div className="mb-5 flex items-center justify-end">
          <Link
            href="/auth/reset-pass"
            className="text-default-400 underline underline-offset-4 text-sm"
          >
            {t.auth.signIn.forgotPassword}
          </Link>
        </div>

        {/* Login error inline — แสดงเมื่อ credential ผิด (errors.root จาก setError) */}
        {errors.root && (
          <div className="mb-4">
            <p className="invalid-msg text-sm text-danger">{errors.root.message}</p>
            {/* 🛑 จุดนี้คือโมเมนต์ที่กลุ่มเป้าหมายของโหมด OTP เจอ "แน่นอน 100%" — บัญชีที่สมัคร
                ด้วย OTP ล้วนไม่มีรหัสผ่าน จึงตกมาที่ error นี้เสมอ ถ้าไม่ชี้ทางตรงนี้ ผู้ใช้ต้อง
                เดาเอาเองว่าลิงก์ท้ายฟอร์มคือทางรอด ⇒ ฟีเจอร์ที่สร้างมาเพื่อเขาจะเงียบใส่เขาพอดี
                ไม่ขัดหลักกัน enumeration เพราะเป็นข้อเสนอทั่วไป ไม่ได้ยืนยันว่า username นั้นมีจริง */}
            <button
              type="button"
              onClick={() => switchMode('otp')}
              className="text-primary mt-1 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
            >
              {t.auth.signIn.noPasswordUseOtp}
            </button>
          </div>
        )}

        {/* Submit */}
        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn bg-primary w-full py-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {isSubmitting ? t.auth.signIn.submitting : t.auth.signIn.submit}
          </button>
        </div>

        {/* ทางเข้าด้วยเบอร์โทร — text button ไม่ใช่ปุ่มทึบ เพื่อไม่ให้แข่งกับ CTA หลักของจอ */}
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={() => switchMode('otp')}
            className="text-primary inline-flex min-h-11 items-center justify-center text-sm font-semibold underline underline-offset-4"
          >
            {t.auth.signIn.useOtpInstead}
          </button>
        </div>
      </form>
      )}
    </>
  )
}
