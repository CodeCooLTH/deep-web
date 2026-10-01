/**
 * app-shell — "ตอนนี้หน้านี้ถูกเปิดจากที่ไหน" (เว็บ / ในแอป iOS / ในแอป Android)
 *
 * ไฟล์นี้เป็น **ตรรกะบริสุทธิ์** ไม่แตะ next/headers — ตัวที่อ่าน request จริงอยู่ที่
 * `app-shell-server.ts` แยกกันเพราะไฟล์นั้นมี `server-only` ซึ่งทำให้ import เข้าเทสไม่ได้
 * และเกณฑ์ตรงนี้คือสิ่งที่ต้องมีเทสคุมมากที่สุดของทั้งเรื่อง
 *
 * ที่มา: App Store rejection 2026-08-04 (Guideline 3.1.1) — แอปผู้ขายเปิดหน้าเติมเงินและหน้า
 * สมัครแพ็กเกจได้ ซึ่ง Apple ถือว่าเป็นการขายสินค้าดิจิทัลนอกระบบ In-App Purchase
 *
 * 🛑 ห้ามตัดสินด้วย "เป็นมือถือหรือเปล่า" เด็ดขาด — กฎของ Apple ครอบเฉพาะ "ของที่อยู่ในแอป"
 * ไม่ได้ครอบเว็บไซต์ ถ้าไปเช็คขนาดจอหรือ user-agent ว่าเป็นมือถือ ผู้ขายที่เปิด Safari บนมือถือ
 * (ซึ่ง Apple ไม่มีอำนาจอะไรด้วยเลย) จะเติมเงินไม่ได้ไปด้วย = เสียของโดยไม่จำเป็น
 *
 * ── วิธีตรวจ: สัญญาณ 3 ชั้น ─────────────────────────────────────────────
 *   ชั้นที่ 1  User-Agent มี `DeepSellerApp` → "อยู่ในเปลือกแอป" (ตั้งแต่คำขอแรก)
 *             SellerWebView ตั้งผ่าน `applicationNameForUserAgent` ซึ่งอยู่ในทุกคำขอที่ออกจาก
 *             WebView รวม **คำขอแรกสุดตอนเปิดแอป**
 *   ชั้นที่ 2  cookie `deep_shell=app`  → "อยู่ในเปลือกแอป" (ของเดิม ยังต้องมี)
 *             SellerWebView ตั้งผ่าน injectedJavaScriptBeforeContentLoaded ทุกครั้งที่โหลดหน้า
 *   ชั้นที่ 3  User-Agent มี iPhone/iPad/iPod → "เป็น iOS"
 *             WKWebView ส่งมาเองอัตโนมัติ ไม่ต้องตั้งอะไรเพิ่ม
 *
 * 🛑 **ทำไมต้องมีชั้นที่ 1 ทั้งที่ cookie ทำงานอยู่แล้ว** (แก้ 2026-09-20)
 *
 * cookie ถูกเขียนด้วย **จาวาสคริปต์ในหน้าเว็บ** ⇒ มันเกิดขึ้น *หลัง* เซิร์ฟเวอร์เรนเดอร์หน้าแรกไปแล้ว
 * ⇒ **คำขอแรกสุดหลังติดตั้งแอปใหม่ ไม่มี cookie นี้** เซิร์ฟเวอร์จึงเรนเดอร์หน้าล็อกอินแบบเว็บ
 * ซึ่ง **มีลิงก์ "สมัครสมาชิก" ติดมาด้วย** = สิ่งที่ Apple สั่งให้เอาออกตั้งแต่ 2026-08-23 (3.1.1)
 *
 * เครื่องที่ใช้อยู่ประจำไม่เจอ เพราะ cookie อายุ 30 วันยังค้างอยู่ — **แต่คนตรวจของ Apple
 * ติดตั้งใหม่เสมอ จอแรกที่เขาเห็นคือจอที่มีลิงก์นั้น** (ยืนยันกับ prod 2026-09-20: ยิงคำขอ
 * ที่ไม่มี cookie ได้หน้าที่มีคำว่า "สมัครสมาชิก" · ยิงพร้อม cookie ไม่มี) หัวหน้าเจอเองบน iPad
 * ที่เพิ่งติดตั้ง — ไม่ใช่เรื่องเฉพาะ iPad แต่เป็น **การติดตั้งใหม่ทุกเครื่อง** รวม iPhone
 *
 * 🛑 ห้ามถอด cookie ทิ้งแล้วเหลือแต่ UA — build ที่ปล่อยไปแล้วก่อนรอบนี้ยังไม่มี marker ใน UA
 * (สัญญาณต้องเป็น OR เสมอ ไม่ใช่แทนที่กัน) และ marker จะมาถึงเครื่องผู้ใช้ผ่าน OTA เท่านั้น
 *
 * 🛑 ทำไมต้องใช้ของที่ "มีอยู่แล้วทั้งคู่" ไม่ออกแบบสัญญาณใหม่ให้ชัดกว่านี้: binary ที่ Apple
 * กำลังรีวิวอยู่ (1.0 build 2) ตั้ง cookie เป็นค่า `app` เฉย ๆ ไม่มีข้อมูลแพลตฟอร์ม ถ้าเราออกแบบ
 * ให้ต้องรอ cookie เวอร์ชันใหม่ คนตรวจของ Apple จะยังเห็นปุ่มจ่ายเงินอยู่แล้วตีกลับซ้ำ —
 * การแก้ต้องมีผลกับ build ที่ปล่อยไปแล้ว "ทันที" โดยไม่พึ่งการอัปเดตแอป
 *
 * ── ทำไมไม่กลัว cookie รั่วไปเบราว์เซอร์ ────────────────────────────────
 * WKWebView ของแอปใช้ cookie store คนละใบกับ Safari (sharedCookiesEnabled แชร์กับ
 * NSHTTPCookieStorage ซึ่งเป็นของแอปเอง ไม่ใช่ของ Safari) คนที่เคยเปิดแอปแล้วไปเปิดเว็บใน
 * Safari จึงไม่มี cookie นี้ติดไป
 */

