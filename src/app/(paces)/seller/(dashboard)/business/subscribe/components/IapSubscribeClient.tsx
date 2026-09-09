'use client'

/**
 * หน้าซื้อแพ็กเกจในแอป iOS — ราคามาจาก StoreKit เท่านั้น (feature 00064)
 *
 * ## 🛑 ลำดับที่ห้ามสลับ: จ่ายเงิน → เซิร์ฟเวอร์ยืนยัน → **ค่อยปิดธุรกรรม**
 *
 * StoreKit ส่งธุรกรรมที่ยังไม่ถูกปิดกลับมาทุกครั้งที่เปิดแอป จนกว่าเราจะสั่งปิด — นั่นคือ
 * กลไกกู้คืนในตัว (BR-IAP-11) · ปิดก่อนเซิร์ฟเวอร์ยืนยันแล้วเซิร์ฟเวอร์ล่ม = ลูกค้าจ่ายเงิน
 * ไปแล้วไม่ได้ของ **และธุรกรรมนั้นจะไม่กลับมาอีกเลยตลอดกาล** เงินหายจริง กู้ไม่ได้
 *
 * `/api/iap/apple/verify` ออกแบบรับกติกานี้ไว้แล้ว: 500 = ลองใหม่ได้ (ห้ามปิด) ·
 * 400/409 = ใบนี้ใช้ไม่ได้ ลองกี่ครั้งก็เท่าเดิม
 *
 * ## 🛑 ราคาที่แสดงต้องมาจาก StoreKit เท่านั้น
 *
 * ราคาบนเว็บ (159/599/1,299) ต่างจากในแอป (249/899/1,990) — เอาราคาเว็บมาโชว์เป็นค่าสำรอง
 * = ผู้ใช้เห็น 159 แล้วโดนตัดจริง 249 · Apple ก็ตรวจข้อนี้ตรง ๆ (TC-IAP-40)
 * ถามราคาไม่ได้ ⇒ ไม่โชว์อะไรเลย ดีกว่าโชว์ผิด
 *
 * ## ทำอะไรได้บ้างในแอป (user เคาะ 2026-09-08)
 *
 * ซื้อใหม่ · **อัปเกรด** เท่านั้น — ดาวน์เกรด/ยกเลิกส่งไปหน้าจัดการของ Apple เพราะดาวน์เกรด
 * ทำให้โควตาลดแล้วระบบต้องเลือกล็อกร้านเอง (เจ้าของไม่ได้เลือกเหมือนฝั่งเว็บ) ยังไม่ควรให้
 * เกิดจากการกดพลาดในหน้านี้
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { TIER_ORDER, type BusinessPackageTier } from '@/lib/business-package'
import { tierFromAppleProductId } from '@/lib/apple/product-ids'
import { createIapClient } from '@/lib/iap-client'
import { createWindowIapTransport } from '@/lib/iap-transport'
import { resolveAppPurchaseView, type IapProductsState } from '@/lib/iap-purchase-view'
import type { IapFailure, IapProduct, IapPurchase } from '@/lib/iap-bridge-protocol'

/** หน้าจัดการ subscription ของ Apple — ทางเดียวที่ยกเลิก/ดาวน์เกรดได้ */
const APPLE_MANAGE_URL = 'https://apps.apple.com/account/subscriptions'

interface Props {
  subscription: { source: string; status: string; tier: BusinessPackageTier } | null
  mainSiteOrigin: string
}

/** ข้อความต่อเหตุผล — แยกจาก UI เพื่อให้เพิ่มเหตุผลใหม่แล้วไม่ลืมเขียนข้อความ */
function failureMessage(reason: IapFailure): string {
  switch (reason) {
    case 'CANCELLED':
      return 'ยกเลิกการซื้อแล้ว'
    case 'TIMEOUT':
      return 'แอปไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง'
    case 'UNAVAILABLE':
      return 'ตอนนี้ซื้อในแอปไม่ได้ กรุณาลองใหม่ภายหลัง'
    case 'FAILED':
      return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
  }
}

