'use client'

/**
 * LibraryPanel — คอลัมน์ซ้าย "คลัง" ของตัวจัดหน้าร้าน (feature 00035, Task 7)
 *
 * [สำคัญ] เวอร์ชันนี้เป็น "โครง" ที่ implement ครบตาม prop contract (types.ts) และใช้งานได้จริง
 * (ค้นหา/เพิ่มบล็อก/สลับลำดับแท็บด้วยปุ่มลูกศร) แต่ตัด drag-and-drop สำหรับสลับลำดับแท็บออก —
 * Task 8 จะเติม drag interaction (mockup มีปุ่ม cursor-grab ประกอบ) ปุ่มลูกศรที่มีอยู่แล้วคือ
 * keyboard-accessible alternative ที่ SRS §6 NFR Accessibility บังคับไว้อยู่แล้ว จึงไม่ใช่ทางตัน
 *
 * Base: docs/superpowers/specs/2026-08-07-00034-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" คอลัมน์ "คลัง" (การ์ดกว้าง 30% ของแถว, input-group ค้นหา,
 *   3 กลุ่ม: "เพิ่มเหนือแถบแท็บได้" / "แท็บของหน้าร้าน" / "ตรึงตายตัว") — คัดลอก markup โครงสร้าง
 *   มาเกือบทั้งหมด ปรับเป็น map จากข้อมูลจริงแทน hardcode
 */
import { useMemo, useState } from 'react'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

import { moveArrayItem } from '../lib/draft'
import { PROFILE_TAB_ICON, PROFILE_TAB_LABEL_TH, type LibraryPanelProps } from '../types'

const MAX_BADGES = 4