export type AppShell = 'web' | 'ios' | 'android'

/** ค่าที่ SellerWebView ตั้งไว้ (ทั้งเวอร์ชันเก่าและใหม่) — ดู SHELL_COOKIE ใน deep-seller-app */
export const SHELL_COOKIE_NAME = 'deep_shell'
const SHELL_COOKIE_VALUE = 'app'

/**
 * 🛑 แพลตฟอร์มที่ "ห้ามมีช่องทางจ่ายเงินในแอป"
 *
 * iOS (Guideline 3.1.1 · รอบ 2026-08-04) + **Android** (Google Play Payments policy — เพิ่มเมื่อ
 * 2026-10-01 ตอนเตรียมขึ้น Google Play) · กฎของ Google: *"apps may not lead users to a payment
 * method other than Google Play's billing system … via in-app webviews, buttons, links, messaging"*
 */
const PAYMENT_RESTRICTED_SHELLS: readonly AppShell[] = ['ios', 'android']

/**
 * 🛑 แพลตฟอร์มที่ "มีการซื้อในแอป (IAP) ให้ใช้" — ตอนนี้ **iOS เท่านั้น**
 *
 * ── ทำไมเป็นตัวที่สี่ แยกจาก `isPaymentRestricted` ─────────────────────────────
 *
 * บน iOS "ห้ามจ่ายเงินนอกสโตร์" มาพร้อม "แต่ซื้อผ่าน Apple ได้" (feature 00064) ⇒ หลายจุดเขียน
 * ว่า *ถูกห้าม ⇒ พาไปหน้าซื้อผ่าน StoreKit* (`/business/subscribe`) และ skill `app-store-surfaces`
 * บังคับให้มีทางเข้าหน้าซื้อ **พอดี 1 ทาง** บนมือถือ ไม่งั้น Apple สรุปว่าไม่ได้ทำ IAP
 *
 * Android **ไม่มี IAP เลย** (user สั่ง 2026-10-01: ไม่ทำ Play Billing ปิดการจ่ายเงินทั้งหมด) ⇒ ถ้าใช้
 * กฎเดิม ผู้ขาย Android จะถูกพาไปหน้าซื้อที่คุยกับ StoreKit ซึ่งไม่มีอยู่ → รอราคา 60 วิแล้วขึ้น
 * "แอปไม่ตอบสนอง" = หน้าซื้อที่ตาย และยังมีคำว่าแพ็กเกจ/ราคา/Apple ID โผล่ให้คนตรวจของ Google เห็น
 *
 * ⇒ ทุกจุดที่ตัดสินว่า "จะมีทางเข้าหน้าซื้อในแอปไหม" ต้องถามตัวนี้ ไม่ใช่ `isPaymentRestricted`
 * (ตัวนั้นตอบแค่ "ห้ามช่องทางนอกสโตร์ไหม") · วันที่ทำ Play Billing ค่อยเพิ่ม 'android' ที่นี่
 */
