/**
 * AdThumb — รูปโฆษณา (00091) · ไม่มีรูป = tile ไอคอน speakerphone (มติ Q7)
 *
 * Base (tile ไอคอน): src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx แบนเนอร์โฆษณา
 *   (`bg-default-100 text-default-700` + `Icon speakerphone`) — ตัวเดียวกันเพื่อให้ "โฆษณา" = สัญลักษณ์เดียวทุกจุด
 * รูป: `/api/files/{id}?variant=thumb` ตาม docs/conventions/image-thumbnails.md (ย่อสดหลังด่านสิทธิ์ ไม่เก็บไฟล์)
 *
 * `className` กำหนดขนาด+ความโค้ง (เช่น `size-5 rounded-full`) — ผู้เรียกคุมเอง
 */
import Icon from '@/components/wrappers/Icon'

export default function AdThumb({
  photoFileId,
  className = 'size-7 rounded',
  iconClass = 'text-base',
}: {
  photoFileId?: string | null
  className?: string
  iconClass?: string
}) {
  if (photoFileId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/files/${photoFileId}?variant=thumb`} alt="" className={`${className} shrink-0 object-cover`} />
    )
  }
  return (
    <span className={`${className} bg-default-100 text-default-700 flex shrink-0 items-center justify-center`}>
      <Icon icon="speakerphone" className={iconClass} aria-hidden="true" />
    </span>
  )
}
