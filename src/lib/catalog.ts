import type { Database } from '../types/supabase'

export const LEBANON_REGIONS = [
  'Beirut',
  'Mount Lebanon',
  'North',
  'South',
  'Bekaa',
  'Nabatieh',
  'Akkar',
  'Baalbek-Hermel',
] as const

export type LebanonRegion = typeof LEBANON_REGIONS[number]

export type ProductCategory = Database['public']['Enums']['product_category']
export type ProductCondition = Database['public']['Enums']['product_condition']

export const CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = [
  { value: 'tops',        label: 'Tops' },
  { value: 'bottoms',     label: 'Bottoms' },
  { value: 'dresses',     label: 'Dresses' },
  { value: 'outerwear',   label: 'Outerwear' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'shoes',       label: 'Shoes' },
]

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  tops:        'Tops',
  bottoms:     'Bottoms',
  dresses:     'Dresses',
  outerwear:   'Outerwear',
  accessories: 'Accessories',
  shoes:       'Shoes',
}

export const CONDITION_OPTIONS: { value: ProductCondition; label: string }[] = [
  { value: 'brand_new', label: 'Brand New' },
  { value: 'thrifted',  label: 'Thrifted' },
]

export const CONDITION_LABEL: Record<ProductCondition, string> = {
  brand_new: 'Brand New',
  thrifted:  'Thrifted',
}
