import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Search, Plus, Minus, ShoppingCart, FileText,
  User, Phone, Mail, Building2, MessageSquare, ChevronDown, ChevronUp, X, CreditCard, Copy, Clock, CheckCircle2, RefreshCw, Eye
} from 'lucide-react';
import { PRODUCTS, CLIENTS, NGS_EMAIL, NGS_BANK } from '../data/products';
import { Order, OrderItem, generateOrderId, saveOrder, getOrders, getOrdersFromSupabase, updateOrderStatus, convertQuoteToOrder, STATUS_LABELS, subscribeToOrders } from '../store/orderStore';
import emailjs from '@emailjs/browser';

// ─── EmailJS 설정 (Vercel 환경변수로 관리) ───────────────────────
const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || '';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || '';
// ─── 백업용 Google Apps Script 설정 ───────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby2VTQXY6niWG4_agJULS6NUUGQIjlwXxhzld9LfwMo_22evJbjwrDtE697Oze5iV1rog/exec";
// ─────────────────────────────────────────────────────────────────
export default function OrderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isBannerEnlarged, setIsBannerEnlarged] = useState(false);

  useEffect(() => {
    if (EMAILJS_PUBLIC_KEY) {
      emailjs.init(EMAILJS_PUBLIC_KEY);
    }
  }, []);

  const clientId = (searchParams.get('client') || 'boryung').toLowerCase();
  const shouldReset = searchParams.get('reset') === 'true';

  useEffect(() => {
    if (shouldReset) {
      localStorage.removeItem('ngs_tax_requested');
      localStorage.removeItem('ngs_statement_requested');
      localStorage.removeItem('ngs_last_statement_total');
      localStorage.removeItem('ngs_last_statement_ids');
      localStorage.removeItem('ngs_statement_history');
      setStatementRequestedOrderIds([]);
      setSelectedOrderIds([]);
      alert('연습용 발행 요청 기록이 모두 초기화되었습니다!');
      window.location.href = `/?client=${clientId}`; 
    }
  }, [shouldReset]);

  const handleResetPractice = () => {
    if (window.confirm('모든 발행 요청 기록과 선택 내역을 초기화하시겠습니까?')) {
      localStorage.removeItem('ngs_tax_requested');
      localStorage.removeItem('ngs_statement_requested');
      localStorage.removeItem('ngs_last_statement_total');
      localStorage.removeItem('ngs_last_statement_ids');
      localStorage.removeItem('ngs_statement_history');
      localStorage.removeItem('ngs_orders');
      setStatementRequestedOrderIds([]);
      setSelectedOrderIds([]);
      alert('초기화되었습니다. 다시 연습해보세요!');
      window.location.reload(); 
    }
  };

  // clientData를 찾되, 없을 경우 (주)보령제약을 기본으로 사용
  const clientData = useMemo(() => {
    return CLIENTS.find(c => c.id === clientId) || CLIENTS.find(c => c.id === 'boryung') || CLIENTS[0];
  }, [clientId]);

  // 모든 업체전용 페이지를 전문 모드(베르티스 스타일)로 통합 적용 (항상 활성화)
  const isSpecialClient = true;
  const isBertis = true; 

  // 빠른 선택을 위한 주문자 정보 리스트
  const quickSelectOrderers = [
    { name: '김기환', email: 'khkimjhs@naver.com', phone: '010-5882-4997' },
    { name: '양유지', email: 'newgenesci@gmail.com', phone: '010-7169-8805' },
    { name: '나혜원', email: 'ngs.202403@gmail.com', phone: '010-9915-5974' },
  ];

  const [clientName, setClientName] = useState(clientData.name);
  const [ordererName, setOrdererName] = useState('');
  const [ordererPhone, setOrdererPhone] = useState('');
  const [ordererEmail, setOrdererEmail] = useState('');



  const handlePlaceOrderFromQuote = async (order: Order) => {
    if (!window.confirm('해당 견적 내역으로 발주를 진행하시겠습니까?')) return;

    setIsSubmitting(true);
    try {
      let finalItemsText = order.items.length > 0
        ? order.items.map(i =>
            `• ${i.productName} (${i.productCode}) - ${i.spec} / ${i.quantity}개 / ₩${i.subtotal.toLocaleString()} (부가세 별도)`
          ).join('\n')
        : '(선택 제품 없음)';

      if (order.otherRequest) {
        finalItemsText = `[상세 요청 내역]\n${order.otherRequest}${finalItemsText === '(선택 제품 없음)' ? '' : '\n\n[선택 제품 목록]\n' + finalItemsText}`;
      }

      const emailParams = {
        order_title:    `[(주)뉴진사이언스 발주접수]`,
        order_type_text: '발주접수 (견적전환)',
        detail_label:   '발주 상세 내역',
        order_id:       order.id,
        order_date:     order.orderDate,
        client_name:    order.clientName,
        orderer_name:   order.ordererName,
        orderer_phone:  order.ordererPhone,
        orderer_email:  order.ordererEmail || '(미입력)',
        customer_name:  order.ordererName, // 템플릿 수신자 필드 대응
        from_name:      order.ordererName,
        contact_number: order.ordererPhone,
        reply_to:       order.ordererEmail || '(미입력)',
        items_text:     finalItemsText,
        subtotal_amount: `₩${order.subtotalAmount.toLocaleString()} (부가세 별도)`,
        vat_amount:      `₩${order.vatAmount.toLocaleString()}`,
        total_amount:   `₩${order.totalAmount.toLocaleString()}`,
        other_request:  order.otherRequest || '없음',
        to_email:       `${NGS_EMAIL}, ${order.ordererEmail || order.clientEmail}`,
        ngs_email:      NGS_EMAIL,
        client_email:   order.ordererEmail || order.clientEmail,
      };

      if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
        // 1. 본사 발송 (고객사명 제목)
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          ...emailParams,
          order_title: `[${order.clientName} 발주접수 (견적전환)]`,
          info_label: '발주자 정보',
          greeting: '관리자님, 안녕하세요 (견적에서 발주로 전환되었습니다).',
          to_email: NGS_EMAIL,
          reply_to: order.ordererEmail || order.clientEmail || NGS_EMAIL,
        }, EMAILJS_PUBLIC_KEY);

        // EmailJS API 연속 호출 시 누락 방지를 위한 1초 대기
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. 고객 발송 (뉴진사이언스 제목)
        const targetEmail = order.ordererEmail || order.clientEmail;
        if (targetEmail && targetEmail.includes('@')) {
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            ...emailParams,
            order_title: `[(주)뉴진사이언스 발주접수]`,
            to_email: targetEmail,
          }, EMAILJS_PUBLIC_KEY);
        }
      }
      
      alert('발주 요청이 완료되었습니다. 감사합니다!');
      // 3. 상태 업데이트 및 주문으로 변환
      const success = await convertQuoteToOrder(order.id);
      if (success) {
        // 로컬 상태 업데이트 - 성격(quote)을 유지해야 납품완료 로직이 작동함
        setUserOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'order_requested' } : o));
      }
    } catch (error: any) {
      console.error('Place order from quote error:', error);
      alert(`발주 요청 중 오류가 발생했습니다.\n상세: ${error.message || '알 수 없는 오류'}\n(Supabase RLS 권한을 확인해 주세요)`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClientPaymentConfirm = async (order: Order) => {
    if (!window.confirm('입금 또는 결제를 완료하셨습니까? 관리자가 확인 후 승인해 드립니다.')) return;
    try {
      const success = await updateOrderStatus(order.id, 'paid');
      if (success) {
        setUserOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'paid' } : o));
        alert('결제 완료 알림이 전송되었습니다.');
      } else {
        alert('DB 업데이트에 실패했습니다. 다시 시도해 주세요.');
      }
    } catch (error) {
      console.error('Payment confirm error:', error);
      alert('오류가 발생했습니다.');
    }
  };

  // clientData가 바뀌면 입력 필드 자동 채우기 (모바일 인식 지연 방지)

  useEffect(() => {
    if (clientData) {
      setClientName(clientData.name);
      // 주문자 정보는 사용자가 직접 입력하거나 퀵 버튼을 누를 때까지 비워둡니다.
      setOrdererName('');
      setOrdererPhone('');
      setOrdererEmail('');
    }
  }, [clientData]);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [otherRequest, setOtherRequest] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [tempSearch, setTempSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ 'AG Tip': true, '파이펫': true, '튜브': true, '랙': true });
  const [activeTab, setActiveTab] = useState<'quote' | 'order' | 'payment'>('order');
  const [taxEmail, setTaxEmail] = useState('');
  const [isStatementSubmitting, setIsStatementSubmitting] = useState(false);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [historyTab, setHistoryTab] = useState<'order' | 'quote'>('order');
  const [dateRange, setDateRange] = useState({
    start: (() => {
      const now = new Date();
      const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      kst.setDate(kst.getDate() - 30);
      return kst.toISOString().slice(0, 10);
    })(),
    end: (() => {
      const now = new Date();
      const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
      return kst.toISOString().slice(0, 10);
    })()
  });
  const [appliedRange, setAppliedRange] = useState(dateRange);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isItemCollapsed, setIsItemCollapsed] = useState<Record<string, boolean>>({});
  
  // 명세서 발행 요청 방지를 위한 로컬 저장소 상태

  const [statementRequestedOrderIds, setStatementRequestedOrderIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('ngs_statement_requested');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const markInvoiceRequested = (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    
    const newStatement = Array.from(new Set([...statementRequestedOrderIds, ...orderIds]));
    setStatementRequestedOrderIds(newStatement);
    localStorage.setItem('ngs_statement_requested', JSON.stringify(newStatement));
  };

  const selectedTotalAmount = useMemo(() => {
    return userOrders
      .filter(o => selectedOrderIds.includes(o.id))
      .reduce((sum, o) => sum + o.totalAmount, 0);
  }, [selectedOrderIds, userOrders]);

  // 거래명세서 발행 요청
  const handleStatementRequest = async () => {
    if (!taxEmail) {
      alert('명세서를 받으실 이메일 주소를 입력해주세요.');
      return;
    }
    if (selectedOrderIds.length === 0) {
      alert('발행할 항목을 먼저 선택해주세요.');
      return;
    }

    if (!window.confirm(`선택하신 ${selectedOrderIds.length}건 (합계 ₩${selectedTotalAmount.toLocaleString()})의 거래명세서를 발행 요청하시겠습니까?`)) {
      return;
    }

    /* [중복 방지 잠시 해제] 
    const alreadyRequested = selectedOrderIds.filter(id => statementRequestedOrderIds.includes(id));
    if (alreadyRequested.length > 0) {
      alert(`⚠️ 선택하신 항목 중 이미 명세서가 발행(요청)된 내역이 포함되어 있습니다.\n(중복 발행 불가)`);
      return;
    }
    */

    // [DEBUG] 전송 결과 추적
    let gasStatus = '대기';
    let emailjsNgsStatus = '대기';
    let emailjsCustomerStatus = '대기';

    setIsStatementSubmitting(true);
    try {
      const selectedOrders = userOrders.filter(o => selectedOrderIds.includes(o.id));
      const firstOrder = selectedOrders[0];
      
      // 상단 입력칸이 비어있을 경우 선택한 내역에서 정보를 추출 (이재명 -> 김기환 보정 포함)
      const finalName = ordererName || (firstOrder?.ordererName === '이재명' ? '김기환' : firstOrder?.ordererName) || '김기환';
      const finalPhone = ordererPhone || (firstOrder?.ordererName === '이재명' ? '010-5882-4997' : firstOrder?.ordererPhone) || '010-5882-4997';
      const finalEmail = taxEmail || firstOrder?.ordererEmail || 'khkimjhs@naver.com';

      const viewerUrl = `https://new-gene-science-order.vercel.app/statement?ids=${selectedOrderIds.join(',')}`;
      const emailParams = {
        order_title: `[(주)뉴진사이언스 거래명세서 발행]`,
        order_type_text: '거래명세서 발행 요청',
        detail_label: '명세서 요청 내역',
        order_id: selectedOrderIds[0],
        order_date: new Date().toISOString().split('T')[0],
        client_name: clientName,
        orderer_name: finalName,
        orderer_phone: finalPhone,
        orderer_email: finalEmail,
        customer_name: finalName, // 템플릿 수신자 필드 대응
        items_text: `기관명: ${clientName}\n주문자: ${finalName}\n연락처: ${finalPhone}\n발행 이메일: ${finalEmail}\n\n▶ [공식 거래명세서 확인 및 인쇄]\n${viewerUrl}\n\n--------------------------\n[요약]\n${selectedOrders.map(o => {
          const itemsStr = o.items && o.items.length > 0 ? `${o.items[0].productName}${o.items.length > 1 ? ` 외 ${o.items.length - 1}건` : ''}` : '상세 참조';
          return `- ${o.id} / ${itemsStr} / ₩${o.totalAmount.toLocaleString()}`;
        }).join('\n')}`,
        from_name: finalName,
        contact_number: finalPhone,
        reply_to: finalEmail,
        ngs_email: NGS_EMAIL,
      };

      // ─── 1. GAS 발송 (백업) ───
      if (SCRIPT_URL) {
        try {
          await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailParams)
          });
          gasStatus = '✅ 성공';
        } catch (e) { gasStatus = '❌ 실패'; }
      }

      // ─── 2. EmailJS 발송 (주문 메일과 동일하게 본사+고객 발송) ───
      if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
        // [A] 본사 알림
        try {
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            ...emailParams,
            to_email: NGS_EMAIL,
          }, EMAILJS_PUBLIC_KEY);
          emailjsNgsStatus = '✅ 성공';
        } catch (e) { emailjsNgsStatus = '❌ 실패'; }
        
        await new Promise(r => setTimeout(r, 1000));

        // [B] 고객 알림 (김기환 님 등)
        if (finalEmail && finalEmail.includes('@')) {
          try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
              ...emailParams,
              to_email: finalEmail,
            }, EMAILJS_PUBLIC_KEY);
            emailjsCustomerStatus = '✅ 성공';
          } catch (e) { emailjsCustomerStatus = '❌ 실패'; }
        }
      } else {
        emailjsNgsStatus = '⚠️ 설정누락';
        emailjsCustomerStatus = '⚠️ 설정누락';
      }

      markInvoiceRequested(selectedOrderIds);
      alert(`거래명세서 발행 요청이 완료되었습니다!\n\n수신 이메일: ${finalEmail}`);
      setSelectedOrderIds([]); 
    } catch (error) {
      alert('요청 처리 중 오류가 발생했습니다.');
    } finally {
      setIsStatementSubmitting(false);
    }
  };


  // [자동 채우기 해제] 사용자 요청에 따라 초기에는 비워두고 체크박스 클릭 시에만 채웁니다.
  /*
  useEffect(() => {
    const staff = quickSelectOrderers.find(s => s.name === ordererName);
    if (staff) {
      setTaxEmail(staff.email);
    }
  }, [ordererName]);

  useEffect(() => {
    if (ordererEmail && !taxEmail) {
      setTaxEmail(ordererEmail);
    }
  }, [ordererEmail]);
  */

  // 발주 내역 로드 (베르티스 전용)
  const loadUserOrders = async () => {
    setIsOrdersLoading(true);
    try {
      // 1. 서버(Supabase) 데이터와 로컬(localStorage) 데이터를 모두 가져옴
      const remoteOrders = await getOrdersFromSupabase();
      const localOrders = getOrders();
      
      // 2. ID를 기준으로 중복을 제거하며 병합 (로컬 최신 데이터 우선)
      const mergedMap = new Map<string, Order>();
      
      // 로컬 데이터를 먼저 담기
      localOrders.forEach(o => mergedMap.set(o.id, o));
      
      // 서버 데이터를 병합하되, "진행도가 더 높은 상태"와 "더 큰 금액"을 유지하는 스마트 병합
      const statusRank: Record<string, number> = {
        'pending': 1,
        'payment_waiting': 2,
        'processing': 3,
        'order_requested': 4,
        'shipped': 5,
        'cancelled': 6
      };
      
      remoteOrders.forEach(remote => {
        const local = mergedMap.get(remote.id);
        if (!local) {
          mergedMap.set(remote.id, remote);
        } else {
          const rRank = statusRank[remote.status] || 0;
          const lRank = statusRank[local.status] || 0;
          
          const bestStatus = rRank >= lRank ? remote.status : local.status;
          const bestTotal = (remote.totalAmount || 0) > 0 ? remote.totalAmount : local.totalAmount;
          const bestQuote = (remote.quoteAmount || 0) > 0 ? remote.quoteAmount : local.quoteAmount;
          const bestItems = (remote.items && remote.items.length > 0) ? remote.items : local.items;

          mergedMap.set(remote.id, {
            ...local,
            ...remote,
            status: bestStatus,
            totalAmount: bestTotal,
            quoteAmount: bestQuote,
            items: bestItems
          });
        }
      });
      
      const all = Array.from(mergedMap.values());

      // 3. 업체별 필터링 (보령제약 및 데모 권한 강화)
      const visibleOrders = all.filter(o => 
        clientId === 'demo' || 
        clientId === 'boryung' ||
        o.clientId === clientId ||
        o.clientId === 'boryung' ||
        o.clientName?.includes('보령')
      );
      
      // 4. 최신순 정렬 (ID 기준 내림차순)
      const sortedOrders = visibleOrders.sort((a, b) => b.id.localeCompare(a.id));
      
      setUserOrders(sortedOrders);
    } catch (e) {
      console.error('Failed to load orders:', e);
      setUserOrders(getOrders());
    } finally {
      setIsOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'payment') {
      loadUserOrders();
      // Supabase 실시간 구독 (관리자 상태 변경 시 즉시 내역 갱신)
      const unsubscribe = subscribeToOrders(() => {
        loadUserOrders();
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const filteredUserOrders = useMemo(() => {
    const ordersOnly = userOrders.filter(o => {
      const type = (o.orderType || '').toLowerCase().trim();
      const status = (o.status || '').toLowerCase().trim();
      const isQuoteStatus = ['order_requested', 'processing'].includes(status);
      const isQuoteByAmount = Number(o.quoteAmount || 0) > 0;
      
      return type === 'order' && !isQuoteStatus && !isQuoteByAmount;
    });
    const quotesOnly = userOrders.filter(o => {
      const type = (o.orderType || '').toLowerCase().trim();
      const status = (o.status || '').toLowerCase().trim();
      const isQuoteStatus = ['order_requested', 'processing'].includes(status);
      const isQuoteByAmount = Number(o.quoteAmount || 0) > 0;
      
      return type === 'quote' || isQuoteStatus || isQuoteByAmount;
    });
    
    return (historyTab === 'order' ? ordersOnly : quotesOnly)
      .filter(o => 
        o.orderDate >= appliedRange.start && 
        o.orderDate <= appliedRange.end
      )
      .sort((a, b) => {
        const dateA = a.orderDateTime || a.orderDate;
        const dateB = b.orderDateTime || b.orderDate;
        return dateB.localeCompare(dateA) || b.id.localeCompare(a.id);
      });
  }, [userOrders, appliedRange, historyTab]);


  const categories = ['전체', ...Array.from(new Set(PRODUCTS.map(p => p.category)))];

  const filteredProducts = PRODUCTS.filter(p => {
    const matchCat = selectedCategory === '전체' || p.category === selectedCategory;
    const search = searchTerm.trim().toLowerCase();
    const matchSearch = !search || 
      p.name.toLowerCase().includes(search) || 
      p.code.toLowerCase().includes(search) ||
      p.spec.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  const cartItems = PRODUCTS.filter(p => (quantities[p.id] || 0) > 0);
  const cartCount = Object.values(quantities).reduce((s, v) => s + v, 0);
  const subtotalAmount = cartItems.reduce((s, p) => s + (p.price as number) * (quantities[p.id] || 0), 0);
  const vatAmount = Math.floor(subtotalAmount * 0.1);
  const totalAmount = subtotalAmount + vatAmount;

  const updateQty = (id: string, delta: number) => {
    setQuantities(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0 && !otherRequest.trim()) {
      alert('제품을 선택하거나 기타 요청사항을 입력해주세요.');
      return;
    }
    if (!ordererName || !ordererPhone) {
      alert('주문자 성함과 연락처를 입력해주세요.');
      return;
    }
    setIsSubmitting(true);

    const orderItems: OrderItem[] = cartItems.map(p => ({
      productId: p.id,
      productCode: p.code,
      productName: p.name,
      spec: p.spec,
      unitPrice: p.price,
      quantity: quantities[p.id] || 0,
      subtotal: p.price * (quantities[p.id] || 0),
    }));

    const now = new Date();
    const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul'
    });
    
    const parts = kstFormatter.formatToParts(now);
    const d = parts.find(p => p.type === 'day')?.value;
    const h = parts.find(p => p.type === 'hour')?.value;
    const mi = parts.find(p => p.type === 'minute')?.value;
    const s = parts.find(p => p.type === 'second')?.value;
    
    const y = parts.find(p => p.type === 'year')?.value;
    const mo = parts.find(p => p.type === 'month')?.value;
    
    const kstDateString = `${y}-${mo}-${d}`;
    const kstDateTimeString = `${y}-${mo}-${d}T${h}:${mi}:${s}`;

    const newId = await generateOrderId();
    const order: Order = {
      id: newId,
      orderDate: kstDateString,
      orderDateTime: kstDateTimeString,
      clientId,
      clientName,
      clientEmail: clientData.email,
      ordererName,
      ordererPhone: ordererPhone || clientData.phone || '',
      ordererEmail: ordererEmail || clientData.email || '',
      items: orderItems,
      otherRequest,
      subtotalAmount,
      vatAmount,
      totalAmount,
      status: 'pending',
      paymentMethod: 'bank_transfer',
      orderType: activeTab === 'quote' ? 'quote' : 'order',
    };

    console.log('Submitting order with status:', order.status);

    let finalItemsText = orderItems.length > 0
      ? orderItems.map(i =>
          `• ${i.productName} (${i.productCode}) - ${i.spec} / ${i.quantity}개 / ₩${i.subtotal.toLocaleString()} (부가세 별도)`
        ).join('\n')
      : '(선택 제품 없음)';

    // 견적 문의의 경우 상세 요청 사항이 있으면 상단에 추가
    if (activeTab === 'quote' && otherRequest) {
      finalItemsText = `[상세 요청 내역]\n${otherRequest}${finalItemsText === '(선택 제품 없음)' ? '' : '\n\n[선택 제품 목록]\n' + finalItemsText}`;
    }

    const emailParams = {
      order_title:    `[(주)뉴진사이언스 ${activeTab === 'quote' ? '견적접수' : '주문접수'}]`,
      order_type_text: activeTab === 'quote' ? '견적접수' : '주문접수',
      detail_label:   `${activeTab === 'quote' ? '견적' : '주문'} 상세 내역`,
      order_id:       order.id,
      order_date:     order.orderDate,
      client_name:    clientName,
      orderer_name:   ordererName,
      orderer_phone:  order.ordererPhone,
      orderer_email:  order.ordererEmail || '(미입력)',
      customer_name:  ordererName, // 템플릿 수신자 필드 대응
      // 사용자의 EmailJS 템플릿 변수명에 맞춤
      from_name:      ordererName,
      contact_number: order.ordererPhone,
      reply_to:       order.ordererEmail || '(미입력)',
      items_text:     finalItemsText,
      subtotal_amount: `₩${subtotalAmount.toLocaleString()} (부가세 별도)`,
      vat_amount:      `₩${vatAmount.toLocaleString()}`,
      total_amount:   `₩${totalAmount.toLocaleString()}`,
      other_request:  otherRequest || '없음',
      // 수신자 이메일 — 템플릿에서 {{to_email}} 변수로 사용
      to_email:       `${NGS_EMAIL}, ${order.ordererEmail}`,
      ngs_email:      NGS_EMAIL,
      client_email:   order.ordererEmail,
    };


    // ─── EmailJS 발송 (본사/고객 제목 차별화) ───
    if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
      try {
        console.log('📧 EmailJS 발송 시작...');
        
        // 1. 본사 알림 (고객사명 포함 제목)
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          ...emailParams,
          order_title: `[${clientName} ${activeTab === 'quote' ? '견적' : '주문'} 접수]`,
          to_email: NGS_EMAIL,
        }, EMAILJS_PUBLIC_KEY);

        // 1초 대기 (연속 호출 안정성)
        await new Promise(r => setTimeout(r, 1000));

        // 2. 고객 확인 (뉴진사이언스 이름 제목)
        if (order.ordererEmail && order.ordererEmail.includes('@')) {
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            ...emailParams,
            order_title: `[(주)뉴진사이언스 ${activeTab === 'quote' ? '견적접수' : '주문접수'}]`,
            to_email: order.ordererEmail,
          }, EMAILJS_PUBLIC_KEY);
        }

        console.log('✅ EmailJS 모든 발송 완료');
      } catch (err) {
        console.error('❌ EmailJS 발송 실패:', err);
      }
    }
    // ───────────────────────────────────────────────

    // ─── Google Apps Script 백업 발송 ───
    if (SCRIPT_URL) {
      try {
        fetch(SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailParams)
        });
        console.log('✅ GAS 백업 발송 요청 완료');
      } catch (e) {
        console.error('❌ GAS 백업 발송 실패:', e);
      }
    }
    // ───────────────────────────────────────────────

    const success = await saveOrder(order);
    setIsSubmitting(false);

    if (success) {
      // 견적/발주 상관없이 "감사합니다" 프리미엄 화면 통합 표시
      setShowCelebration(true);
      // 폼 공통 초기화
      setOtherRequest('');
      setQuantities({});
    } else {
      alert('데이터베이스 저장에 실패했습니다. 관리자에게 확인 부탁드립니다.');
    }
  };

  const productsByCategory = (cat: string) =>
    filteredProducts.filter(p => p.category === cat);

  useEffect(() => {
    // 기존 useEffect 제거
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F0F4F1] to-[#E8F0EA]">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-[#E2E8E4] shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="New Gene Science Logo" className="h-10 w-auto" />
            <div className="border-l border-slate-200 pl-3">
              <p className="text-[10px] font-medium text-slate-400 leading-none">{clientName} 전용 주문 시스템</p>
            </div>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-green-900/20 hover:bg-primary-dark transition-all active:scale-95"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">장바구니</span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome Banner */}
        <motion.div
          layout
          onClick={() => setIsBannerEnlarged(!isBannerEnlarged)}
          initial={{ opacity: 0, y: -10 }}
          animate={{ 
            opacity: 1, 
            y: 0,
            scale: isBannerEnlarged ? 1.05 : 1,
          }}
          className={`bg-primary rounded-3xl py-4 px-6 text-white relative overflow-hidden transition-all duration-300 ${isBannerEnlarged ? 'shadow-2xl z-50 ring-4 ring-primary/30' : 'shadow-sm'}`}
        >
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute -right-4 bottom-0 w-24 h-24 rounded-full bg-white/5" />
          <div className="relative z-10">
            <h1 className="text-xl font-black">{clientData.name}님 반갑습니다! 👋</h1>
            <p className="text-xs opacity-70 mt-1">뉴진사이언스 제품을 편리하게 {activeTab === 'quote' ? '문의' : '주문'}하세요</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 pt-2.5 border-t border-white/10">
              <p className="text-xs font-bold opacity-60 flex items-center gap-1.5">
                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">TEL</span> 02-898-8805
              </p>
              <p className="text-xs font-bold opacity-60 flex items-center gap-1.5">
                <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">MOB</span> 010-7169-8805
              </p>
            </div>
          </div>
        </motion.div>

        {/* Tab Navigation */}
        <div className="flex bg-white/50 backdrop-blur-md p-1.5 rounded-2xl border border-[#E2E8E4] sticky top-[72px] z-30 shadow-sm">
          <button
            onClick={() => setActiveTab('quote')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'quote' ? 'bg-primary text-white shadow-lg shadow-green-900/20' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <MessageSquare className="w-4 h-4" />
            견적문의
          </button>
          <button
            onClick={() => setActiveTab('order')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'order' ? 'bg-primary text-white shadow-lg shadow-green-900/20' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Package className="w-4 h-4" />
            발주제출
          </button>
          <button
            onClick={() => setActiveTab('payment')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'payment' ? 'bg-primary text-white shadow-lg shadow-green-900/20' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <CreditCard className="w-4 h-4" />
            내역/결제
          </button>
        </div>

        {/* Main Content based on activeTab */}
        <AnimatePresence mode="wait">
          {activeTab === 'quote' && (
            <motion.div
              key="quote"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Orderer Info */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
                  <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary whitespace-nowrap">
                    <User className="w-4 h-4" /> 주문자 정보 ({clientData.name})
                  </h2>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">빠른 입력:</span>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                      {quickSelectOrderers.map(person => (
                        <button
                          key={person.name}
                          type="button"
                          onClick={() => {
                            setOrdererName(person.name);
                            setOrdererEmail(person.email);
                            setOrdererPhone(person.phone);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-primary/10 hover:text-primary rounded-lg text-[10px] font-black text-slate-500 transition-all border border-slate-200 active:scale-95 whitespace-nowrap"
                        >
                          {person.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setOrdererName('');
                          setOrdererEmail('');
                          setOrdererPhone('');
                        }}
                        className="px-2 py-1 bg-white hover:bg-red-50 hover:text-red-500 rounded-lg text-[10px] font-black text-slate-400 transition-all border border-dashed border-slate-200 active:scale-95 whitespace-nowrap"
                      >
                        초기화
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6">
                  <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                    <div className="min-w-[120px]">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">문의자 성함 *</label>
                      <input value={ordererName} onChange={e => setOrdererName(e.target.value)} placeholder="성함" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">이메일</label>
                      <input value={ordererEmail} onChange={e => setOrdererEmail(e.target.value)} placeholder="email@company.com" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                    </div>
                    <div className="min-w-[160px]">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">연락처 *</label>
                      <input 
                        value={ordererPhone} 
                        onChange={e => setOrdererPhone(e.target.value)} 
                        placeholder="010-0000-0000" 
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-slate-800" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Inquiry Section */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4]">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary mb-4">
                  <MessageSquare className="w-4 h-4" /> 견적 요청 내용
                </h2>
                <textarea
                  value={otherRequest}
                  onChange={e => setOtherRequest(e.target.value)}
                  placeholder="구입을 원하시는 제품명, 규격, 수량 등을 자유롭게 입력해주세요. 타사 제품도 뉴진사이언스를 통해 구매 가능합니다."
                  rows={8}
                  className="w-full px-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                />
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full mt-6 py-4 bg-primary text-white rounded-2xl font-black text-base shadow-xl shadow-green-900/20 hover:bg-primary-dark transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  견적 문의 제출하기
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'order' && (
            <motion.div
              key="order"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Orderer Info */}
              <section className="space-y-6">

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
                    <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary whitespace-nowrap">
                      <User className="w-4 h-4" /> 주문자 정보 ({clientData.name})
                    </h2>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">빠른 입력:</span>
                      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                        {quickSelectOrderers.map(person => (
                          <button
                            key={person.name}
                            type="button"
                            onClick={() => {
                              setOrdererName(person.name);
                              setOrdererEmail(person.email);
                              setOrdererPhone(person.phone);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-primary/10 hover:text-primary rounded-lg text-[10px] font-black text-slate-500 transition-all border border-slate-200 active:scale-95 whitespace-nowrap"
                          >
                            {person.name}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setOrdererName('');
                            setOrdererEmail('');
                            setOrdererPhone('');
                          }}
                          className="px-2 py-1 bg-white hover:bg-red-50 hover:text-red-500 rounded-lg text-[10px] font-black text-slate-400 transition-all border border-dashed border-slate-200 active:scale-95 whitespace-nowrap"
                        >
                          초기화
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                      <div className="min-w-[120px]">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">문의자 성함 *</label>
                        <input value={ordererName} onChange={e => setOrdererName(e.target.value)} placeholder="성함" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">이메일</label>
                        <input value={ordererEmail} onChange={e => setOrdererEmail(e.target.value)} placeholder="email@company.com" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                      </div>
                      <div className="min-w-[160px]">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">연락처 *</label>
                        <input 
                          value={ordererPhone} 
                          onChange={e => setOrdererPhone(e.target.value)} 
                          placeholder="010-0000-0000" 
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-slate-800" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Product Catalog */}
              <section className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4]">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary mb-4">
                  <Package className="w-4 h-4" /> 제품 목록
                </h2>
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                  <div className="relative flex-1 flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        value={tempSearch} 
                        onChange={e => {
                          const val = e.target.value;
                          setTempSearch(val);
                          setSearchTerm(val); 
                          if (val.trim().length > 0) {
                            setSelectedCategory('전체');
                          }
                        }}
                        placeholder="제품명 또는 코드로 검색..." 
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
                      />
                      {tempSearch && (
                        <button 
                          onClick={() => {
                            setTempSearch('');
                            setSearchTerm('');
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 rounded-full transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => setSearchTerm(tempSearch)}
                      className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-xs hover:bg-slate-900 transition-all active:scale-95 shrink-0"
                    >
                      조회
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {categories.map(cat => (
                      <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{cat}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  {(selectedCategory === '전체' ? categories.slice(1) : [selectedCategory]).map(cat => {
                    const catProducts = productsByCategory(cat);
                    if (catProducts.length === 0) return null;
                    // 검색어가 있으면(공백 제외) 무조건 펼침
                    const searchActive = searchTerm.trim().length > 0;
                    const expanded = searchActive ? true : (expandedCategories[cat] !== false);
                    return (
                      <div key={cat} className="border border-slate-100 rounded-2xl overflow-hidden">
                        <button type="button" onClick={() => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                          <span className="text-xs font-extrabold text-primary uppercase tracking-widest">{cat}</span>
                          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        <AnimatePresence>
                          {expanded && (
                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                              <div className="divide-y divide-slate-50">
                                {catProducts.map(product => {
                                  const qty = quantities[product.id] || 0;
                                  return (
                                    <div key={product.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${qty > 0 ? 'bg-green-50/50' : 'hover:bg-slate-50/80'}`}>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-600 font-mono">{product.code}</p>
                                        <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{product.name}</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">{product.spec}</p>
                                      </div>
                                      <div className="flex flex-col items-end gap-1 shrink-0">
                                        <span className="text-sm font-black text-primary">₩{product.price.toLocaleString()}</span>
                                        <div className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl px-2 py-1 shadow-sm">
                                          <button type="button" onClick={() => updateQty(product.id, -1)} disabled={qty === 0} className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center disabled:opacity-30 hover:bg-slate-200 active:scale-90 transition-all"><Minus className="w-3 h-3" /></button>
                                          <span className="w-6 text-center text-sm font-black text-slate-800">{qty}</span>
                                          <button type="button" onClick={() => updateQty(product.id, 1)} className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white hover:bg-primary-dark active:scale-90 transition-all"><Plus className="w-3 h-3" /></button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </section>


            </motion.div>
          )}

          {activeTab === 'payment' && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Bertis Order History & Search */}
              {isBertis && (
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4] space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <h2 className="text-sm font-extrabold text-primary flex items-center gap-2">
                      <Clock className="w-4 h-4" /> 내역 조회
                    </h2>
                    <button 
                      onClick={loadUserOrders}
                      className="text-[10px] font-bold text-slate-400 hover:text-primary flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${isOrdersLoading ? 'animate-spin' : ''}`} />
                      내역 새로고침
                    </button>
                  </div>

                  {/* Sub Tabs and Refresh */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex gap-2 p-1.5 bg-slate-100/80 rounded-2xl">
                      <button
                        onClick={() => setHistoryTab('order')}
                        className={`flex-1 py-2.5 text-[13px] font-black rounded-xl transition-all ${historyTab === 'order' ? 'bg-[#86efac] text-[#166534] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        발주내역 조회
                      </button>
                      <button
                        onClick={() => setHistoryTab('quote')}
                        className={`flex-1 py-2.5 text-[13px] font-black rounded-xl transition-all ${historyTab === 'quote' ? 'bg-[#86efac] text-[#166534] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        견적내용 조회
                      </button>
                    </div>
                  </div>

                  {/* Date Search */}
                  <div className="flex flex-wrap gap-3 items-end bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-[10px] font-extrabold text-slate-400 block mb-1">시작일</label>
                      <input 
                        type="date" 
                        value={dateRange.start} 
                        onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-[10px] font-extrabold text-slate-400 block mb-1">종료일</label>
                      <input 
                        type="date" 
                        value={dateRange.end} 
                        onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <button
                      onClick={() => setAppliedRange(dateRange)}
                      className="px-6 py-2.5 bg-primary text-white rounded-xl font-black text-xs shadow-lg shadow-green-900/10 hover:bg-primary-dark transition-all active:scale-95 flex items-center gap-2"
                    >
                      <Search className="w-3.5 h-3.5" />
                      조회
                    </button>
                  </div>

                  {/* Order List */}
                  <div className="space-y-4">
                    {filteredUserOrders.length === 0 ? (
                      <div className="py-12 text-center text-slate-300">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs font-bold">조회된 {historyTab === 'order' ? '발주' : '견적'} 내역이 없습니다.</p>
                      </div>
                    ) : (
                      filteredUserOrders.map(order => {
                        const isCollapsed = isItemCollapsed[order.id] !== false;
                        const totalQty = order.items?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
                        const summaryText = (order.items && order.items.length > 0) 
                          ? `${order.items[0].productName.slice(0, 15)}${order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}`
                          : (order.otherRequest ? order.otherRequest.slice(0, 15) : (order.orderType === 'order' ? '발주 내역' : '견적 문의 내역'));

                        // 견적 전용 상태 라벨 정의
                        const quoteStatusLabels: Record<string, string> = {
                          pending: '접수완료',
                          processing: '발주요청',
                          order_requested: '준비중',
                          shipped: '납품완료',
                          cancelled: '주문취소'
                        };

                        // 부가세 강제 역산 로직 (데이터 오류 대응)
                        let dTotal = Number(order.totalAmount || 0);
                        let dSubtotal = Number(order.subtotalAmount || 0);
                        let dVat = Number(order.vatAmount || 0);
                        if (dTotal > 0 && dVat === 0 && (dSubtotal === dTotal || dSubtotal === 0)) {
                          dSubtotal = Math.round(dTotal / 1.1);
                          dVat = dTotal - dSubtotal;
                        }

                        // 1. 발주 내역 (Collapsible)
                        if (order.orderType === 'order') {
                          return (
                            <div key={order.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm mb-4 hover:border-primary/20 transition-all">
                              <div 
                                onClick={() => setIsItemCollapsed(prev => ({ ...prev, [order.id]: !isCollapsed }))}
                                className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-slate-50/30 border-b border-slate-50 cursor-pointer hover:bg-slate-100/50 transition-colors"
                              >
                                <div className="flex items-start justify-between w-full gap-3">
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[11px] font-black text-slate-700 tracking-tight truncate">
                                      {order.id.replace('NGS-', '')}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 truncate">
                                      {order.items && order.items.length > 0 ? order.items[0].productCode : '상세 내역'}
                                    </span>
                                    {order.ordererName && (
                                      <p className="text-[9px] font-bold text-slate-300 truncate">주문자: {order.ordererName}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1.5 shrink-0 mt-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black shadow-sm ${
                                        (order.status === 'shipped' || order.status === 'payment_waiting') ? 'bg-blue-500 text-white' :
                                        order.status === 'cancelled' ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-emerald-500 text-white'
                                      }`}>
                                        {STATUS_LABELS[order.status] || order.status}
                                      </span>
                                      {order.status === 'shipped' && !statementRequestedOrderIds.includes(order.id) && (
                                        <input 
                                          type="checkbox" 
                                          checked={selectedOrderIds.includes(order.id)}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            if (e.target.checked) {
                                              setSelectedOrderIds(prev => [...prev, order.id]);
                                              if (order.ordererName === '김기환' || order.ordererName === '이재명') {
                                                setOrdererName('김기환');
                                                setOrdererPhone('010-5882-4997');
                                                setTaxEmail('khkimjhs@naver.com');
                                              } else if (order.ordererEmail) {
                                                setTaxEmail(order.ordererEmail);
                                              }
                                            } else {
                                              setSelectedOrderIds(prev => prev.filter(id => id !== order.id));
                                            }
                                          }}
                                          className="w-4 h-4 rounded border-slate-200 text-blue-500 focus:ring-blue-500 cursor-pointer ml-1"
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 flex-1 w-full mt-2 md:mt-0">
                                  <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded-xl border border-slate-200 shadow-sm w-fit shrink-0">
                                    <span className="hidden md:inline text-[10px] font-black text-slate-700 truncate max-w-[120px]">{summaryText}</span>
                                    <span className="text-[10px] font-bold text-slate-400">{totalQty}개</span>
                                    <span className="text-[10px] font-black text-primary">₩{dTotal.toLocaleString()}</span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5 md:gap-2 sm:justify-end">
                                    {order.status === 'shipped' && (order.items && order.items.length > 0) && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(`/statement?ids=${order.id}`, '_blank');
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-white text-blue-600 border border-blue-500 shadow-sm hover:bg-blue-50 transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        명세서 보기
                                      </button>
                                    )}
                                    <span className="text-slate-300 text-xs ml-1 shrink-0">{isCollapsed ? '▼' : '▲'}</span>
                                  </div>
                                </div>
                                </div>
                              </div>
                              
                              {!isCollapsed && (
                                <div className="px-5 py-4 bg-white border-t border-slate-50">
                                  {(!order.items || order.items.length === 0) && order.otherRequest && (
                                    <div className="mb-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                      <p className="text-[10px] font-black text-blue-500 uppercase mb-2">문의 및 요청 내용</p>
                                      <p className="text-sm text-slate-800 font-bold leading-relaxed">{order.otherRequest}</p>
                                    </div>
                                  )}
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {order.items?.map((item, idx) => (
                                      <div key={idx} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-black text-slate-800 truncate">{item.productName}</p>
                                          <p className="text-[10px] text-slate-400 font-medium truncate">{item.productCode}</p>
                                        </div>
                                        <div className="text-right shrink-0 ml-4">
                                          <p className="text-[11px] font-black text-slate-700">{item.quantity}개</p>
                                          {!(order.orderType === 'quote' && order.status === 'pending') && (
                                            <p className="text-[10px] font-bold text-primary">₩{item.subtotal.toLocaleString()}</p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-end justify-between gap-4">
                                      {!(order.orderType === 'quote' && order.status === 'pending') && (
                                        <>
                                          <div className="flex justify-end gap-4 text-[10px] font-bold text-slate-400 mb-1">
                                            <span>공급가액: ₩{dSubtotal.toLocaleString()}</span>
                                            <span>부가세: ₩{dVat.toLocaleString()}</span>
                                          </div>
                                          <p className="text-[11px] text-slate-400 font-bold">최종 합계 (VAT �                                  <div className="flex flex-wrap items-center gap-1.5 md:gap-2 sm:justify-end">
                                  {/* 거래명세서 보기 및 체크박스 (납품완료 상태 시 항상 표시) */}
                                  {order.status === 'shipped' && (order.items && order.items.length > 0) && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(`/statement?ids=${order.id}`, '_blank');
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-black bg-white text-blue-600 border border-blue-500 shadow-sm hover:bg-blue-50 transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      거래명세서 보기
                                    </button>
                                  )}
                                  {order.orderType === 'quote' && order.status === 'processing' ? (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(`/quote?ids=${order.id}`, '_blank');
                                        }}
                                        className="px-2.5 py-1.5 rounded-full text-[10px] font-black bg-white text-primary border border-primary shadow-sm hover:bg-primary/5 transition-all active:scale-95 shrink-0 flex items-center gap-1"
                                      >
                                        <Eye className="w-3 h-3" />
                                        견적서
                                      </button>
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (window.confirm('해당 견적내용으로 발주를 요청하시겠습니까?')) {
                                            const success = await convertQuoteToOrder(order.id);
                                            if (success) {
                                              alert('발주 요청이 완료되었습니다.');
                                              loadUserOrders(); // 목록 새로고침
                                            }
                                          }
                                        }}
                                        className="px-3 py-1.5 rounded-full text-[10px] font-black bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition-all active:scale-95 shrink-0"
                                      >
                                        발주요청
                                      </button>
                                    </div>
                                  ) : null}
                                  <span className="text-slate-300 text-xs ml-1 shrink-0">{isCollapsed ? '▼' : '▲'}</span>
                                </div>                    checked={selectedOrderIds.includes(order.id)}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          if (e.target.checked) {
                                            setSelectedOrderIds(prev => [...prev, order.id]);
                                            if (order.ordererEmail) {
                                              setTaxEmail(order.ordererEmail);
                                            }
                                          } else {
                                            setSelectedOrderIds(prev => prev.filter(id => id !== order.id));
                                          }
                                        }}
                                        className="w-4 h-4 rounded border-slate-200 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                      />
                                    )}
                                  </div>
                                )}
                                {order.orderType === 'quote' && order.status === 'processing' ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(`/quote?ids=${order.id}`, '_blank');
                                      }}
                                      className="px-2.5 py-1.5 rounded-full text-[10px] font-black bg-white text-primary border border-primary shadow-sm hover:bg-primary/5 transition-all active:scale-95 shrink-0 flex items-center gap-1"
                                    >
                                      <Eye className="w-3 h-3" />
                                      견적서
                                    </button>
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (window.confirm('해당 견적내용으로 발주를 요청하시겠습니까?')) {
                                          const success = await convertQuoteToOrder(order.id);
                                          if (success) {
                                            alert('발주 요청이 완료되었습니다.');
                                            loadUserOrders(); // 목록 새로고침
                                          }
                                        }
                                      }}
                                      className="px-3 py-1.5 rounded-full text-[10px] font-black bg-indigo-600 text-white shadow-md hover:bg-indigo-700 transition-all active:scale-95 shrink-0"
                                    >
                                      발주요청
                                    </button>
                                  </div>
                                ) : (
                                  <span className={`px-3 py-1.5 rounded-full text-[10px] font-black shadow-sm shrink-0 ${
                                    order.status === 'pending' ? 'bg-blue-500 text-white' :
                                    (order.status === 'order_requested' || order.status === 'processing') ? 'bg-indigo-500 text-white' :
                                    order.status === 'shipped' ? 'bg-blue-500 text-white' :
                                    order.status === 'cancelled' ? 'bg-red-50 text-red-500 border border-red-100' : 'bg-slate-400 text-white'
                                  }`}>
                                    {order.orderType === 'quote' 
                                      ? (quoteStatusLabels[order.status] || STATUS_LABELS[order.status] || order.status)
                                      : (STATUS_LABELS[order.status] || order.status)}
                                  </span>
                                )}
                                <span className="text-slate-300 text-xs ml-1 shrink-0">{isCollapsed ? '▼' : '▲'}</span>
                                </div>
                              </div>
                            </div>
                            
                            {!isCollapsed && (
                              <div className="px-5 py-4 bg-white border-t border-slate-50">
                                {(!order.items || order.items.length === 0) && order.otherRequest && (
                                  <div className="mb-4 text-sm text-slate-800 font-bold leading-relaxed">
                                    {order.otherRequest}
                                  </div>
                                )}
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {order.items?.map((item, idx) => (
                                    <div key={idx} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-black text-slate-800 truncate">{item.productName}</p>
                                        <p className="text-[10px] text-slate-400 font-medium truncate">{item.productCode}</p>
                                      </div>
                                        <p className="text-[11px] font-black text-slate-700">{item.quantity}개</p>
                                        {!(order.orderType === 'quote' && order.status === 'pending') && (
                                          <p className="text-[10px] font-bold text-primary">₩{item.subtotal.toLocaleString()}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                
                                {/* 펼침 모드에서 견적 금액 표시 (전송 전에는 숨김) */}
                                {dTotal > 0 && !(order.orderType === 'quote' && order.status === 'pending') && (
                                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-end justify-between gap-4">
                                    <div className="text-right flex-1">
                                      <div className="flex justify-end gap-4 text-[10px] font-bold text-slate-400 mb-1">
                                        <span>공급가액: ₩{dSubtotal.toLocaleString()}</span>
                                        <span>부가세: ₩{dVat.toLocaleString()}</span>
                                      </div>
                                      <p className="text-[11px] text-slate-400 font-bold">안내된 견적 금액 (VAT 포함)</p>
                                      <p className="text-xl font-black text-primary tracking-tighter">₩{dTotal.toLocaleString()}</p>
                                    </div>
                                  </div>
                                )}
                                {(order.orderType === 'quote' && order.status === 'pending') && (
                                  <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                                    <p className="text-xs font-bold text-slate-400 italic bg-slate-50 py-3 rounded-2xl border border-dashed border-slate-200">
                                      관리자가 견적 내용을 확인 중입니다. 잠시만 기다려 주세요.
                                    </p>
                                  </div>
                                )}
                                
                                {order.items && order.items.length > 0 && order.otherRequest && (
                                  <div className="mt-3 p-3 bg-amber-50/50 rounded-xl border border-dashed border-amber-200 text-xs text-amber-800 font-medium">
                                    {order.otherRequest}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {/* Tax Invoice Request Section */}
                {isBertis && (
                  <div className="space-y-4">
                    {/* Integrated Issuance Modules */}
                    <div className="grid grid-cols-1 gap-6">
                      {/* Common State Summary */}
                      {selectedOrderIds.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center justify-between shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-500 text-white rounded-2xl flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Selected Items</p>
                              <p className="text-sm font-bold text-slate-700">{selectedOrderIds.length}건 선택됨</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Amount</p>
                            <p className="text-xl font-black text-emerald-600">₩{selectedTotalAmount.toLocaleString()}</p>
                          </div>
                        </motion.div>
                      )}

                      {/* Unified Issuance Module */}
                      <div className="grid grid-cols-1 gap-6">
                        {/* Statement Issuance Card */}
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-emerald-100 space-y-6 overflow-hidden relative group">
                          {/* Background Decoration */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                          
                          <div className="relative flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
                              <FileText className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="text-lg font-black text-slate-800 tracking-tight">거래명세서 발행 요청</h3>
                              <p className="text-[11px] text-slate-400 font-bold mt-0.5">선택한 항목에 대한 거래명세서를 이메일로 발행합니다.</p>
                            </div>
                          </div>

                          {/* Selection Summary Overlay */}
                          <div className="p-5 bg-slate-50/80 backdrop-blur-sm rounded-2xl border border-slate-100 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Items</p>
                              <p className="text-sm font-bold text-slate-700">{selectedOrderIds.length}건 선택됨</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Amount</p>
                              <p className="text-xl font-black text-emerald-600">₩{selectedTotalAmount.toLocaleString()}</p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <button
                              onClick={handleStatementRequest}
                              disabled={isStatementSubmitting || selectedOrderIds.length === 0}
                              className="w-full py-4.5 bg-slate-900 text-white rounded-2xl font-black text-base hover:bg-black transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed shadow-xl shadow-slate-200 flex items-center justify-center gap-3"
                            >
                              {isStatementSubmitting ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-5 h-5" />
                              )}
                              {isStatementSubmitting ? '발행 요청 중...' : '거래명세서 발행 요청'}
                            </button>
                          </div>
                        </div>

                        {/* Email Input Field (Shared) */}
                        <div className="bg-slate-50/80 backdrop-blur-sm p-5 rounded-3xl border border-slate-100 space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                              <Mail className="w-3 h-3" /> 발행 이메일 주소
                            </label>
                            <button
                              onClick={handleResetPractice}
                              className="text-[9px] font-bold text-rose-400 hover:text-rose-600 flex items-center gap-1 transition-colors"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              연습 데이터 초기화
                            </button>
                          </div>
                          <input
                            type="email"
                            value={taxEmail}
                            onChange={(e) => setTaxEmail(e.target.value)}
                            placeholder="invoice@company.com"
                            className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
                          />
                          <p className="text-[10px] text-slate-400 font-medium leading-relaxed px-1">
                            ※ 요청하신 서류는 입력하신 이메일로 영업일 기준 1~2일 내에 발송됩니다. <strong>{NGS_EMAIL}</strong>으로도 사본이 전달됩니다.
                          </p>
                        </div> 
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4] space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <h2 className="font-black text-slate-800 text-sm">무통장 입금 안내</h2>
                  </div>
                  
                  <div className="bg-slate-50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-bold text-slate-800 whitespace-nowrap">{NGS_BANK.bank}</span>
                      <span className="font-black text-slate-800 font-mono whitespace-nowrap">{NGS_BANK.account}</span>
                      <span className="text-slate-500 text-[11px] whitespace-nowrap">(예금주: {NGS_BANK.holder})</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(NGS_BANK.account);
                        alert('계좌번호가 복사되었습니다.');
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/20 transition-all shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      복사
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Cart Drawer */}
      <AnimatePresence>
        {showCart && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCart(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-primary" /> 장바구니
                </h3>
                <button onClick={() => setShowCart(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {cartItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                    <ShoppingCart className="w-12 h-12" />
                    <p className="text-sm font-bold">선택된 제품이 없습니다</p>
                  </div>
                ) : cartItems.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-slate-400">{p.code}</p>
                      <p className="text-sm font-bold text-slate-800 leading-tight">{p.name}</p>
                      <p className="text-xs text-primary font-bold mt-0.5">₩{p.price.toLocaleString()} × {quantities[p.id]}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-primary">₩{(p.price * quantities[p.id]).toLocaleString()}</p>
                      <button
                        type="button"
                        onClick={() => setQuantities(prev => ({ ...prev, [p.id]: 0 }))}
                        className="text-[10px] text-red-400 hover:text-red-600 font-bold mt-1"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-5 border-t border-slate-100 space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                    <span>공급가액</span>
                    <span>₩{subtotalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                    <span>부가세 (10%)</span>
                    <span>₩{vatAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                    <span className="text-sm font-black text-slate-800">합계 (VAT 포함)</span>
                    <span className="text-xl font-black text-primary">₩{totalAmount.toLocaleString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCart(false); handleSubmit(new Event('submit') as any); }}
                  disabled={cartItems.length === 0}
                  className="w-full py-3.5 bg-primary text-white rounded-xl font-black shadow-lg shadow-green-900/20 hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  주문하기
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-3xl p-10 text-center max-w-xs w-full mx-4 shadow-2xl space-y-4"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div>
                <h3 className="font-black text-slate-800">
                  {activeTab === 'payment' 
                    ? '발주요청 처리중' 
                    : (cartItems.length > 0 ? '발주서 처리 중' : '견적문의 제출 처리중')}
                </h3>
                <p className="text-xs text-slate-400 mt-1">이메일 발송 및 내역 등록 중입니다...</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-white/40 backdrop-blur-3xl"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="bg-white/90 backdrop-blur-xl rounded-[40px] p-10 md:p-16 max-w-lg w-full text-center shadow-2xl space-y-8 relative border border-white/50"
            >
              <div className="w-24 h-24 bg-primary/10 rounded-[35px] flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-12 h-12 text-primary" />
              </div>
              <div className="space-y-3">
                <h2 className="text-primary font-black text-4xl tracking-tighter drop-shadow-sm whitespace-nowrap">감사합니다!</h2>
                <p className="text-slate-500 text-base md:text-lg mt-4 leading-relaxed font-bold">
                  {activeTab === 'quote' 
                    ? '견적 문의가 정상적으로 접수되었습니다.' 
                    : '발주 요청이 정상적으로 완료되었습니다.'}<br />
                  담당자가 확인 후 빠르게 처리해 드리겠습니다! 👋
                </p>
              </div>
              
              <button 
                onClick={() => {
                  setShowCelebration(false);
                  setActiveTab('order');
                }}
                className="w-full py-5 bg-primary text-white rounded-3xl font-black text-lg shadow-xl shadow-green-900/20 hover:bg-primary-dark transition-all active:scale-[0.98]"
              >
                메인으로 돌아가기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
