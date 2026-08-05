import { redirect } from 'next/navigation'

/**
 * /business/[shopId]/onboarding — ตัวเปลี่ยนเส้นทางเท่านั้น ไม่มี UI แล้ว
 *
 * ทำไมยังต้องมีไฟล์นี้ทั้งที่ตัด onboarding ทิ้งไปแล้ว (2026-08-05):
 * ตอนลบหน้าไป ผมลืมคิดถึง deploy skew — แท็บที่เปิดค้างอยู่ก่อน deploy ยังรัน JS bundle เก่า
 * ที่มี router.push('/business/{id}/onboarding') อยู่ในนั้น พอสร้างธุรกิจเสร็จมันจึงพาไปหน้าที่
 * ไม่มีอยู่แล้ว → ผู้ใช้เจอ 404 ทันทีหลังสร้างธุรกิจสำเร็จ (user เจอเอง)
 *
 * ลิงก์เก่า/บุ๊กมาร์กก็ตกอยู่ในกรณีเดียวกัน — ปล่อยให้ 404 คือทิ้งคนที่ทำถูกทุกอย่าง
 * ให้ไปเจอทางตัน ทั้งที่ปลายทางที่เขาต้องการมีอยู่จริงแค่ย้ายที่
 *
 * ไม่ใช้ redirects ใน next.config เพราะกฎนี้ผูกกับ path param ของ route นี้ตัวเดียว
 * อยู่ใกล้กับหน้าที่มันแทนที่ อ่านแล้วรู้ทันทีว่าทำไมยังมีอยู่
 */
export default async function BusinessOnboardingRedirect({
  params,
}: {
  params: Promise<{ shopId: string }>
}) {
  const { shopId } = await params
  redirect(`/business/${shopId}/settings`)
}