const IAP_SHELLS: readonly AppShell[] = ['ios']

export function hasInAppPurchase(shell: AppShell): boolean {
  return IAP_SHELLS.includes(shell)
}

/**
 * ชื่อที่แอปผู้ขายต่อท้าย User-Agent ของ WebView (`applicationNameForUserAgent`)
 *
 * 🛑 ค่านี้เป็น **สัญญาข้ามรีโป** — ต้องตรงกับ `APP_UA_MARKER` ใน deep-seller-app
 * (`src/features/webview/SellerWebView.tsx`) ตัวอักษรต่อตัวอักษร แก้ที่เดียวไม่พอ
 * ทั้งสองฝั่งมีเทสที่ปักค่านี้ไว้ ถ้าใครเปลี่ยนข้างเดียวจะแดงทันที
 *
 * ไม่ใส่เลขเวอร์ชันในตัวที่เทียบ — แอปส่ง `DeepSellerApp/1.0` แต่เราเทียบแค่ชื่อ
 * เพื่อให้เวอร์ชันถัดไปไม่ต้องมาแก้ฝั่งเว็บ
 */
export const APP_UA_MARKER = 'DeepSellerApp'

/**
 * UA นี้มาจากเปลือกแอปของเราไหม
 *
 * เทียบแบบตรงตัวพิมพ์ (case-sensitive) — marker เป็นสตริงที่เราเป็นคนตั้งเองทั้งสองฝั่ง
 * การยอมรับตัวพิมพ์เล็ก/ใหญ่ปนกันแปลว่ายอมรับค่าที่เราไม่เคยส่ง ซึ่งไม่ช่วยอะไรนอกจาก
 * เปิดช่องให้ UA ของคนอื่นบังเอิญชนแล้วซ่อนปุ่มจ่ายเงินให้ผู้ขายที่ใช้เว็บปกติ
 */
function hasAppUserAgentMarker(userAgent: string): boolean {
  return userAgent.includes(APP_UA_MARKER)
}

/** UA ของ WKWebView บน iPhone/iPad — iPadOS รุ่นใหม่อาจอ้างตัวเป็น Macintosh (ดู fallback) */
function detectPlatform(userAgent: string): 'ios' | 'android' {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  /**
   * อยู่ในแอปแน่นอน (มี cookie) แต่อ่าน UA ไม่ออก — เช่น iPadOS ที่ตั้ง "Request Desktop Website"
   *
   * 🛑 fail-closed เป็น ios: เดาผิดทางนี้เสียแค่ "ผู้ขายบางคนต้องไปเติมเงินที่เว็บ" แต่เดาผิด
   * อีกทาง = โชว์ปุ่มจ่ายเงินให้คนตรวจของ Apple เห็น แล้วโดนตีกลับทั้งรอบ ต้นทุนคนละเรื่องกัน
   */
  return 'ios'
}

/**
 * ตรรกะการตัดสินล้วน ๆ — เกณฑ์นี้เป็นตัวชี้ขาดว่าผู้ขายคนไหนจะเติมเงินได้/ไม่ได้
 * ต้องมีเทสยืนยันทุกช่อง ไม่ใช่เชื่อว่าเขียนถูก
 */
