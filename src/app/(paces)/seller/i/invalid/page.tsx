/**
 * /i/invalid — หน้าแสดงเมื่อลิงก์เชิญพนักงานใช้งานไม่ได้ (feature 00012, Task 4.2)
 *
 * Base: shell = theme/paces/Admin/TS/src/app/auth/card/sign-in/page.tsx (ผ่าน AuthCardShell)
 *   การ์ด-โครง = theme/paces/Admin/TS/src/app/(admin)/pages/pricing/page.tsx
 *     (chase ผ่าน in-app precedent src/app/(paces)/seller/(dashboard)/business/create/page.tsx:96-120 GateCard —
 *      ปรับสีวงกลม icon เป็น neutral bg-default-100/text-default-500 ตาม UX spec แทน warning เดิม)
 * UX spec: docs/superpowers/specs/2026-07-04-shop-staff-invite-link-ux-spec.md (Screen 2)
 *
 * static (ไม่ query DB) — ทุกเหตุผล invalid (NOT_FOUND/EXPIRED/REVOKED) มาลงหน้าเดียวกันหมด ไม่แยกข้อความ
 * (design ตั้งใจไม่ leak เหตุผลให้ user เดา slug/สถานะ)
 */

import Link from 'next/link'
import type { Metadata } from 'next'
import Icon from '@/components/wrappers/Icon'
import AuthCardShell from '@/app/(paces)/seller/auth/components/AuthCardShell'

export const metadata: Metadata = { title: 'ลิงก์เชิญใช้งานไม่ได้' }

export default function InviteInvalidPage() {
  return (
    <AuthCardShell>
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-default-100 text-default-500">
            <Icon icon="link-off" className="size-7" aria-hidden="true" />
          </div>
        </div>
        <h3 className="mb-1.25 text-xl font-bold text-default-900">ลิงก์เชิญนี้ใช้งานไม่ได้แล้ว</h3>
        <p className="text-default-400">
          ลิงก์อาจหมดอายุ ถูกยกเลิก หรือไม่ถูกต้อง กรุณาติดต่อเจ้าของร้านเพื่อขอลิงก์ใหม่
        </p>

        <div className="mt-6">
          <Link
            href="/"
            className="btn bg-primary text-white hover:bg-primary-hover inline-flex w-full items-center justify-center gap-1.5"
          >
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </AuthCardShell>
  )
}
