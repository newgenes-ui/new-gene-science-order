export interface OrderItem {
  productId: string;
  productCode: string;
  productName: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderDate: string;
  orderDateTime: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  ordererName: string;
  ordererPhone: string;
  ordererEmail: string;
  items: OrderItem[];
  otherRequest: string;
  totalAmount: number;
  status: 'pending' | 'payment_waiting' | 'paid' | 'processing' | 'shipped';
  paymentMethod: 'bank_transfer';
  depositName?: string;
}

const STORAGE_KEY = 'ngs_orders';

export function getOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOrder(order: Order): void {
  const orders = getOrders();
  orders.push(order);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function updateOrderStatus(orderId: string, status: Order['status']): void {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx].status = status;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }
}

export function getOrdersByDateRange(from: string, to: string): Order[] {
  const orders = getOrders();
  return orders.filter(o => o.orderDate >= from && o.orderDate <= to);
}

export function generateOrderId(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `NGS-${ymd}-${rand}`;
}

export const STATUS_LABELS: Record<Order['status'], string> = {
  pending: '주문접수',
  payment_waiting: '입금대기',
  paid: '입금확인',
  processing: '처리중',
  shipped: '출고완료',
};

export const STATUS_COLORS: Record<Order['status'], string> = {
  pending: '#f59e0b',
  payment_waiting: '#3b82f6',
  paid: '#10b981',
  processing: '#8b5cf6',
  shipped: '#2D5A47',
};