export function resolveAppShell(shellCookie: string | undefined, userAgent: string): AppShell {
  const inApp = shellCookie === SHELL_COOKIE_VALUE || hasAppUserAgentMarker(userAgent)
  if (!inApp) return 'web'
  return detectPlatform(userAgent)
}

/**
 * shell นี้ต้องซ่อนทุกอย่างที่เกี่ยวกับการจ่ายเงินไหม (Guideline 3.1.1)
 *
 * "ทุกอย่างที่เกี่ยวกับการจ่ายเงิน" = ช่องทางจ่าย + คำเชิญให้ไปจ่าย นั่นคือ ปุ่มเติมเงิน
 * ปุ่มสมัคร/อัปเกรด ราคา ชื่อแพ็กเกจที่มีราคาติด และ **ลิงก์ไปหน้าเหล่านั้นทุกชนิด รวมลิงก์ไป
 * เว็บของเราเอง** — Apple ถือว่าการบอกทางไปจ่ายเงินข้างนอกเป็นความผิดข้อเดียวกัน
 *
 * ✅ สิ่งที่ยัง "แสดงได้" และตั้งใจให้แสดง (user เคาะ 2026-08-10): **ยอดเครดิตคงเหลือ** และ
 * ประวัติการใช้เครดิต — เป็น "สถานะบัญชี" ไม่ใช่ช่องทางจ่ายและไม่ใช่คำเชิญ (แพตเทิร์นเดียวกับ
 * reader app ที่แสดงสถานะสมาชิกโดยซื้อในแอปไม่ได้) และจำเป็นจริง เพราะเครดิตก้อนเดียวกันนี้
 * ใช้จ่ายค่าส่ง SMS ด้วย ถ้าไม่โชว์เลย ผู้ขายจะส่ง SMS ไม่ผ่านโดยไม่รู้สาเหตุ
 */
export function isPaymentRestricted(shell: AppShell): boolean {
  return PAYMENT_RESTRICTED_SHELLS.includes(shell)
}

/**
 * shell นี้ต้องซ่อน **การสมัครบัญชี** ไหม (Guideline 3.1.1 — รอบ 2026-08-23)
 *
 * ที่มา: Apple ตีกลับเพิ่มอีกข้อ *"The app includes an account registration feature for
 * businesses and organizations, which is considered access to external mechanisms for
 * purchases or subscriptions to be used in the app. Next Steps: **Remove the account
 * registration features for business and organizations**"*
 *
 * ⇒ ฟอร์ม "สร้างบัญชีผู้ขาย" (มีช่อง *หมวดหมู่ร้านค้า* = สมัครในนามกิจการ) ห้ามอยู่ในแอป
 * เหลือได้แค่ **ล็อกอิน** สำหรับคนที่มีบัญชีอยู่แล้ว
 *
 * ── 🛑 ทำไมเป็นฟังก์ชันแยก ไม่ใช้ `isPaymentRestricted` ตัวเดิม ──────────────────
 *
 * ตอนนี้สองอันคืนค่าเท่ากันทุกกรณี (`ios` ทั้งคู่) แต่มันตอบ **คนละคำถาม** และ Apple ยกมาเป็น
 * คนละข้อในจดหมายคนละรอบ ⇒ วันที่ข้อใดข้อหนึ่งถูกผ่อน (เช่นถ้าเราไปทาง IAP แล้วปุ่มจ่ายเงิน
 * กลับมาได้ แต่การสมัครยังต้องห้าม) คนแก้จะเห็นทันทีว่าต้องแก้ตัวไหน
 *
 * ถ้ายุบเป็นตัวเดียว วันนั้นจะมีคนแก้ `isPaymentRestricted` แล้วการสมัครกลับมาโผล่ในแอปด้วย
 * **โดยไม่มีใครตั้งใจและไม่มีอะไรฟ้อง** — กฎสองข้อที่บังเอิญมีคำตอบเท่ากันวันนี้ ไม่ใช่กฎเดียวกัน
 * (`docs/conventions/domain-term-single-definition.md` — ทิศกลับของ HR16: ของคนละอย่าง
 * ที่ค่าเท่ากันชั่วคราว ห้ามยุบรวม)
 */
