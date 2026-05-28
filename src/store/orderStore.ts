import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface OrderItem {
  productId: string;
  productCode: string;
  productName: string;
  spec: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  remarks?: string;
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
  quoteAmount?: number;
}

const STORAGE_KEY = 'ngs_orders';

// ─── localStorage 기본 함수 ─────────────────────────────────────
export function getOrders(): Order[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw !== '[]') {
      const parsed = JSON.parse(raw) as Order[];
      return parsed.map(o => {
        const totalAmount = Number(o.totalAmount || 0);
        let subtotalAmount = Number(o.subtotalAmount || 0);
        let vatAmount = Number(o.vatAmount || 0);

        // 공급가액이 합계와 같고 부가세가 0이면 잘못된 데이터로 간주하고 역산
        if (totalAmount > 0 && vatAmount === 0 && (subtotalAmount === totalAmount || subtotalAmount === 0)) {
          subtotalAmount = Math.round(totalAmount / 1.1);
          vatAmount = totalAmount - subtotalAmount;
        }
        
        return { 
          ...o, 
          subtotalAmount: subtotalAmount || 0, 
          vatAmount: vatAmount || 0,
          totalAmount: totalAmount || 0
        };
      });
    }
    
    // Seed mock data for local demonstration (matching the live deployed database screenshot)
    const mockData: Order[] = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockData));
    return mockData;
  } catch {
    return [];
  }
}

export async function saveOrder(order: Order): Promise<boolean> {
  // 1) localStorage에 저장 (즉시 반영)
  const orders = getOrders();
  orders.push(order);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));

  // 2) Supabase에도 저장 (완료될 때까지 대기)
  try {
    const success = await saveOrderToSupabase(order);
    return success;
  } catch (e) {
    console.error('Save to Supabase failed:', e);
    return false;
  }
}

export async function updateOrderStatus(orderId: string, status: Order['status']): Promise<boolean> {
  // 1) localStorage 업데이트
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  let updatedOtherRequest = '';
  if (idx !== -1) {
    orders[idx].status = status;
    if (status === 'shipped') {
      const today = new Date();
      const kstDate = new Date(today.getTime() + (9 * 60 * 60 * 1000));
      const todayStr = kstDate.toISOString().slice(0, 10);
      
      let currentReq = orders[idx].otherRequest || '';
      currentReq = currentReq.replace(/\[납품완료:\d{4}-\d{2}-\d{2}\]/g, '').trim();
      currentReq = currentReq ? `${currentReq} [납품완료:${todayStr}]` : `[납품완료:${todayStr}]`;
      orders[idx].otherRequest = currentReq;
      updatedOtherRequest = currentReq;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }
  
  // 2) Supabase 업데이트
  try {
    if (isSupabaseConfigured && supabase) {
      const updates: any = { status };
      if (status === 'shipped') {
        try {
          const { data: dbOrder } = await supabase.from('orders').select('other_request').eq('id', orderId).single();
          let dbReq = (dbOrder as any)?.other_request || '';
          dbReq = dbReq.replace(/\[납품완료:\d{4}-\d{2}-\d{2}\]/g, '').trim();
          
          const today = new Date();
          const kstDate = new Date(today.getTime() + (9 * 60 * 60 * 1000));
          const todayStr = kstDate.toISOString().slice(0, 10);
          dbReq = dbReq ? `${dbReq} [납품완료:${todayStr}]` : `[납품완료:${todayStr}]`;
          updates.other_request = dbReq;
        } catch (dbErr) {
          console.warn('Failed to fetch other_request from Supabase, using local value', dbErr);
          if (updatedOtherRequest) {
            updates.other_request = updatedOtherRequest;
          }
        }
      }
      await updateOrderInSupabase(orderId, updates);
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
    orders[idx].status = 'order_requested';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }
  
  // 2) Supabase 업데이트
  try {
    if (isSupabaseConfigured && supabase) {
      await updateOrderInSupabase(orderId, { 
        status: 'order_requested'
      });
    }
    return true;
  } catch (e) {
    console.error('Supabase convert failed:', e);
    throw e;
  }
}

/** 명세서 발행 상태를 서버(Supabase)에 동기화 */
export async function markOrdersAsInvoicedInSupabase(orderIds: string[]): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const results = await Promise.all(orderIds.map(async (id) => {
      const { data: order } = await supabase.from('orders').select('other_request').eq('id', id).single();
      const currentReq = (order as any)?.other_request || '';
      
      if (!currentReq.includes('[명세서발행]')) {
        const updatedReq = currentReq ? `${currentReq} [명세서발행]` : '[명세서발행]';
        // updateOrderInSupabase가 정의되어 있다고 가정 (라인 101 참고)
        const { error } = await supabase.from('orders').update({ other_request: updatedReq }).eq('id', id);
        return !error;
      }
      return true;
    }));
    
    return results.every(r => r === true);
  } catch (e) {
    console.error('Failed to sync invoice status to Supabase:', e);
    return false;
  }
}