export default function IapSubscribeClient({ subscription, mainSiteOrigin }: Props) {
  const router = useRouter()
  const [products, setProducts] = useState<IapProductsState>(null)
  const [busy, setBusy] = useState<string | null>(null)

  /* สร้างครั้งเดียวต่อการ mount — สร้างใหม่ทุก render = ตัวจับเวลาชุดใหม่ทุกครั้ง */
  const clientRef = useRef<ReturnType<typeof createIapClient> | null>(null)
  if (clientRef.current === null) {
    clientRef.current = createIapClient(
      createWindowIapTransport(typeof window === 'undefined' ? undefined : window),
    )
  }
  const client = clientRef.current

  const loadProducts = useCallback(async () => {
    setProducts(null)
    const res = await client.request({ kind: 'products' })
    if (res.ok && res.kind === 'products') setProducts({ ok: true, products: res.products })
    else setProducts({ ok: false, reason: res.ok ? 'FAILED' : res.reason })
  }, [client])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  /**
   * ส่งใบเสร็จให้เซิร์ฟเวอร์ แล้ว **ค่อย** สั่งปิดธุรกรรมถ้าสำเร็จ
   *
   * คืน true เมื่อสิทธิ์ถูกเปิดแล้ว
   */
  const verifyThenFinish = useCallback(
    async (item: IapPurchase): Promise<boolean> => {
      let res: Response
      try {
        res = await fetch('/api/iap/apple/verify', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signedTransaction: item.jws }),
        })
      } catch {
        /* เน็ตหลุด = ลองใหม่ได้ ⇒ **ห้ามปิดธุรกรรม** ปล่อยให้ StoreKit ส่งกลับมารอบหน้า */
        return false
      }

      if (!res.ok) {
        /* 5xx = ฝั่งเราเพี้ยน ลองใหม่ได้ → ไม่ปิด
           4xx = ใบนี้ใช้ไม่ได้จริง ลองกี่ครั้งก็เท่าเดิม → ปิดทิ้ง ไม่งั้นจะเด้ง error
                 ใส่หน้าผู้ใช้ทุกครั้งที่เปิดแอปตลอดไป */
        if (res.status < 500) {
          client.finish(item.transactionId)
        }
        return false
      }

      client.finish(item.transactionId)
      return true
    },
    [client],
  )

  const buy = useCallback(
    async (productId: string) => {
      setBusy(productId)
      try {
        const res = await client.request({ kind: 'purchase', productId })
        if (!res.ok) {
          /* ผู้ใช้กดยกเลิกเองไม่ใช่ความผิดพลาด — ไม่ต้องเด้งข้อความให้รำคาญ */
          if (res.reason !== 'CANCELLED') pacesToast.error(failureMessage(res.reason))
          return
        }
        if (res.kind !== 'purchase') return
        if (await verifyThenFinish(res)) {
          pacesToast.success('เปิดใช้งานแพ็กเกจแล้ว')
          router.refresh()
        } else {
          pacesToast.error('ชำระเงินสำเร็จ แต่เปิดสิทธิ์ยังไม่สำเร็จ — เปิดแอปอีกครั้งระบบจะลองให้เอง')
        }
      } finally {
        setBusy(null)
      }
    },
    [client, router, verifyThenFinish],
  )

  const restore = useCallback(async () => {
    setBusy('restore')
    try {
      const res = await client.request({ kind: 'restore' })
      if (!res.ok) {
        if (res.reason !== 'CANCELLED') pacesToast.error(failureMessage(res.reason))
        return
      }
      if (res.kind !== 'restore') return
      if (res.items.length === 0) {
        pacesToast.error('ไม่พบการซื้อที่กู้คืนได้สำหรับ Apple ID นี้')
        return
      }
      let any = false
      for (const item of res.items) any = (await verifyThenFinish(item)) || any
      if (any) {
        pacesToast.success('กู้คืนการซื้อแล้ว')
        router.refresh()
      } else {
        pacesToast.error('กู้คืนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      }
    } finally {
      setBusy(null)
    }
  }, [client, router, verifyThenFinish])

  const view = useMemo(
    () => resolveAppPurchaseView({ shell: 'ios', subscription, products }),
    [subscription, products],
  )

  /* หน้านี้ถูกกันไว้ที่ server แล้วว่าเข้าได้เฉพาะในแอป — 'web' จึงไม่ควรเกิด
     แต่ถ้าเกิด (เช่นด่านถูกแก้ในอนาคต) ต้องไม่โชว์อะไรเลย ไม่ใช่โชว์ปุ่มซื้อที่กดไม่ได้ */
  if (view.kind === 'web') return null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-xl font-semibold">แพ็กเกจธุรกิจ</h1>

      {view.kind === 'wallet' && <WalletNotice tier={view.tier} />}

      {view.kind === 'loading' && (
        <p className="text-default-500 mt-6 text-center text-sm">กำลังโหลดราคา…</p>
      )}

      {view.kind === 'unavailable' && (
        <Unavailable reason={view.reason} onRetry={() => void loadProducts()} />
      )}

      {(view.kind === 'buy' || view.kind === 'apple') && (
        <>
          <p className="text-default-500 mt-1 text-sm">
            ต่ออายุอัตโนมัติทุกเดือน · ยกเลิกได้ทุกเมื่อในการตั้งค่า Apple ID
          </p>

          <div className="mt-5 grid gap-4">
            {sortTiers(view.products).map(({ product, tier }) => {
              const isCurrent = view.kind === 'apple' && view.tier === tier
              const isLower =
                view.kind === 'apple' && tier !== null && TIER_ORDER[tier] < TIER_ORDER[view.tier]
              return (
                <ProductCard
                  key={product.productId}
                  product={product}
                  isCurrent={isCurrent}
                  /* ดาวน์เกรดไม่ให้กดในแอป — ดูเหตุผลหัวไฟล์ */
                  disabled={isCurrent || isLower}
                  disabledLabel={isCurrent ? 'ใช้งานอยู่' : 'เปลี่ยนได้ในการตั้งค่า Apple ID'}
                  busy={busy === product.productId}
                  anyBusy={busy !== null}
                  onBuy={() => void buy(product.productId)}
                />
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => void restore()}
            disabled={busy !== null}
            className="btn bg-light text-default-700 mt-4 w-full"
          >
            {busy === 'restore' ? 'กำลังกู้คืน…' : 'กู้คืนการซื้อ'}
          </button>

          {view.kind === 'apple' && (
            <a
              href={APPLE_MANAGE_URL}
              className="text-primary mt-3 block text-center text-sm"
              target="_blank"
              rel="noreferrer"
            >
              จัดการหรือยกเลิกการสมัคร
            </a>
          )}
        </>
      )}

      {/* 🛑 Apple บังคับให้จอที่ขาย subscription มีลิงก์สองอันนี้ (Guideline 3.1.2)
          ต้องเป็น URL เต็มของโดเมนหลัก — path เปล่าจะถูก rewrite เป็น /seller/terms แล้ว 404 */}
      <div className="text-default-500 mt-6 flex justify-center gap-4 text-xs">
        <a href={`${mainSiteOrigin}/terms`} target="_blank" rel="noreferrer" className="underline">
          เงื่อนไขการใช้บริการ
        </a>
        <a href={`${mainSiteOrigin}/privacy`} target="_blank" rel="noreferrer" className="underline">
          นโยบายความเป็นส่วนตัว
        </a>
      </div>
    </div>
  )
}

/** เรียงตามระดับจากต่ำไปสูง — StoreKit ไม่รับประกันลำดับที่ส่งกลับมา */
function sortTiers(products: IapProduct[]): { product: IapProduct; tier: BusinessPackageTier | null }[] {
  return products
    .map((product) => ({ product, tier: tierFromAppleProductId(product.productId) }))
    .sort((a, b) => (a.tier ? TIER_ORDER[a.tier] : 99) - (b.tier ? TIER_ORDER[b.tier] : 99))
}

function WalletNotice({ tier }: { tier: BusinessPackageTier }) {
  return (
    <div className="card mt-5 rounded-md">
      <div className="card-body p-7.5 text-center">
        <Icon icon="check-circle" className="text-success mx-auto text-3xl" aria-hidden="true" />
        <p className="mt-3 font-medium">คุณใช้แพ็กเกจ {tier} อยู่แล้ว</p>
        {/* 🛑 ห้ามบอกว่า "จ่ายผ่านเว็บ" หรือชี้ทางไปหน้าจ่ายเงินข้างนอก — ผิด 3.1.1 ข้อเดียวกัน
            กับการมีปุ่มจ่ายเงิน · บอกแค่ว่าใช้งานได้ตามปกติก็พอ */}
        <p className="text-default-500 mt-1 text-sm">ใช้งานได้ตามปกติ ไม่ต้องทำอะไรเพิ่ม</p>
      </div>
    </div>
  )
}

function Unavailable({ reason, onRetry }: { reason: IapFailure; onRetry: () => void }) {
  return (
    <div className="card mt-5 rounded-md">
      <div className="card-body p-7.5 text-center">
        <p className="font-medium">{failureMessage(reason)}</p>
        <button type="button" onClick={onRetry} className="btn bg-primary mt-4 text-white hover:bg-primary-hover">
          ลองใหม่
        </button>
      </div>
    </div>
  )
}

function ProductCard({
  product,
  isCurrent,
  disabled,
  disabledLabel,
  busy,
  anyBusy,
  onBuy,
}: {
  product: IapProduct
  isCurrent: boolean
  disabled: boolean
  disabledLabel: string
  busy: boolean
  anyBusy: boolean
  onBuy: () => void
}) {
  return (
    <div className={`card rounded-md${isCurrent ? ' border-primary border' : ''}`}>
      <div className="card-body p-7.5 text-center">
        <h2 className="font-semibold">{product.displayName}</h2>
        {/* ราคาจาก StoreKit — จัดรูปแบบและสกุลเงินมาแล้ว ห้ามแตะ */}
        <p className="text-4xl font-semibold">{product.displayPrice}</p>
        <p className="text-default-500 text-sm">ต่อเดือน · ต่ออายุอัตโนมัติ</p>

        {disabled ? (
          <span
            aria-disabled="true"
            className="btn bg-light text-default-400 mt-4 w-full cursor-not-allowed"
          >
            {disabledLabel}
          </span>
        ) : (
          <button
            type="button"
            onClick={onBuy}
            disabled={anyBusy}
            className="btn bg-primary mt-4 w-full text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? 'กำลังดำเนินการ…' : 'สมัคร'}
          </button>
        )}
      </div>
    </div>
  )
}
