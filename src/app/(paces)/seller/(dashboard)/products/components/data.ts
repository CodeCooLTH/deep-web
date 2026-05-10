export type ProductRow = {
  id: string
  name: string
  description: string
  image: string
  price: number
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION'
  isActive: boolean
  totalSold: number
  reviews: number
  rating: number
}
