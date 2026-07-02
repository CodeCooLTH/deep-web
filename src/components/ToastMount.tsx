'use client'

/**
 * ToastMount (buyer / (marketing) = Vuexy) — ใช้ AppReactToastify ของธีม Vuexy
 * แทน <ToastContainer theme="colored"> ดิบ (เขียวสด/แดงสด ไม่เข้าธีม).
 *
 * Base: theme/vuexy/typescript-version/full-version/src/libs/styles/AppReactToastify.tsx
 *   (copy อยู่ที่ src/libs/styles/AppReactToastify.tsx) — toast = พื้น background.paper +
 *   ไอคอนสี success/error/warning/info .main (Vuexy token) + radius/shadow ตามธีม
 *   ไม่ใช่ solid-color แบบ theme="colored". position จาก themeConfig.toastPosition ('top-right').
 */
import AppReactToastify from '@/libs/styles/AppReactToastify'

export default function AuthToastMount() {
  return <AppReactToastify autoClose={4000} />
}
