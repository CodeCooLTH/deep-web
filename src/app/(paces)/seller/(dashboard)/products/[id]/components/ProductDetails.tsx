/**
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(products)/product-details/components/ProductDetails.tsx
 * แสดงรายละเอียด product: ประเภท, ชื่อ, meta grid, ราคา (บาท ไม่ใช่ $), คำอธิบาย, ปุ่ม action
 * ราคาแสดงเป็น ฿ ไม่ใช่ $ — ข้อมูลทั้งหมดมาจาก real product record
 */

import Icon from '@/components/wrappers/Icon'
import Rating from '@/components/Rating'
import Link from 'next/link'
import DeleteProductButton from './DeleteProductButton'
import type { ProductDetailProps } from './data'

interface Props {
  product: ProductDetailProps
}

const TYPE_META: Record<ProductDetailProps['type'], { icon: string; label: string; cls: string }> = {
  PHYSICAL: {
    icon: 'package',
    label: 'สินค้าจับต้องได้',
    cls: 'bg-primary/15 text-primary',
  },
  DIGITAL: {
    icon: 'cloud-download',
    label: 'ดิจิทัล',
    cls: 'bg-info/15 text-info',
  },
  SERVICE: {
    icon: 'tool',
    label: 'บริการ',
    cls: 'bg-success/15 text-success',
  },
  SUBSCRIPTION: {
    icon: 'refresh',
    label: 'สมาชิก/รอบ',
    cls: 'bg-warning/15 text-warning',
  },
}

const ProductDetails = ({ product }: Props) => {
  const { id, name, price, rating, reviews, description, type, totalSold, createdAt } = product
  const meta = TYPE_META[type] ?? TYPE_META.PHYSICAL

  const createdDate = new Date(createdAt).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      {/* แถว badge + rating */}
      <div className="mb-5 flex justify-between items-center">
        <span className={`badge rounded-full text-sm py-1.5 px-3 inline-flex items-center gap-1.5 ${meta.cls}`}>
          <Icon icon={meta.icon} className="text-base" />
          {meta.label}
        </span>
        <div className="flex items-center gap-1.5 text-base">
          <Rating rating={rating} />
          <span className="text-default-400 text-sm">({reviews} รีวิว)</span>
        </div>
      </div>

      {/* ชื่อสินค้า */}
      <div className="mt-5 mb-5 md:mb-7.5">
        <h4 className="text-lg">{name}</h4>
      </div>

      {/* Meta grid — field จาก Product schema จริง */}
      <div className="mb-5 grid grid-cols-2 md:mb-7.5 md:grid-cols-4 gap-x-base">
        <div>
          <h6 className="text-default-400 text-xs mb-1.25 uppercase">ประเภท:</h6>
          <p className="font-medium">{meta.label}</p>
        </div>
        <div>
          <h6 className="text-default-400 text-xs mb-1.25 uppercase">ขายแล้ว:</h6>
          <p className="font-medium">{totalSold.toLocaleString('th-TH')} ชิ้น</p>
        </div>
        <div>
          <h6 className="text-default-400 text-xs mb-1.25 uppercase">รีวิว:</h6>
          <p className="font-medium">{reviews.toLocaleString('th-TH')}</p>
        </div>
        <div>
          <h6 className="text-default-400 text-xs mb-1.25 uppercase">วันที่เพิ่ม:</h6>
          <p className="font-medium">{createdDate}</p>
        </div>
      </div>

      {/* ราคา — แสดงเป็น ฿ ไม่ใช่ $ */}
      <h3 className="text-default-400 mb-7.5 flex items-center gap-3">
        <span className="text-primary text-xl font-bold">
          ฿{price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </h3>

      {/* รายละเอียดสินค้า — empty-state ถ้าไม่มีข้อมูล */}
      <h5 className="text-default-400 mb-2.5 text-xs uppercase">รายละเอียดสินค้า:</h5>
      {description ? (
        <p className="mb-5 whitespace-pre-line">{description}</p>
      ) : (
        <p className="mb-5 text-default-400 italic text-sm">ไม่มีรายละเอียดสินค้า</p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mt-6">
        <Link
          href={`/seller/products/${id}/edit`}
          className="btn bg-primary text-white hover:bg-primary-hover inline-flex items-center gap-1.5"
        >
          <Icon icon="pencil" className="text-base" />
          แก้ไขสินค้า
        </Link>
        <DeleteProductButton productId={id} />
      </div>
    </>
  )
}

export default ProductDetails
