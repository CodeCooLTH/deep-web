'use client'

/**
 * 🧪 PROTOTYPE — โยนทิ้ง ไม่ใช่โค้ดโปรดักชัน
 *
 * คำถามที่ต้องการคำตอบ: **เธรดคอมเมนต์ควรหน้าตายังไง** — ลูกค้าบอกว่าของเดิม "ดูยากเกินไป"
 *
 * 3 แบบที่ต่างกัน **เชิงโครงสร้าง** ไม่ใช่ต่างแค่สี สลับด้วย `?variant=A|B|C` บนหน้าจริง
 * (`/inbox/comments?post=...&variant=B`) เพื่อให้ตัดสินบนข้อมูลจริง ความหนาแน่นจริง หัวจริง
 *
 * ## ของเดิมมีปัญหาอะไร (อ่านจากภาพที่ user ส่งมา)
 *
 * แถวเดียวของลูกค้า 1 คน กินพื้นที่ 3 บรรทัดและมีของ 6 ชิ้นเรียงกันแนวนอน:
 *   เวลา · ✓ตอบแล้ว · ตอบ · [ทักแชท] · "คงเหลือ 6 วัน 23 ชั่วโมง 52 นาที"
 * โดย **"คงเหลือ ..." เป็นสีแดงทุกแถว** ตั้งแต่เหลือ 6 วัน ⇒ ทั้งจอแดงเท่ากันหมด สีเลยไม่ได้บอกอะไร
 * และคำตอบของเพจซ้ำกันทุกใบ ("แอดมินส่งรายละเอียดให้นะคะ") กินพื้นที่เท่าคอมเมนต์ของลูกค้า
 * ทั้งที่ผู้ขายไม่ต้องอ่านสิ่งที่ตัวเองพิมพ์
 *
 * ## กติกาที่ทุกแบบต้องเคารพ (ห้ามละเมิดแม้เป็น prototype)
 * - ห้าม emoji (HR12) · ใช้ Paces primitive ห้าม arbitrary value (HR7)
 * - Verified-Means-Green: เขียวสงวนให้ "ยืนยันได้จริง" เท่านั้น
 * - คำทั้งหมดยืมจาก dictionary เดิม ไม่ mint คำใหม่ (HR16)
 *
 * 🛑 แบบที่ชนะต้องถูก **เขียนใหม่** ผ่าน safepay-ux ก่อนลงโปรดักชัน — โค้ดในไฟล์นี้เขียนใต้ข้อจำกัด
 * ของ prototype (ไม่มีเทส ไม่มี error handling ไม่มี a11y ครบ) ห้ามยกไปใช้ตรง ๆ
 */

import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import type { Dictionary } from '@/i18n/dictionaries/th'
import { commentContentState } from '@/lib/comment-content-state'
import { formatDateTimeTH, formatTimeHM } from '@/lib/format-date'

export const VARIANT_NAMES: Record<string, string> = {
  A: 'ยุบคำตอบของเพจ — เหลือบรรทัดเดียว',
  B: 'แยกคอลัมน์ — งานอยู่ขวา บทสนทนาอยู่ซ้าย',
  C: 'การ์ดต่อคน — เน้นคนที่ยังไม่ได้คุย',
}

type ProtoComment = {
  id: string
  fromName: string | null
  message: string | null
  attachmentUrl: string | null
  createdTime: string
  isFromPage: boolean
  isDeleted: boolean
  privateReplySentAt?: string | null
  resolvedReason?: string | null
}

type ProtoNode = { comment: ProtoComment; replies: ProtoComment[]; publiclyAnswered: boolean }