const SIGNUP_RESTRICTED_SHELLS: readonly AppShell[] = ['ios']

export function isSignUpRestricted(shell: AppShell): boolean {
  return SIGNUP_RESTRICTED_SHELLS.includes(shell)
}

/**
 * ปุ่ม OAuth ในแอป: คำขอนี้ต้องถูกปฏิเสธ **ก่อนสร้างบัญชี** ไหม
 *
 * ## ทำไมต้องมีตัวนี้ ทั้งที่มีด่านใน `proxy.ts` อยู่แล้ว
 *
 * ด่านใน proxy ทำงาน **หลัง** บัญชีถูกสร้างไปแล้ว — มันเตะออกและล้าง session ได้
 * แต่ **แถวที่สร้างไปแล้วยังอยู่** ⇒ ผู้ใช้ได้บัญชีกำพร้าที่ไม่มีเบอร์/ไม่มีรหัสผ่าน
 * แล้ว **Facebook/LINE id นั้นใช้กับ Deep ไม่ได้อีกเลย** เพราะ `AuthAccount` ผูก id นั้น
 * ไว้กับบัญชีที่เจ้าตัวเข้าไม่ถึง และถอดการเชื่อมต้องยืนยันด้วย OTP ทางเบอร์ซึ่งไม่มี
 * (ทางตันของภาคผนวก 6 · **เกิดจริงบน prod แล้ว 12 ราย** นับเมื่อ 2026-09-28)
 *
 * Apple ไม่เป็นแบบนี้เพราะทางเข้าของมันเป็น API ของเราเอง (`/api/login/apple-native`)
 * ซึ่งปฏิเสธตั้งแต่ก่อนสร้าง ⇒ ตัวนี้คือการทำให้ **เจ้าอื่นเท่ากับ Apple**
 *
 * 🛑 **ไม่ใช่ตัวแทนด่านใน proxy** — ด่านนั้นยังต้องอยู่ เพราะมันจับเคสที่ตัวนี้จับไม่ได้:
 * คนที่ **มีบัญชีอยู่แล้ว** (ผูก provider ไว้แล้ว) แต่ยังไม่มีเบอร์ หรือยังตั้งค่าร้านไม่เสร็จ
 *
 * @param alreadyLinked มี `AuthAccount` ของ (provider, id) นี้อยู่แล้วไหม —
 *   มีแล้ว = **ล็อกอินของคนเดิม ไม่ใช่การสมัคร** ⇒ ต้องปล่อยผ่านเสมอ
 */
export function shouldBlockOAuthSignup(
  shell: AppShell,
  alreadyLinked: boolean,
  callbackUrl: string | null,
): boolean {
  if (alreadyLinked) return false
  if (isInviteAcceptance(callbackUrl)) return false
  return isSignUpRestricted(shell)
}