export async function updateQuoteDetails(orderId: string, items: OrderItem[], subtotal: number, vat: number, total: number): Promise<boolean> {
  // 1) localStorage 업데이트
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx !== -1) {
    orders[idx].items = items;
    orders[idx].subtotalAmount = subtotal;
    orders[idx].vatAmount = vat;
    orders[idx].totalAmount = total;
    orders[idx].quoteAmount = total;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }
  
  // 2) Supabase 업데이트
  try {
    if (isSupabaseConfigured && supabase) {
      const updateData: any = { 
        items: items,
        subtotal_amount: subtotal,
        vat_amount: vat,
        total_amount: total,
        quote_amount: total
      };

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);
      
      if (error) {
        console.warn('1차 업데이트 실패, 컬럼 확인 후 재시도...', error.message);
        
        // 컬럼 부재 오류인 경우 필수 컬럼으로만 재시도
        if (error.message.includes('column') || error.code === 'PGRST204' || error.code === '42703') {
          const fallbackData = {
            items: items,
            total_amount: total
          };
          const { error: fallbackError } = await supabase
            .from('orders')
            .update(fallbackData)
            .eq('id', orderId);
          
          if (fallbackError) throw fallbackError;
        } else {
          throw error;
        }
      }
    }
    return true;
  } catch (e) {
    console.error('Supabase quote details update failed:', e);
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

export async function generateOrderId(): Promise<string> {
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
  const todayPrefix = `NGS-${ymd}-`;

  // 1순위: Supabase 서버에서 오늘 가장 높은 번호 가져오기
  let maxSuffix = 0;
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('orders')
        .select('id')
        .like('id', `${todayPrefix}%`);
      
      if (data && data.length > 0) {
        const suffixes = data.map(o => {
          const parts = o.id.split('-');
          return parseInt(parts[parts.length - 1]) || 0;
        });
        maxSuffix = Math.max(...suffixes);
      }
    } catch (e) {
      console.warn('Supabase ID fetch failed, falling back to local');
    }
  }

  // 2순위: 로컬 데이터와 비교하여 더 높은 번호 선택
  const localOrders = getOrders();
  const localTodayOrders = localOrders.filter(o => o.id.startsWith(todayPrefix));
  if (localTodayOrders.length > 0) {
    const localSuffixes = localTodayOrders.map(o => {
      const parts = o.id.split('-');
      // NGS-YYYYMMDD-X 형식에서 X 추출 (마지막에서 두 번째일 수도 있음 - 타임스탬프 추가 전)
      const lastPart = parts[parts.length - 1];
      return parseInt(lastPart) || 0;
    });
    maxSuffix = Math.max(maxSuffix, ...localSuffixes);
  }
  
  // 3순위: 절대 중복 방지를 위한 시간 기반 접미사 추가 (HHMMSS)
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const timeSuffix = `${hh}${min}${ss}`;
  
  return `${todayPrefix}${maxSuffix + 1}-${timeSuffix}`;
}

export const STATUS_LABELS: Record<Order['status'], string> = {
  pending: '접수완료',
  payment_waiting: '미수금',
  paid: '입금확인',
  processing: '견적전송',
  shipped: '납품완료',
  cancelled: '주문취소',
  order_requested: '준비중',
};

