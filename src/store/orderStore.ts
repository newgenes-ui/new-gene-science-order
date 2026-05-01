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
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  status: 'pending' | 'payment_waiting' | 'paid' | 'processing' | 'shipped' | 'cancelled' | 'order_requested';
  paymentMethod: 'bank_transfer';
  depositName?: string;
  orderType: 'order' | 'quote';
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

export async function updateOrderStatus(orderId: string, status: Order['status']): Promise<boolean> {
  // 1) localStorage 업데이트
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx].status = status;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }
  
  // 2) Supabase 업데이트
  try {
    if (isSupabaseConfigured && supabase) {
      await updateOrderInSupabase(orderId, { status });
    }
    return true;
  } catch (e) {
    console.error('Supabase update failed:', e);
    throw e;
  }
}

export async function convertQuoteToOrder(orderId: string): Promise<boolean> {
  // 1) localStorage 업데이트
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx].status = 'pending';
    orders[idx].orderType = 'order';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }
  
  // 2) Supabase 업데이트
  try {
    if (isSupabaseConfigured && supabase) {
      await updateOrderInSupabase(orderId, { status: 'pending', order_type: 'order' });
    }
    return true;
  } catch (e) {
    console.error('Supabase convert failed:', e);
    throw e;
  }
}

export function deleteOrder(orderId: string): void {
  // 1) localStorage에서 제거
  const orders = getOrders();
  const filtered = orders.filter(o => o.id !== orderId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));

  // 2) Supabase에서 제거
  deleteOrderFromSupabase(orderId);
}

export function getOrdersByDateRange(from: string, to: string): Order[] {
  const orders = getOrders();
  return orders.filter(o => o.orderDate >= from && o.orderDate <= to);
}

export function generateOrderId(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Seoul'
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  const ymd = `${y}${m}${d}`;
  
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `NGS-${ymd}-${rand}`;
}

export const STATUS_LABELS: Record<Order['status'], string> = {
  pending: '주문완료',
  payment_waiting: '입금대기',
  paid: '입금확인',
  processing: '처리중',
  shipped: '납품완료',
  cancelled: '주문취소',
  order_requested: '주문요청',
};

export const STATUS_COLORS: Record<Order['status'], string> = {
  pending: '#f97316',        // 오렌지 (주문완료)
  payment_waiting: '#eab308', // 노란색 (입금대기)
  paid: '#10b981',           // 녹색 (입금확인)
  processing: '#8b5cf6',      // 보라 (처리중)
  shipped: '#3b82f6',        // 파란색 (납품완료)
  cancelled: '#ef4444',       // 빨간색 (주문취소)
  order_requested: '#2563eb', // 파랑 (발주완료)
};

// ─── Supabase 연동 함수 ─────────────────────────────────────────

async function saveOrderToSupabase(order: Order): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    console.warn('⚠️ Supabase가 설정되지 않았습니다. 로컬에만 저장됩니다.');
    return;
  }

  const orderData = {
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
    subtotal_amount: order.subtotalAmount,
    vat_amount: order.vatAmount,
    total_amount: order.totalAmount,
    status: order.status,
    payment_method: order.paymentMethod,
    order_type: order.orderType,
  };

  try {
    const { error } = await supabase.from('orders').insert(orderData);
    
    if (error) {
      console.error('Supabase 저장 1차 시도 실패:', error.message);
      
      // 컬럼이 없어서 발생하는 오류인 경우, 필수 컬럼만으로 재시도
      if (error.message.includes('column') || error.code === '42703') {
        console.log('⚠️ DB 스키마 불일치 감지. 신규 컬럼 제외하고 재시도합니다...');
        const fallbackData = {
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
        };
        
        const { error: fallbackError } = await supabase.from('orders').insert(fallbackData);
        if (fallbackError) {
          console.error('Supabase 저장 2차 시도 실패:', fallbackError.message);
        } else {
          console.log('✅ Supabase 저장 성공 (기본 컬럼)');
        }
      }
    } else {
      console.log('✅ Supabase 저장 완료:', order.id);
    }
  } catch (e: any) {
    console.error('Supabase 연결 실패:', e);
  }
}

async function updateOrderInSupabase(orderId: string, updates: any): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId);
      
    if (error) {
      throw new Error(`Supabase 업데이트 실패: ${error.message} (코드: ${error.code})`);
    }
    console.log('✅ Supabase 업데이트 완료:', orderId, updates);
  } catch (e: any) {
    console.error('Supabase 업데이트 실패:', e);
    throw e;
  }
}

async function deleteOrderFromSupabase(orderId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) {
      console.error('Supabase 삭제 오류:', error.message);
      alert(`DB 삭제 실패: ${error.message}\nSupabase RLS 설정에서 DELETE 권한을 확인해주세요.`);
    } else {
      console.log('✅ Supabase 삭제 완료:', orderId);
    }
  } catch (e: any) {
    console.error('Supabase 삭제 실패:', e);
    alert(`DB 연결 실패: ${e.message || '알 수 없는 오류'}`);
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
      subtotalAmount: row.subtotal_amount || row.total_amount,
      vatAmount: row.vat_amount || 0,
      totalAmount: row.total_amount,
      status: row.status,
      paymentMethod: row.payment_method,
      orderType: row.order_type === 'order' 
        ? 'order' 
        : (row.order_type === 'quote' 
            ? 'quote' 
            : (row.items && Array.isArray(row.items) && row.items.length > 0 ? 'order' : 'quote')),
    }));
  } catch (e) {
    console.error('Supabase 조회 실패:', e);
    return [];
  }
}