/**
 * ปลายทางหลังล็อกอินคือ **หน้ารับคำเชิญ** `/i/{slug}` ไหม
 *
 * 🛑 **ต้องยกเว้นทางนี้ ไม่งั้นด่านจะปิดทางเข้าที่ตั้งใจให้มี**
 *
 * เอกสาร `FIXED-LOG-app-login-and-iap.md` ระบุไว้เองว่าในแอปเหลือ **2 ทางเข้า**:
 * *"ล็อกอินของคนที่มีร้านแล้ว"* กับ ***"เข้าร่วมร้านผ่านลิงก์เชิญ"*** — ทางที่สองต้องสร้าง
 * บัญชีให้คนใหม่เสมอ เพราะผู้ถูกเชิญยังไม่มีบัญชี Deep
 *
 * และมันไม่ใช่ "การลงทะเบียนธุรกิจ" ตามภาษาของ Apple: `PhoneAuthSteps` ในหน้านั้นเขียน
 * ไว้เองว่า **สมัครสั้น ไม่สร้างร้าน** ⇒ ผู้ถูกเชิญได้บัญชีเปล่าที่ไม่มีร้านเลย แล้วไป
 * *เข้าร่วม* ร้านของคนอื่น ⇒ `activeShopId` เป็น null ⇒ ธง gate ทั้งสองตัวเป็น false
 * (ยืนยันกับ `resolveDefaultActiveShopId` + `resolveOnboardingGate`)
 *
 * 🛑 **เรื่องนี้เกือบหลุด** — ด่านรุ่นแรก (PR #82) ไม่มีข้อยกเว้นนี้ ⇒ ผู้ถูกเชิญกด
 * Facebook/LINE ในแอปแล้วถูกปฏิเสธทั้งที่ทางนั้นถูกต้อง · จับได้ตอนไล่ทั้งระบบ
 * และข้อมูลจริงยืนยัน: บัญชีที่ถูกมองว่า "กำพร้า" 6 ใน 14 ราย **เป็นสมาชิกร้านที่ทำงานอยู่จริง**
 * (รายหนึ่งส่งข้อความไป 1,513 ใบ) ⇒ พวกเขาเข้ามาทางนี้ทั้งนั้น
 *
 * ⚠️ **ข้อแลกที่รู้ตัว**: ใครตั้ง `callbackUrl=/i/x` เองก็สมัครในแอปได้ — แต่ต้องจงใจ
 * ประกอบ URL เอง ไม่ใช่เส้นทางที่มีปุ่มพาไป และไม่ได้สิทธิ์อะไรเพิ่ม (ยังต้องมีคำเชิญจริง
 * ถึงจะเข้าร้านได้) ⇒ รับความเสี่ยงนี้เพื่อไม่ให้ทางเข้าที่ตั้งใจให้มีถูกปิด
 */
function isInviteAcceptance(callbackUrl: string | null): boolean {
  if (!callbackUrl) return false
  let path: string
  try {
    /* รับทั้ง path เปล่า (`/i/abc`) และ URL เต็ม — next-auth เก็บได้ทั้งสองแบบ */
    path = callbackUrl.startsWith('/') ? callbackUrl : new URL(callbackUrl).pathname
  } catch {
    return false
  }
  const [, first, slug] = path.split('?')[0].split('#')[0].split('/')
  /* ต้องมี slug จริง — `/i` เปล่า ๆ ไม่ใช่คำเชิญของใคร */
  return first === 'i' && Boolean(slug)
}

/**
 * shell นี้ต้องซ่อน **ฟีเจอร์ที่ปลดล็อกด้วยแพ็กเกจซึ่งไม่มีขายเป็น IAP ในแอป** ไหม
 * (Guideline 3.1.3(b) — feature 00064)
 *
 * ที่มา: รอบ 2026-08-23 Apple สั่งให้เลือกทางเดียวระหว่าง "ขายเฉพาะองค์กร" กับ "ใส่ IAP"
 * user เคาะทาง IAP (2026-09-01) แต่ **ขายเฉพาะ Business Package** ส่วน Deep Stock ไม่ขาย
 * เพราะสิทธิ์ของมันเป็น "ต่อร้าน" ขณะที่ Apple ขาย auto-renewable ได้ใบเดียวต่อ Apple ID
 *
 * ⇒ เมื่อไม่ขาย Deep Stock เป็น IAP ก็ **เปิดให้ใช้ในแอปไม่ได้ด้วย** เพราะ 3.1.3(b) ยอมให้
 * ใช้ของที่ซื้อจากที่อื่นได้ *ก็ต่อเมื่อของชิ้นนั้นมีขายเป็น IAP ในแอปด้วย*
 *
 * ── 🛑 ทำไมเป็นฟังก์ชันที่สาม ไม่ใช้ `isPaymentRestricted` ────────────────────────
 *
 * ตอนนี้ทั้งสามตัวคืนค่าเท่ากัน (`ios`) แต่ตอบคนละคำถาม และมาจากจดหมายคนละรอบ:
 *
 *   isPaymentRestricted     "ห้ามมีช่องทางจ่ายเงินในแอปไหม"        (3.1.1 · รอบ 08-04)
 *   isSignUpRestricted      "ห้ามให้สมัครบัญชีธุรกิจในแอปไหม"       (3.1.1 · รอบ 08-23)
 *   isPaidFeatureRestricted "ห้ามให้ใช้ฟีเจอร์ที่จ่ายเงินมาแล้วไหม"  (3.1.3(b) · รอบ 09-01)
 *
 * วันที่เราขาย Deep Stock เป็น IAP ได้ ตัวที่สามจะถูกผ่อนก่อนเพื่อน — ถ้ายุบรวมกันไว้
 * คนแก้จะผ่อนทีเดียวแล้วปุ่มจ่ายเงินกับการสมัครกลับมาโผล่ด้วย **โดยไม่มีใครตั้งใจ**
 * (docs/conventions/domain-term-single-definition.md — ของคนละอย่างที่ค่าเท่ากันชั่วคราว ห้ามยุบ)
 */