export default function LibraryPanel({
  initialLibrary,
  visibleTabKeys,
  draft,
  onAddBadgeBlock,
  onAddFacebookPostBlock,
  onReorderTabs,
  mirrorFacebookPost,
}: LibraryPanelProps) {
  const [q, setQ] = useState('')
  const [addingPostId, setAddingPostId] = useState<string | null>(null)

  // ค้นหาฝั่ง client บนหน้าแรกที่ SSR มาให้ก่อน (Task 8 ค่อยต่อ GET .../library ?q=&cursor= สำหรับ
  // ผลลัพธ์ที่เกินหน้าแรก — endpoint รองรับอยู่แล้ว API.md §4.1)
  const filteredPosts = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return initialLibrary.facebookPosts
    return initialLibrary.facebookPosts.filter((p) => (p.message ?? '').toLowerCase().includes(needle))
  }, [initialLibrary.facebookPosts, q])

  const badgeBlock = draft.blocks.find((b) => b.type === 'BADGE_HIGHLIGHT')
  const addedFacebookPostIds = new Set(
    draft.blocks.filter((b) => b.type === 'FACEBOOK_POST').map((b) => b.post.id),
  )

  const handleAddBadges = () => {
    // Task 7 placeholder: หยิบเหรียญ ACHIEVEMENT ล่าสุดสูงสุด 4 ใบอัตโนมัติ — Task 8 แทนที่ด้วย
    // ตัวเลือกให้ผู้ขายเลือกเองเป็นรายใบ (modal/checklist) ตาม mockup group 1 แถวเหรียญตราเด่น
    if (initialLibrary.badges.length === 0) {
      pacesToast.info('ร้านนี้ยังไม่มีเหรียญตรา (ACHIEVEMENT) ให้เลือก')
      return
    }
    onAddBadgeBlock(
      initialLibrary.badges.slice(0, MAX_BADGES).map((b) => ({
        id: b.id,
        badgeId: b.badgeId,
        name: b.name,
        nameEN: b.nameEN,
        icon: b.icon,
        imageUrl: null,
      })),
    )
  }

  const handleAddPost = async (postId: string) => {
    const post = initialLibrary.facebookPosts.find((p) => p.id === postId)
    if (!post || addingPostId) return
    setAddingPostId(postId)
    try {
      const result = await mirrorFacebookPost(postId)
      onAddFacebookPostBlock({
        id: post.id,
        message: post.message,
        imageUrl: result.imageUrl,
        mediaType: post.mediaType,
        reactionCount: post.reactionCount,
        fbCommentCount: post.fbCommentCount,
        shareCount: post.shareCount,
        permalink: post.permalink,
      })
    } finally {
      setAddingPostId(null)
    }
  }

  const handleMoveTab = (index: number, direction: -1 | 1) => {
    onReorderTabs(moveArrayItem(draft.tabOrder, index, direction))
  }

  return (
    <div className="card flex min-h-0 w-[30%] flex-col"> {/* HR7 carve-out: 30/40/30 ล็อกไว้ตาม SDS §3/mockup — Paces ไม่มี token สัดส่วนคอลัมน์นี้ */}
      <div className="card-header py-3">
        <h4 className="card-title text-sm">คลัง</h4>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <div className="input-group mb-3.5">
          <span className="input-group-text">
            <Icon icon="search" className="text-base" aria-hidden="true" />
          </span>
          <input
            className="form-input text-sm"
            placeholder="ค้นหาเนื้อหาหรือเหรียญตรา"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* กลุ่ม 1: เพิ่มเหนือแถบแท็บได้ (= ShopPageBlock) */}
        <div className="text-default-600 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="plus" className="text-sm" aria-hidden="true" />
          เพิ่มเหนือแถบแท็บได้
        </div>
        <p className="text-default-400 text-2xs mb-2">แตะปุ่มบวกเพื่อเพิ่ม แล้วลากจัดลำดับในพื้นที่ตรงกลาง</p>

        <div className="border-default-300 mb-2 flex items-center gap-2.5 rounded-lg border bg-white p-2.5">
          <span className="bg-default-100 text-default-500 flex size-8 items-center justify-center rounded-md">
            <Icon icon="award" className="text-base" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-default-900 truncate text-sm font-medium">เหรียญตราเด่น</div>
            <div className="text-default-400 truncate text-2xs">เลือกได้สูงสุด {MAX_BADGES} ใบ · มีได้บล็อกเดียว</div>
          </div>
          {badgeBlock ? (
            <span className="badge bg-success/15 text-success text-2xs shrink-0">เพิ่มแล้ว</span>
          ) : (
            <button
              type="button"
              onClick={handleAddBadges}
              aria-label="เพิ่มเหรียญตราเด่น"
              className="btn btn-icon btn-sm bg-primary shrink-0 rounded-full text-white hover:bg-primary-hover"
            >
              <Icon icon="plus" className="text-sm" />
            </button>
          )}
        </div>

        <div className="text-default-500 text-2xs mt-3 mb-1.5">
          โพสต์จากเพจ Facebook{initialLibrary.facebookChannelConnected ? '' : ' · ยังไม่ได้เชื่อมเพจ'}
        </div>

        {filteredPosts.length === 0 ? (
          <p className="text-default-400 text-2xs">ยังไม่มีโพสต์ให้เลือก</p>
        ) : (
          filteredPosts.map((post) => {
            const added = addedFacebookPostIds.has(post.id)
            return (
              <div key={post.id} className="border-default-300 mb-2 overflow-hidden rounded-lg border bg-white">
                {post.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- คลังโหลดรูปจาก storage/Meta CDN ภายนอก ไม่ผ่าน next/image config
                  <img src={post.imageUrl} alt="" className="h-20 w-full object-cover" />
                ) : (
                  <div className="bg-default-200 text-default-400 flex h-20 items-center justify-center">
                    <Icon icon="photo" className="text-2xl" aria-hidden="true" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="text-default-700 line-clamp-2 text-xs">{post.message ?? '(ไม่มีข้อความ)'}</p>
                  <div className="text-default-400 text-2xs mt-1.5 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Icon icon="heart" className="text-sm" aria-hidden="true" />
                      {post.reactionCount ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon icon="message-circle" className="text-sm" aria-hidden="true" />
                      {post.fbCommentCount ?? 0}
                    </span>
                    {added ? (
                      <span className="badge bg-success/15 text-success text-2xs ms-auto">เพิ่มแล้ว</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddPost(post.id)}
                        disabled={addingPostId === post.id}
                        aria-label="เพิ่มลงหน้าร้าน"
                        className="btn btn-icon btn-sm bg-primary ms-auto rounded-full text-white hover:bg-primary-hover disabled:opacity-60"
                      >
                        <Icon icon={addingPostId === post.id ? 'loader-2' : 'plus'} className="text-sm" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* กลุ่ม 2: แท็บ — จัดลำดับได้ ปิดไม่ได้ */}
        <div className="text-default-600 mt-5 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="layout-list" className="text-sm" aria-hidden="true" />
          แท็บของหน้าร้าน
        </div>
        <p className="text-default-400 text-2xs mb-2">
          สลับลำดับด้วยปุ่มลูกศร (ลากได้ที่แถบแท็บตรงกลาง) — <b className="text-default-600">ปิดหรือเอาออกไม่ได้</b>{' '}
          แท็บจะขึ้นเองเมื่อมีข้อมูล
        </p>
        {draft.tabOrder.map((key, index) => (
          <div key={key} className="border-default-300 mb-2 flex items-center gap-2.5 rounded-lg border bg-white p-2.5">
            <span className="bg-default-100 text-default-500 flex size-7 items-center justify-center rounded-md text-2xs font-semibold">
              {index + 1}
            </span>
            <Icon icon={PROFILE_TAB_ICON[key]} className="text-default-400 text-base" aria-hidden="true" />
            <div className="text-default-900 min-w-0 flex-1 truncate text-sm font-medium">
              {PROFILE_TAB_LABEL_TH[key]}
            </div>
            <div className="flex shrink-0 gap-0.5">
              <button
                type="button"
                onClick={() => handleMoveTab(index, -1)}
                disabled={index === 0}
                aria-label={`ย้าย ${PROFILE_TAB_LABEL_TH[key]} ขึ้น`}
                className="btn btn-icon btn-sm text-default-500 disabled:opacity-30"
              >
                <Icon icon="chevron-up" className="text-sm" />
              </button>
              <button
                type="button"
                onClick={() => handleMoveTab(index, 1)}
                disabled={index === draft.tabOrder.length - 1}
                aria-label={`ย้าย ${PROFILE_TAB_LABEL_TH[key]} ลง`}
                className="btn btn-icon btn-sm text-default-500 disabled:opacity-30"
              >
                <Icon icon="chevron-down" className="text-sm" />
              </button>
            </div>
          </div>
        ))}
        {visibleTabKeys.length === 0 && (
          <p className="text-default-400 text-2xs">ร้านนี้ยังไม่มีแท็บที่มีข้อมูล — จะขึ้นเองเมื่อมีข้อมูล</p>
        )}

        {/* กลุ่ม 3: ตรึงตายตัว */}
        <div className="text-default-600 mt-5 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="lock" className="text-sm" aria-hidden="true" />
          ตรึงตายตัว
        </div>
        <p className="text-default-400 text-2xs mb-2">อยู่บนสุดเสมอ ขยับและซ่อนไม่ได้</p>
        <div className="border-default-300 bg-default-50 flex items-center gap-2.5 rounded-lg border border-dashed p-2.5">
          <span className="bg-white text-default-500 flex size-8 items-center justify-center rounded-md">
            <Icon icon="shield-check" className="text-base" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-default-900 truncate text-sm font-medium">คะแนน · ป้ายยืนยันตัวตน · สถิติ</div>
            <div className="text-default-400 truncate text-2xs">อยู่ในหัวโปรไฟล์</div>
          </div>
          <span className="badge bg-default-100 text-default-600 text-2xs shrink-0">ตรึง</span>
        </div>
      </div>
    </div>
  )
}
