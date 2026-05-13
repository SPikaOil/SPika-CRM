export interface Product {
  sku: string
  name: string
  default_price: number
}

export const SPIKA_PRODUCTS: Product[] = [
  { sku: 'oil-100ml',            name: 'SPika Oil - 100ml',                  default_price: 19.50 },
  { sku: 'oil-50ml',             name: 'SPika Oil - 50ml',                   default_price: 14.50 },
  { sku: 'oil-30ml-table',       name: 'SPika Oil - 30ml (Table Version)',    default_price: 11.50 },
  { sku: 'spika2go-5ml',         name: 'SPika2Go - 5ml',                     default_price:  6.00 },
  { sku: 'spika2go-3ml',         name: 'SPika2Go - 3ml',                     default_price:  5.00 },
  { sku: 'spika2go-5ml-sample',  name: 'SPika2Go - 5ml (Free Samples)',      default_price:  0.00 },
  { sku: 'oil-30ml-table-sample',name: 'SPika Oil - 30ml (Table Samples)',   default_price:  0.00 },
]
