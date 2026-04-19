// Firestoreの `products` コレクションのドキュメント型
export interface Product {
  shop_domain: string;
  sku: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DRAFT';
  inventory: number;
  updated_at: Date;
}

// Firestoreの `orders` コレクションのドキュメント型
export interface Order {
  shop_domain: string;
  createdAt_sku: string;
  order_id: string;
  order_name: string;
  sku: string;
  quantity: number;
  status: 'FULFILLED' | 'UNFULFILLED';
  tracking_number?: string;
  updated_at: Date;
}
