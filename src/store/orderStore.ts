import { supabase, isSupabaseConfigured } from '../lib/supabase';

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

// ─── localStorage 기본 함수 ─────────────────────────────────────
export function getOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOrder(order: Order): void {
  // 1) localStorage에 저장 (즉시 반영)
  const orders = getOrders();
  orders.push(order);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));

  // 2) Supabase에도 저장 (비동기, 실패해도 localStorage에는 이미 저장됨)
  saveOrderToSupabase(order);
}

export function updateOrderStatus(orderId: string, status: Order['status']): void {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx].status = status;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    // Supabase에도 상태 업데이트
    updateOrderStatusInSupabase(orderId, status);
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

// ─── Supabase 연동 함수 ─────────────────────────────────────────

async function saveOrderToSupabase(order: Order): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    console.warn('⚠️ Supabase가 설정되지 않았습니다. 로컬에만 저장됩니다.');
    return;
  }
  try {
    const { error } = await supabase.from('orders').insert({
      id: order.id,
      order_date: order.orderDate,
      order_date_time: order.orderDateTime,
      client_id: order.clientId,
      client_name: order.clientName,
      client_email: order.clientEmail,
      orderer_name: order.ordererName,
      orderer_phone: order.ordererPhone,
      orderer_email: order.ordererEmail,
      items: order.items,
      other_request: order.otherRequest,
      total_amount: order.totalAmount,
      status: order.status,
      payment_method: order.paymentMethod,
    });
    if (error) {
      console.error('Supabase 저장 오류:', error.message);
      alert(`DB 저장 실패: ${error.message}\n관리자에게 문의해 주세요.`);
    } else {
      console.log('✅ Supabase 저장 완료:', order.id);
    }
  } catch (e: any) {
    console.error('Supabase 연결 실패:', e);
    alert(`DB 연결 실패: ${e.message || '알 수 없는 오류'}`);
  }
}

async function updateOrderStatusInSupabase(orderId: string, status: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('orders').update({ status }).eq('id', orderId);
  } catch (e) {
    console.error('Supabase 상태 업데이트 실패:', e);
  }
}

/** Supabase에서 모든 주문 로드 (관리자 대시보드용) */
export async function getOrdersFromSupabase(): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('order_date_time', { ascending: false });

    if (error) {
      console.error('Supabase 조회 오류:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      orderDate: row.order_date,
      orderDateTime: row.order_date_time,
      clientId: row.client_id,
      clientName: row.client_name,
      clientEmail: row.client_email,
      ordererName: row.orderer_name,
      ordererPhone: row.orderer_phone,
      ordererEmail: row.orderer_email,
      items: row.items || [],
      otherRequest: row.other_request || '',
      totalAmount: row.total_amount,
      status: row.status,
      paymentMethod: row.payment_method,
    }));
  } catch (e) {
    console.error('Supabase 조회 실패:', e);
    return [];
  }
}