/** สำเนาแบบ prototype ของเกณฑ์เวลา — ไม่แตะของจริง (throwaway ห้ามผูกกับ SSOT) */
function leftMs(createdTime: string) {
  return new Date(createdTime).getTime() + 7 * 24 * 60 * 60 * 1000 - Date.now()
}
function coarse(createdTime: string, t: Dictionary) {
  const left = leftMs(createdTime)
  if (left <= 0) return t.comments.windowExpired
  if (left > 86_400_000) return `${Math.ceil(left / 86_400_000)} วัน`
  if (left > 3_600_000) return `${Math.ceil(left / 3_600_000)} ชั่วโมง`
  return `${Math.ceil(left / 60_000)} นาที`
}
function urgent(createdTime: string) {
  const left = leftMs(createdTime)
  return left > 0 && left <= 86_400_000
}
function bodyOf(c: ProtoComment, t: Dictionary) {
  const s = commentContentState(c)
  return s === 'TEXT' ? c.message?.trim() : s === 'ATTACHMENT_ONLY' ? t.comments.commentAttachmentOnly : t.comments.contentUnavailable
}
function initial(name: string | null) {
  return (name ?? '?').trim().charAt(0) || '?'
}

/* ══════════════════════════════════════════════════════════════════════════
   A — ยุบคำตอบของเพจให้เหลือบรรทัดเดียว
   สมมติฐาน: สิ่งที่กินพื้นที่ไปเปล่า ๆ คือ "คำตอบของเราเอง" ซึ่งซ้ำกันทุกใบและผู้ขายไม่ต้องอ่าน
   ⇒ ยุบเป็นบรรทัดสรุปกดขยายได้ · เมตาดาต้าย้ายไปอยู่ขวาของบับเบิลแทนที่จะเป็นแถวใต้
   ══════════════════════════════════════════════════════════════════════════ */
