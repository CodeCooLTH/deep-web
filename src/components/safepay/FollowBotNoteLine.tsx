/**
 * FollowBotNoteLine — บรรทัดระบบกลางห้องของบอทติดตาม (FOLLOW_BOT_NOTE, 00095 UX §4.3)
 * ท่าเดียวกับ systemNotice ของ META_NOTICE ใน ThreadMessageList (my-5 px-4 text-center · text-default-600 text-xs)
 * ไม่ใช่ฟอง · ไม่มีปุ่ม/ลิงก์
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatPage.tsx (my-5 แถวข้อความ) · ข้อความกลางห้องคัดจากพี่น้อง ThreadMessageList.tsx systemNotice
 */
import Icon from '@/components/wrappers/Icon'

export default function FollowBotNoteLine({ body }: { body: string | null }) {
  return (
    <div className="my-5 px-4 text-center">
      <p className="text-default-600 mb-0 text-xs">
        <Icon icon="target-arrow" className="me-0.5 inline size-3.5 align-text-bottom" aria-hidden="true" />
        {body}
      </p>
    </div>
  )
}