export const STATUS_COLORS: Record<Order['status'], string> = {
  pending: '#3b82f6',        // 파란색 (접수완료)
  payment_waiting: '#f97316', // 오렌지 (미수금)
  paid: '#10b981',           // 녹색 (입금확인)
  processing: '#6366f1',      // 인디고 (견적전송/발주요청)
  shipped: '#3b82f6',        // 파란색 (납품완료)
  cancelled: '#ef4444',       // 빨간색 (주문취소)
  order_requested: '#f59e0b', // 호박색 (준비중)
};

// ─── Supabase 연동 함수 ─────────────────────────────────────────

async function saveOrderToSupabase(order: Order): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    console.warn('⚠️ Supabase가 설정되지 않았습니다. 로컬 모드로 동작합니다.');
    return false; // 거짓 성공 방지
  }

  // DB에 실제로 존재하는 확실한 컬럼만 선별하여 전송
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
    order_type: order.orderType || (order.items && order.items.length > 0 ? 'order' : 'quote')
    // quote_amount 컬럼은 DB에 추가되었으므로 필요시 포함 가능
  };

  try {
    const { error } = await supabase.from('orders').insert(orderData);
    if (error) {
      console.warn('1차 저장 실패, 컬럼 확인 후 재시도...', error.message);
      
      // 컬럼 부재 오류인 경우 필수 컬럼으로만 재시도 (Fallback)
      if (error.message.includes('column') || error.code === 'PGRST204' || error.code === '42703') {
        const fallbackData = {
          id: order.id,
          order_date: order.orderDate,
          order_date_time: order.orderDateTime,
          client_id: order.clientId,
          client_name: order.clientName,
          orderer_name: order.ordererName,
          orderer_phone: order.ordererPhone,
          items: order.items,
          total_amount: order.totalAmount,
          status: order.status,
          order_type: order.orderType || 'order'
        };
        const { error: fallbackError } = await supabase.from('orders').insert(fallbackData);
        if (fallbackError) {
          console.error('Final Supabase Insert Error:', fallbackError.message);
          return false;
        }
        return true;
      }
      return false;
    }
    console.log('✅ Supabase 저장 성공:', order.id);
    return true;
  } catch (e: any) {
    console.error('Supabase Connection Error:', e.message);
    return false;
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
export async function getOrdersFromSupabase(): Promise<Order[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('order_date_time', { ascending: false });

    if (error) {
      console.error('Supabase 조회 오류:', error.message);
      return null;
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
      subtotalAmount: (Number(row.total_amount || 0) > 0 && Number(row.subtotal_amount || 0) === Number(row.total_amount || 0) && Number(row.vat_amount || 0) === 0) 
        ? Math.round(Number(row.total_amount || 0) / 1.1) 
        : (Number(row.subtotal_amount || 0) || Math.round(Number(row.total_amount || 0) / 1.1)),
      vatAmount: (Number(row.total_amount || 0) > 0 && Number(row.subtotal_amount || 0) === Number(row.total_amount || 0) && Number(row.vat_amount || 0) === 0)
        ? (Number(row.total_amount || 0) - Math.round(Number(row.total_amount || 0) / 1.1))
        : (Number(row.vat_amount || 0) || (Number(row.total_amount || 0) - (Number(row.subtotal_amount || 0) || Math.round(Number(row.total_amount || 0) / 1.1)))),
      totalAmount: Number(row.total_amount || 0),
      status: row.status,
      paymentMethod: row.payment_method,
      orderType: row.order_type === 'order' 
        ? 'order' 
        : (row.order_type === 'quote' 
            ? 'quote' 
            : (row.items && Array.isArray(row.items) && row.items.length > 0 ? 'order' : 'quote')),
      quoteAmount: row.quote_amount,
    }));
  } catch (e) {
    console.error('Supabase 조회 실패:', e);
    return null;
  }
}

/** Supabase 실시간 변경 구독 */
export function subscribeToOrders(callback: (payload: any) => void) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const channel = supabase
    .channel('public:orders')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      (payload) => {
        console.log('🔔 실시간 데이터 변경 감지:', payload);
        callback(payload);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
