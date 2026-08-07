'use client'

/**
 * PreviewPanel — คอลัมน์ขวา "พรีวิว" ของตัวจัดหน้าร้าน (feature 00035, Task 7)
 *
 * ไม่ใช่ iframe ตัวที่สอง — re-representation แบบ Paces-native จาก draft state ตรง ๆ (SDS TD-009:
 * ไม่ต้อง pixel-perfect กับ Vuexy ไม่ reuse component จาก views/pages/user-profile/** ตรง ๆ)
 * [สำคัญ] เวอร์ชันนี้เป็น "โครง" ที่ครบตาม prop contract แต่ยังเรียบง่าย — Task 9 ปรับแต่งภาพต่อ
 *
 * Base: docs/superpowers/specs/2026-08-07-00034-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" คอลัมน์ "พรีวิว" (การ์ดขวา, gradient header แบบเดียวกับ
 *   หัวโปรไฟล์จริง, tab strip, block preview grid) — คัดลอกโครง markup มา ผูกกับ props จริงแทน hardcode
 */
import Icon from '@/components/wrappers/Icon'

import { PROFILE_TAB_LABEL_TH, type PreviewPanelProps } from '../types'

export default function PreviewPanel({ header, draft }: PreviewPanelProps) {
  return (
    <div className="card flex min-h-0 w-[30%] flex-col"> {/* HR7 carve-out: 30/40/30 ล็อกไว้ตาม SDS §3/mockup — Paces ไม่มี token สัดส่วนคอลัมน์นี้ */}
      <div className="card-header flex items-center py-3">
        <h4 className="card-title flex-1 text-sm">พรีวิว</h4>
        <span className="badge bg-primary text-2xs text-white">พรีวิว</span>
      </div>
      <div className="bg-default-100 flex min-h-0 flex-1 justify-center overflow-auto p-4">
        <div className="h-fit w-full overflow-hidden rounded-xl bg-white shadow">
          {/* header — gradient เดียวกับหัวโปรไฟล์จริง (primary → info) ไม่ hardcode hex */}
          <div className="h-16" style={{ background: 'linear-gradient(120deg, var(--color-primary), var(--color-info))' }} />
          <div className="border-default-200 border-b px-3 pb-3">
            <div className="border-default-200 mx-auto -mt-7 flex size-14 items-center justify-center overflow-hidden rounded-xl border-4 border-white bg-white shadow">
              {header.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- โลโก้ร้านจาก storage ภายนอก ไม่ผ่าน next/image config
                <img src={header.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <Icon icon="building-store" className="text-default-400 text-2xl" aria-hidden="true" />
              )}
            </div>
            <div className="text-default-900 mt-1.5 flex items-center justify-center gap-1 text-sm font-bold">
              {header.shopName}
              {header.isVerified && <Icon icon="rosette-discount-check" className="text-success text-base" aria-hidden="true" />}
            </div>
            <div className="text-default-400 text-2xs text-center">@{header.username}</div>
            <div className="mt-2 flex justify-center gap-4">
              <div className="text-center">
                <b className="text-default-900 block text-sm">{header.completedOrders ?? '—'}</b>
                <span className="text-default-400 text-2xs">ออเดอร์</span>
              </div>
              <div className="text-center">
                <b className="text-default-900 block text-sm">{header.completionRate != null ? `${header.completionRate}%` : '—'}</b>
                <span className="text-default-400 text-2xs">สำเร็จ</span>
              </div>
              <div className="text-center">
                <b className="text-default-900 block text-sm">{header.avgRating ?? '—'}</b>
                <span className="text-default-400 text-2xs">รีวิว</span>
              </div>
            </div>
          </div>

          {/* แถบแท็บ — ตามลำดับ draft.tabOrder จริง */}
          <div className="border-default-200 flex gap-1 overflow-auto border-b px-2.5 py-2">
            {draft.tabOrder.map((key, i) => (
              <span
                key={key}
                className={
                  i === 0
                    ? 'badge bg-primary text-2xs rounded-full text-white'
                    : 'badge bg-default-100 text-default-600 text-2xs rounded-full'
                }
              >
                {PROFILE_TAB_LABEL_TH[key]}
              </span>
            ))}
          </div>

          {/* บล็อกเหนือแถบแท็บ — ตามลำดับ draft.blocks จริง */}
          {draft.blocks.length === 0 ? (
            <p className="text-default-400 text-2xs p-3 text-center">ยังไม่มีบล็อกเหนือแถบแท็บ</p>
          ) : (
            draft.blocks.map((block) => (
              <div key={block.key} className="border-default-200 border-b p-3">
                {block.type === 'BADGE_HIGHLIGHT' ? (
                  <>
                    <div className="text-default-900 mb-2 text-xs font-semibold">เหรียญตราของร้าน</div>
                    <div className="flex flex-wrap gap-1.5">
                      {block.badges.map((b) => (
                        <span
                          key={b.id}
                          className="bg-default-100 text-default-600 text-2xs flex items-center gap-1 rounded-full py-0.5 pe-2 ps-0.5"
                        >
                          <span className="bg-primary flex size-4.5 items-center justify-center rounded-full text-white"> {/* HR7 carve-out: ขนาด badge icon ตามที่ mockup กำหนด (4.5 = ระหว่าง size token 4/5) */}
                            <Icon icon="award" className="text-2xs" aria-hidden="true" />
                          </span>
                          {b.name}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-default-900 mb-2 text-xs font-semibold">จากเพจของเรา</div>
                    <div className="flex gap-2">
                      {block.post.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- รูปโพสต์จาก storage/Meta CDN ภายนอก ไม่ผ่าน next/image config
                        <img src={block.post.imageUrl} alt="" className="bg-default-200 aspect-square w-16 shrink-0 rounded-md object-cover" />
                      ) : (
                        <div className="bg-default-200 text-default-400 flex aspect-square w-16 shrink-0 items-center justify-center rounded-md">
                          <Icon icon="photo" className="text-lg" aria-hidden="true" />
                        </div>
                      )}
                      <p className="text-default-700 line-clamp-3 text-xs">{block.post.message ?? '(ไม่มีข้อความ)'}</p>
                    </div>
                  </>
                )}
              </div>
            ))
          )}

          <p className="text-default-400 text-2xs p-3 text-center">
            แสดงการจัดเรียงล่าสุดของคุณ
            <br />
            ลิงก์ที่แชร์จะยังเป็นเวอร์ชันที่บันทึกแล้ว
          </p>
        </div>
      </div>
    </div>
  )
}