function VariantA({ tree, t }: { tree: ProtoNode[]; t: Dictionary }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="divide-default-200 divide-y">
      {tree.map(({ comment: c, replies, publiclyAnswered }) => {
        const pageReplies = replies.filter((r) => r.isFromPage)
        const expanded = open[c.id]
        return (
          <div key={c.id} className="py-3">
            <div className="flex items-start gap-2">
              <span className="bg-default-100 text-default-700 text-2xs flex size-7 shrink-0 items-center justify-center rounded-full">
                {initial(c.fromName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-default-900 mb-0 text-sm font-semibold">{c.fromName}</p>
                <p className="text-default-800 mb-0 whitespace-pre-wrap text-sm">{bodyOf(c, t)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-default-700 text-2xs" title={formatDateTimeTH(c.createdTime)}>
                  {formatTimeHM(c.createdTime)}
                </span>
                {!publiclyAnswered && (
                  <span
                    className={`badge text-2xs ${urgent(c.createdTime) ? 'bg-danger/15 text-danger-ink' : 'bg-warning/15 text-warning-ink'}`}
                  >
                    {coarse(c.createdTime, t)}
                  </span>
                )}
              </div>
            </div>
            {pageReplies.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((s) => ({ ...s, [c.id]: !s[c.id] }))}
                className="text-default-700 ms-9 mt-1 inline-flex items-center gap-1 text-2xs hover:underline"
              >
                <Icon icon={expanded ? 'chevron-up' : 'chevron-down'} width={12} height={12} />
                {t.comments.answered} · {pageReplies.length}
              </button>
            )}
            {expanded &&
              pageReplies.map((r) => (
                <p key={r.id} className="text-default-700 ms-9 mt-1 mb-0 text-xs">
                  {bodyOf(r, t)}
                </p>
              ))}
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   B — แยกคอลัมน์: บทสนทนาอยู่ซ้าย งานที่ต้องทำอยู่ขวา
   สมมติฐาน: ที่ "ดูยาก" เพราะข้อความกับปุ่ม/สถานะปนกันในแถวเดียว ตาต้องกวาดซ้าย-ขวาสลับตลอด
   ⇒ ตรึงคอลัมน์งานไว้ขวาให้กวาดลงเป็นแนวตั้งได้ทีเดียว
   ══════════════════════════════════════════════════════════════════════════ */
function VariantB({ tree, t }: { tree: ProtoNode[]; t: Dictionary }) {
  return (
    <div className="space-y-2">
      {tree.map(({ comment: c, replies, publiclyAnswered }) => (
        <div key={c.id} className="border-default-200 flex items-stretch gap-3 rounded-lg border p-2">
          <div className="min-w-0 flex-1">
            <p className="text-default-900 mb-0 text-sm font-semibold">
              {c.fromName}
              <span className="text-default-700 ms-2 text-2xs font-normal">{formatTimeHM(c.createdTime)}</span>
            </p>
            <p className="text-default-800 mb-0 whitespace-pre-wrap text-sm">{bodyOf(c, t)}</p>
            {replies
              .filter((r) => r.isFromPage)
              .map((r) => (
                <p key={r.id} className="text-default-700 mt-1 mb-0 border-s-2 border-default-200 ps-2 text-xs">
                  {bodyOf(r, t)}
                </p>
              ))}
          </div>
          <div className="border-default-200 flex w-28 shrink-0 flex-col items-stretch gap-1 border-s ps-2">
            {publiclyAnswered ? (
              <span className="badge bg-success/15 text-success-ink text-2xs justify-center">{t.comments.answered}</span>
            ) : (
              <span
                className={`badge text-2xs justify-center ${urgent(c.createdTime) ? 'bg-danger/15 text-danger-ink' : 'bg-warning/15 text-warning-ink'}`}
              >
                {coarse(c.createdTime, t)}
              </span>
            )}
            <button type="button" className="btn btn-light text-2xs min-h-8 w-full justify-center">
              {t.comments.reply}
            </button>
            <button type="button" className="btn btn-light text-2xs min-h-8 w-full justify-center">
              {t.comments.openChat}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   C — การ์ดต่อคน เรียงตามความเร่งด่วน คนที่คุยจบแล้วยุบลงเหลือบรรทัดเดียว
   สมมติฐาน: ผู้ขายไม่ได้อ่านเธรดเป็นบทสนทนา แต่กำลังไล่ "ใครยังไม่ได้คุย"
   ⇒ ให้จอตอบคำถามนั้นตรง ๆ เอาคนที่จบแล้วออกจากสายตาก่อน
   ══════════════════════════════════════════════════════════════════════════ */
function VariantC({ tree, t }: { tree: ProtoNode[]; t: Dictionary }) {
  const todo = tree.filter((n) => !n.publiclyAnswered)
  const done = tree.filter((n) => n.publiclyAnswered)
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {todo.map(({ comment: c }) => (
          <div key={c.id} className="border-default-300 rounded-lg border p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="bg-default-100 text-default-700 text-2xs flex size-7 shrink-0 items-center justify-center rounded-full">
                {initial(c.fromName)}
              </span>
              <span className="text-default-900 min-w-0 flex-1 truncate text-sm font-semibold">{c.fromName}</span>
              <span
                className={`badge text-2xs shrink-0 ${urgent(c.createdTime) ? 'bg-danger/15 text-danger-ink' : 'bg-warning/15 text-warning-ink'}`}
              >
                {coarse(c.createdTime, t)}
              </span>
            </div>
            <p className="text-default-800 mb-2 whitespace-pre-wrap text-sm">{bodyOf(c, t)}</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-light text-2xs min-h-8 flex-1 justify-center">
                {t.comments.reply}
              </button>
              <button type="button" className="btn btn-light text-2xs min-h-8 flex-1 justify-center">
                {t.comments.openChat}
              </button>
            </div>
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <div>
          <p className="text-default-700 text-2xs mb-1">
            {t.comments.answered} · {done.length}
          </p>
          <div className="divide-default-200 divide-y">
            {done.map(({ comment: c }) => (
              <p key={c.id} className="text-default-700 mb-0 truncate py-1.5 text-xs">
                <span className="font-medium">{c.fromName}</span> · {bodyOf(c, t)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CommentThreadVariants({
  variant,
  tree,
  t,
}: {
  variant: string
  tree: ProtoNode[]
  t: Dictionary
}) {
  if (variant === 'B') return <VariantB tree={tree} t={t} />
  if (variant === 'C') return <VariantC tree={tree} t={t} />
  return <VariantA tree={tree} t={t} />
}