const PAID_FEATURE_RESTRICTED_SHELLS: readonly AppShell[] = ['ios']

export function isPaidFeatureRestricted(shell: AppShell): boolean {
  return PAID_FEATURE_RESTRICTED_SHELLS.includes(shell)
}

/**
 * request นี้กำลังจะกลายเป็น "การสมัครบัญชีในแอป" หรือเปล่า (Guideline 3.1.1 — รอบ 2026-08-23)
 *
 * ## รูที่ฟังก์ชันนี้ปิด
 *
 * `isSignUpRestricted` ปิดทางสมัครที่ผู้ใช้ **เลือกเดินเอง** (ลิงก์สมัคร ปุ่มเปิดร้าน) ครบแล้ว
 * แต่ยังมีทางที่ผู้ใช้ไม่ได้ตั้งใจเดิน: **ปุ่ม OAuth บนหน้าล็อกอิน** — Apple ID ที่ไม่เคยผูก
 * ไม่ได้ถูกปฏิเสธ มันสร้างบัญชีใหม่ให้เลย แล้ว `proxy.ts` บังคับเจ้าของบัญชีนั้นไป
 * `/register` → `/onboarding` ซึ่งคือ **ฟอร์มสมัคร** ที่ Apple สั่งให้เอาออกพอดี
 *
 * (ทีมรีวิวของ Apple ไม่มีบัญชี Deep ⇒ นี่คือเส้นทางเดียวที่เขาจะเดิน และเขาไปต่อไม่ได้
 * เพราะยืนยันเบอร์ไทยด้วย SMS ไม่ได้ ⇒ ได้ทั้ง 3.1.1 และ 2.1(a) ในการกดครั้งเดียว)
 *
 * ## ทำไมบล็อกทั้งสองเฟส
 *
 * เฟส 1 (`needsRegistration` — ยังไม่มีเบอร์) เป็นการสมัครชัดเจนอยู่แล้ว
 * เฟส 2 (`needsOnboarding` — มีเบอร์แล้วแต่ยังไม่มีร้าน) คือ **การเปิดร้านแรก** ซึ่งก็คือ
 * "การลงทะเบียนธุรกิจ" ตามภาษาของ Apple เหมือนกัน ⇒ ปิดทั้งคู่ ไม่เลือกปิดครึ่งเดียว
 *
 * 🛑 ผู้ขายที่ลงทะเบียนครบแล้วต้องไม่ถูกแตะเลย — ฟังก์ชันนี้ตอบ true เฉพาะคนที่ยัง "ค้าง
 * ระหว่างสมัคร" เท่านั้น ไม่ใช่ทุกคนในแอป
 */
export function shouldBlockAppRegistration(
  shell: AppShell,
  gate: { needsRegistration?: boolean; needsOnboarding?: boolean } | null | undefined,
): boolean {
  if (!isSignUpRestricted(shell)) return false
  return Boolean(gate?.needsRegistration || gate?.needsOnboarding)
}
