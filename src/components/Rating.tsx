import { cn } from '@/utils/helpers'
import Icon from './wrappers/Icon'

type PropsType = {
  rating: number
  className?: string
}

const Rating = ({ rating, className }: PropsType) => {
  const fullStars = Math.floor(rating)
  const halfStar = rating % 1 !== 0
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0)

  // 🛑 role="img" + aria-label: คะแนนดาวคือ "ข้อมูลหลัก" ของรีวิว แต่ถูกสื่อด้วยไอคอนล้วน
  // ไม่มีตัวเลขกำกับที่ไหนในแถวเลย ⇒ ผู้ใช้ screen reader ไม่ได้ยินคะแนนสักคำ
  // ต้องเป็น role="img" ไม่ใช่ aria-label เปล่า ๆ บน <span> — span ไม่รองรับชื่อจากผู้เขียน
  // สเปกสั่งให้ทิ้ง label นั้นไป (docs/conventions/aria-name-requires-supporting-role.md)
  return (
    <span
      role="img"
      aria-label={`${rating} จาก 5 ดาว`}
      className={cn('text-warning inline-flex items-center gap-1', className)}
    >
      {[...Array(fullStars)].map((_, i) => (
        <Icon icon="star-filled" key={`full-${i}`} />
      ))}
      {halfStar && <Icon icon="star-filled" />}
      {[...Array(emptyStars)].map((_, i) => (
        <Icon icon="star" key={`empty-${i}`} />
      ))}
    </span>
  )
}

export default Rating
