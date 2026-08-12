/**
 * /account — ข้อมูลส่วนตัว + วิธีเข้าสู่ระบบ ของ "ตัวคน" (feature 00026 B)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *   — card + card-header border-dashed section header pattern (เดียวกับที่ /settings ใช้อยู่)
 *
 * เส้นแบ่งที่สำคัญที่สุดของหน้านี้ (user ย้ำเอง 2026-08-02):
 *   "ถ้าผมอยู่ร้าน BT, ธนภัทร ก็ต้องตั้ง Profile account ของตัวเองได้"
 * → resolve จาก session.user.id เท่านั้น ห้ามเรียก requireActiveShop / อ่าน activeShopId
 *   ห้ามแสดงชื่อร้าน โลโก้ร้าน หรือ badge ร้านที่ active — ไม่งั้นหน้านี้จะกลายเป็นฝาแฝดของ /shop
 *   ซึ่งเป็นต้นเหตุที่ผู้ใช้หา "การตั้งค่าของตัวเอง" ไม่เจอตั้งแต่แรก
 *
 * Server component — auth guard อยู่ที่ (dashboard)/layout.tsx แล้ว
 * ส่งเฉพาะ boolean linked status ลง client (ห้าม serialize providerAccountId/accessToken — RSC PII rule)
 */

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import type { Metadata } from 'next'
import { listShopNotificationPrefs } from '@/services/notification-pref.service'
import { ConnectedAccountsClient } from './components/ConnectedAccountsClient'
import ProfileForm from './components/ProfileForm'
import DeleteAccountCard from './components/DeleteAccountCard'
import NotificationPrefsCard from './components/NotificationPrefsCard'

export const metadata: Metadata = { title: 'ข้อมูลส่วนตัว' }

