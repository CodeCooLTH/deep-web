'use client'

import { useEffect, useRef, useState } from 'react'

import Link from 'next/link'
import { toast } from 'react-toastify'

// RC-8: ห้ามรับ buyerContact/phone ใดๆ — server-side ดึง buyer phone เองผ่าน DAL
interface SendSmsButtonProps {
  publicToken: string
}

type UiState = 'idle' | 'confirm' | 'sending' | 'success'

// กำหนด timeout ชัดเจนเพื่อ cleanup ไม่ให้ leak
const CONFIRM_TIMEOUT_MS = 5000
const SUCCESS_RESET_MS = 3000

export default function SendSmsButton({ publicToken }: SendSmsButtonProps) {
  const [uiState, setUiState] = useState<UiState>('idle')
  // error message แยกตาม HTTP status — บางเคส embed JSX ด้วย Link
  const [errorNode, setErrorNode] = useState<React.ReactNode | null>(null)

  // useRef เพื่อ clear timeout ได้ทั้ง on unmount และ on state change — กัน leak
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // clear timer เมื่อ state เปลี่ยน หรือ unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [uiState])

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const goIdle = () => {
    clearTimer()
    setUiState('idle')
    setErrorNode(null)
  }

  const handleInitialClick = () => {
    setErrorNode(null)
    setUiState('confirm')
    // timeout 5s ไม่ทำอะไร → กลับ idle อัตโนมัติ (Controller decision LOCKED)
    timerRef.current = setTimeout(() => {
      setUiState('idle')
    }, CONFIRM_TIMEOUT_MS)
  }

  const handleConfirm = async () => {
    clearTimer()
    setUiState('sending')
    setErrorNode(null)

    try {
      // NO body — RC-8: ห้ามส่ง buyerContact ใดๆ มาจาก client; route ดึงเองผ่าน DAL
      const res = await fetch(`/api/orders/${publicToken}/send-sms`, {
        method: 'POST',
      })

      if (res.ok) {
        setUiState('success')
        toast.success('ส่ง SMS แล้ว ฿1 ถูกหักจากเครดิต')
        timerRef.current = setTimeout(() => {
          setUiState('idle')
        }, SUCCESS_RESET_MS)
        return
      }

      // แปลง HTTP error เป็น inline node ตาม spec
      const errorResult = await buildErrorNode(res.status)
      setErrorNode(errorResult)
      setUiState('idle')
    } catch {
      // network / unexpected error
      setErrorNode('ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่')
      setUiState('idle')
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {uiState === 'idle' && (
        <button
          type="button"
          onClick={handleInitialClick}
          className="btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
        >
          {/* tabler-message icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          ส่งลิงก์ทาง SMS (฿1)
        </button>
      )}

      {uiState === 'confirm' && (
        <div className="inline-flex items-center gap-2 flex-wrap">
          <span className="text-xs text-default-700">ยืนยันส่ง SMS? (฿1)</span>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn btn-sm bg-primary text-white hover:bg-primary-hover px-3 py-1.5 text-xs"
          >
            ยืนยัน
          </button>
          <button
            type="button"
            onClick={goIdle}
            className="btn btn-sm border border-default-300 bg-card hover:bg-default-50 text-default-700 px-3 py-1.5 text-xs"
          >
            ยกเลิก
          </button>
        </div>
      )}

      {uiState === 'sending' && (
        <button
          type="button"
          disabled
          className="btn btn-sm border border-default-300 bg-card text-default-400 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-60 cursor-not-allowed"
        >
          {/* spinner */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-spin"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          กำลังส่ง...
        </button>
      )}

      {uiState === 'success' && (
        <span className="text-xs text-success font-medium">ส่งแล้ว</span>
      )}

      {errorNode && (
        <p className="text-danger text-xs mt-0.5" role="alert">
          {errorNode}
        </p>
      )}
    </div>
  )
}

// แยก function เพื่อความชัดเจน — map HTTP status → inline error node
async function buildErrorNode(status: number): Promise<React.ReactNode> {
  switch (status) {
    case 402:
      return (
        <>
          เครดิตไม่พอ —{' '}
          <Link href="/wallet" className="underline hover:text-danger-dark">
            ซื้อเครดิต SMS
          </Link>
        </>
      )
    case 403:
      return (
        <>
          ต้องยืนยันตัวตนระดับ L2 ก่อน —{' '}
          <Link href="/verification" className="underline hover:text-danger-dark">
            ยืนยันตัวตน
          </Link>
        </>
      )
    case 429:
      return 'ส่ง SMS บ่อยเกินไป กรุณารอสักครู่'
    case 422:
      return 'ยังไม่มีเบอร์ผู้ซื้อในออเดอร์นี้ — ไม่สามารถส่ง SMS ได้'
    default:
      return 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่'
  }
}
