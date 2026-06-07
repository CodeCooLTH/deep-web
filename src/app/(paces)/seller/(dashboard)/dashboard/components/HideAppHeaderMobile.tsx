/**
 * HideAppHeaderMobile — ซ่อน Paces app-header บน dashboard mobile (SSR, ไม่มี FOUC)
 *
 * ทำไม SSR <style> ไม่ใช่ client body-class: เดิมใช้ useEffect toggle body class
 * → app-header กระพริบ 1-2 frame ก่อน JS hydrate ที่ viewport จริง <lg (FOUC).
 * render <style> ฝั่ง server → อยู่ใน initial HTML ตั้งแต่ paint แรก = ไม่ flash.
 *
 * scope ทาง "เวลา": <style> อยู่เฉพาะตอนหน้า dashboard mount — navigate ออก
 * (เช่น /products) React unmount → app-header กลับมาเอง. ไม่ leak ข้ามหน้า.
 * scope ทาง "viewport": media max-width:1023px — CommandCenter render บน desktop
 * ด้วย (แต่ lg:hidden) จึงต้อง gate <lg ไม่ให้กระทบ desktop app-header.
 *
 * Base: N/A (utility — SSR style injection, ไม่มี UI)
 */
export default function HideAppHeaderMobile() {
  return (
    <style>{`@media (max-width:1023px){.app-header{display:none!important}}`}</style>
  )
}