export default async function AccountPage() {
  const session = await getServerSession(authOptions)
  const sessionUser = (session as { user?: { id: string } } | null)?.user
  if (!sessionUser) return null

  const [accounts, dbUser, notificationShops] = await Promise.all([
    // select เฉพาะ provider — กันส่ง providerAccountId/accessToken เข้า RSC flight
    prisma.authAccount.findMany({ where: { userId: sessionUser.id }, select: { provider: true } }),
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { displayName: true, username: true, avatar: true, email: true, phone: true, passwordHash: true },
    }),
    // ร้านทั้งหมดที่ผู้ใช้เข้าถึงได้ + สถานะแจ้งเตือนของแต่ละร้าน — ผูกกับ session.user.id
    // ไม่ใช่ activeShopId (เส้นแบ่งของหน้านี้ ดู comment หัวไฟล์)
    listShopNotificationPrefs(sessionUser.id),
  ])
  if (!dbUser) return null

  const linkedProviders = new Set(accounts.map((a) => a.provider))

  return (
    <>
      {/* breadcrumb เดสก์ท็อปเท่านั้น — บนมือถือ SellerMobileHeader แสดงชื่อหน้าให้อยู่แล้ว
          ปล่อยไว้จะได้คำว่า "ข้อมูลส่วนตัว" ซ้อนกันสามชั้นก่อนเห็นเนื้อหา (บทเรียนเดียวกับ
          shop/page.tsx:74-78 ซึ่งเคยเจอและแก้ไปแล้ว) */}
      <div className="hidden lg:block">
        <PageBreadcrumb title="ข้อมูลส่วนตัว" trail={[{ label: 'บัญชีของฉัน' }]} />
      </div>


      {/* บัญชีที่ login ได้ทางเดียวคือ OAuth และไม่มีทางกู้เลย — ณ 2026-08-02 คือ 5 จาก 10 บัญชีบน prod
          (นับจาก User ที่ phone IS NULL AND passwordHash IS NULL) ถ้าเข้า Facebook/LINE ไม่ได้
          (โดนแบน/ลืมรหัส/เปลี่ยนเบอร์ที่ผูกไว้) = เสีย trust score กับประวัติออเดอร์ทั้งหมดถาวร
          เลือกเตือน ไม่บังคับ (user ตัดสิน 2026-08-02): การบังคับเพิ่มเบอร์ตอน login OAuth ครั้งแรก
          จะไปเพิ่มแรงเสียดทานให้ผู้ถูกเชิญ ซึ่งเป็นกลุ่มเดียวกับที่ feature นี้เพิ่งลดให้
          Base: theme/paces/Admin/TS/src/app/(admin)/ui/alerts/page.tsx:60 (soft alert bg-{semantic}/15) */}
      {!dbUser.phone && dbUser.passwordHash == null && (
        <div className="bg-warning/15 text-warning-ink mb-4 flex max-w-2xl items-start gap-2.5 rounded px-4 py-3" role="alert">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M12 9v4" />
            <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
            <path d="M12 16h.01" />
          </svg>
          <span className="text-sm">
            ตอนนี้คุณเข้าบัญชีนี้ได้ทางเดียว — ถ้าเข้า Facebook หรือ LINE ไม่ได้ จะกู้บัญชีไม่ได้เลย
            และจะเสียคะแนนความน่าเชื่อถือกับประวัติคำสั่งซื้อทั้งหมด เพิ่มเบอร์โทรไว้เป็นทางสำรองได้ที่ด้านล่าง
          </span>
        </div>
      )}

      {/* max-w-2xl ตามสเปกต้นฉบับ — ฟอร์มนี้เป็นคอลัมน์เดียว (4 ฟิลด์ ไม่ใช่ 20 แบบ theme ต้นฉบับ)
          ถ้าปล่อยการ์ดกว้างเต็ม main content จะเหลือคอลัมน์ว่างมหาศาลทางขวาที่จอ 1440px */}
      <div className="max-w-2xl">
        <ProfileForm
        user={{
          displayName: dbUser.displayName,
          username: dbUser.username,
          avatar: dbUser.avatar,
          email: dbUser.email,
          phone: dbUser.phone,
        }}
        />

        <div className="card mt-4">
          <div className="card-header">
            <h5 className="bg-light/15 border-default-300 flex w-full items-center justify-center gap-1.5 rounded border border-dashed p-1.25 text-sm font-medium">
              วิธีเข้าสู่ระบบ
            </h5>
          </div>

          {/* ย้ายมาจาก /settings ทั้งก้อน (user เคาะ Path A 2026-08-02) — เนื้อในผูกกับ user ไม่ผูกร้าน
              อยู่ในกลุ่มเมนู "ร้านค้า" มาตลอดจึงไม่มีใครหาเจอ. component เดิมไม่แก้ ใช้ตามที่มี */}
          <ConnectedAccountsClient
            appleLinked={linkedProviders.has('APPLE')}
            facebookLinked={linkedProviders.has('FACEBOOK')}
            lineLinked={linkedProviders.has('LINE')}
            instagramLinked={linkedProviders.has('INSTAGRAM')}
            hasPassword={dbUser.passwordHash != null}
            hasPhone={dbUser.phone != null}
          />
        </div>

        {/* การแจ้งเตือน — วางก่อน "ลบบัญชี" เสมอ: ลบบัญชีเป็น destructive ต้องอยู่ท้ายสุดของหน้า
            (ถ้าแทรกการ์ดอื่นต่อจากมัน ปุ่มลบจะไปนอนกลางหน้าแล้วโดนกดพลาดง่ายขึ้น)

            แสดงทุก breakpoint ไม่ซ่อนบนเดสก์ท็อป — คนที่เผลอปิดร้านหนึ่งไว้จากมือถือ ต้องเปิดกลับ
            จากคอมได้ ถ้าซ่อนไว้เขาจะหาไม่เจอแล้วสรุปว่าแจ้งเตือนของร้านนั้นพัง */}
        <NotificationPrefsCard shops={notificationShops} />

        {/* ลบบัญชี — ท้ายสุดของหน้าเสมอ (App Store Guideline 5.1.1(v) บังคับให้มีในแอป)
            ทำไมอยู่หน้านี้ ไม่ใช่ /shop: ลบบัญชีคือลบ "ตัวคน" ไม่ใช่ลบร้าน จึงเข้าพวกกับ
            "ข้อมูลส่วนตัว" และ "วิธีเข้าสู่ระบบ" ด้านบน ตรงกับเส้นแบ่งที่หน้านี้ตั้งไว้ (ดู
            comment หัวไฟล์) — เคยวางไว้ที่ /shop ตอนแรกแล้วย้ายมา 2026-08-04 เพราะปนกับ
            ชื่อร้าน/โลโก้ร้าน แล้วอ่านไม่ออกว่าจะลบร้านหรือลบบัญชี

            🛑 ห้ามใส่ lg:hidden: deep-seller-app ตั้ง supportsTablet: true → คนตรวจของ Apple
            เปิดบน iPad ซึ่งกว้างเกิน 1024px ถ้าซ่อนไว้จะหาปุ่มไม่เจอแล้วตีกลับด้วยข้อเดียวกับ
            ที่ฟีเจอร์นี้เกิดมาแก้ */}
        <DeleteAccountCard />
      </div>
    </>
  )
}
