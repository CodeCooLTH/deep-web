import StateCard from './components/StateCard'

// หน้าเดียวสำหรับ ไม่พบ/token ผิด/กลุ่มถูกนำออก — ห้ามแยกเหตุ (กัน oracle · AC-05-1)
export default function NotFound() {
  return (
    <StateCard
      icon="file-alert"
      title="ไม่พบหน้าสรุปนี้"
      body="ลิงก์อาจพิมพ์ไม่ครบ หรือไม่ได้ใช้งานแล้ว ลองกดปุ่มบนการ์ดรายงานล่าสุดในกลุ่ม LINE อีกครั้ง"
    />
  )
}
