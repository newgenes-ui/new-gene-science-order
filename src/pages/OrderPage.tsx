import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Search, Plus, Minus, ShoppingCart, FileText,
  User, Phone, Mail, Building2, MessageSquare, ChevronDown, ChevronUp, X, CreditCard, Copy, Clock, CheckCircle2, RefreshCw
} from 'lucide-react';
import { PRODUCTS, CLIENTS, NGS_EMAIL, NGS_BANK } from '../data/products';
import { Order, OrderItem, generateOrderId, saveOrder, getOrdersFromSupabase, updateOrderStatus, convertQuoteToOrder } from '../store/orderStore';
import emailjs from '@emailjs/browser';

// ─── EmailJS 설정 (Vercel 환경변수로 관리) ───────────────────────
const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || '';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || '';
// ─────────────────────────────────────────────────────────────────

export default function OrderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isBannerEnlarged, setIsBannerEnlarged] = useState(false);

  const clientId = searchParams.get('client') || 'demo';
  
  // clientData를 찾되, 없을 경우 마지막(데모) 데이터 사용
  const clientData = useMemo(() => {
    return CLIENTS.find(c => c.id === clientId) || CLIENTS[CLIENTS.length - 1];
  }, [clientId]);

  const isBertis = clientId === 'bertis';

  const [clientName, setClientName] = useState(clientData.name);
  const [ordererName, setOrdererName] = useState(clientData.contactPerson || '');
  const [ordererPhone, setOrdererPhone] = useState(clientData.phone || '');
  const [ordererEmail, setOrdererEmail] = useState(clientData.email || '');

  const handleTaxInvoiceRequest = async () => {
    if (!taxEmail) {
      alert('세금계산서를 받으실 이메일 주소를 입력해주세요.');
      return;
    }

    setIsTaxSubmitting(true);
    try {
      const emailParams = {
        order_title: `[세금계산서 발행 요청] ${clientName}`,
        order_type_text: '세금계산서 발행 요청',
        detail_label: '요청 주문/문의 내역',
        items_text: `기관명: ${clientName}\n주문자: ${ordererName}\n연락처: ${ordererPhone}\n발행 이메일: ${taxEmail}\n선택된 내역: ${selectedOrderIds.length > 0 ? selectedOrderIds.join(', ') : '전체(최근)'}`,
        from_name: ordererName,
        contact_number: ordererPhone,
        reply_to: taxEmail,
        to_email: NGS_EMAIL,
        ngs_email: NGS_EMAIL,
      };

      await emailjs.send(
        'service_h8f3lfs',
        'template_67u1m86',
        emailParams,
        'Y4Bf666YxL-LOnR4h'
      );

      alert('세금계산서 발행 요청이 완료되었습니다.');
    } catch (error) {
      console.error('Tax invoice request error:', error);
      alert('요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsTaxSubmitting(false);
    }
  };

  const handleStatementRequest = async () => {
    if (!taxEmail) {
      alert('거래명세서를 받으실 이메일 주소를 입력해주세요.');
      return;
    }

    setIsStatementSubmitting(true);
    try {
      const emailParams = {
        order_title: `[거래명세서 발행 요청] ${clientName}`,
        order_type_text: '거래명세서 발행 요청',
        detail_label: '요청 주문/문의 내역',
        items_text: `기관명: ${clientName}\n주문자: ${ordererName}\n연락처: ${ordererPhone}\n발행 이메일: ${taxEmail}\n선택된 내역: ${selectedOrderIds.length > 0 ? selectedOrderIds.join(', ') : '전체(최근)'}`,
        from_name: ordererName,
        contact_number: ordererPhone,
        reply_to: taxEmail,
        to_email: NGS_EMAIL,
        ngs_email: NGS_EMAIL,
      };

      await emailjs.send(
        'service_h8f3lfs',
        'template_67u1m86',
        emailParams,
        'Y4Bf666YxL-LOnR4h'
      );

      alert('거래명세서 발행 요청이 완료되었습니다.');
    } catch (error) {
      console.error('Statement request error:', error);
      alert('요청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsStatementSubmitting(false);
    }
  };

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
        order_title:    `[${order.clientName} 발주 요청 (견적전환)]`,
        order_type_text: '발주 (견적전환)',
        detail_label:   '발주 상세 내역',
        order_id:       order.id,
        order_date:     order.orderDate,
        client_name:    order.clientName,
        orderer_name:   order.ordererName,
        orderer_phone:  order.ordererPhone,
        orderer_email:  order.ordererEmail || '(미입력)',
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
        // 1. 본사 발송
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          ...emailParams,
          info_label: '발주자 정보',
          greeting: '관리자님, 안녕하세요 (견적에서 발주로 전환되었습니다).',
          to_email: NGS_EMAIL,
          reply_to: order.ordererEmail || order.clientEmail || NGS_EMAIL,
        }, EMAILJS_PUBLIC_KEY);

        // 2. 고객 발송
        const targetEmail = order.ordererEmail || order.clientEmail;
        if (targetEmail && targetEmail.includes('@')) {
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            ...emailParams,
            order_title: `[뉴진사이언스 발주 접수 완료]`,
            info_label: '공급자 정보',
            greeting: '담당자님, 안녕하세요. 견적 요청이 발주로 전환되어 접수되었습니다.',
            orderer_name: '나혜원',
            orderer_phone: '010-9915-5974',
            orderer_email: 'newgenes@newgenesci.com',
            to_email: targetEmail,
            reply_to: NGS_EMAIL,
          }, EMAILJS_PUBLIC_KEY);
        }
      }
      
      alert('발주 요청이 완료되었습니다. 담당자가 확인 후 연락드리겠습니다.');
      // 3. 상태 업데이트 및 주문으로 변환
      const success = await convertQuoteToOrder(order.id);
      if (success) {
        // 로컬 상태 업데이트
        setUserOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'pending', orderType: 'order' } : o));
      }
    } catch (error) {
      console.error('Place order from quote error:', error);
      alert('발주 요청 중 오류가 발생했습니다.');
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
      setOrdererName(clientData.contactPerson || '');
      setOrdererPhone(clientData.phone || '');
      setOrdererEmail(clientData.email || '');
    }
  }, [clientData]);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [otherRequest, setOtherRequest] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [tempSearch, setTempSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuoteSuccess, setIsQuoteSuccess] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ 'AG Tip': true, '파이펫': true, '튜브': true, '랙': true });
  const [activeTab, setActiveTab] = useState<'quote' | 'order' | 'payment'>('order');
  const [taxEmail, setTaxEmail] = useState('');
  const [isTaxSubmitting, setIsTaxSubmitting] = useState(false);
  const [isStatementSubmitting, setIsStatementSubmitting] = useState(false);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
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

  // 초기 이메일 설정
  useEffect(() => {
    if (ordererEmail && !taxEmail) {
      setTaxEmail(ordererEmail);
    }
  }, [ordererEmail]);

  // 발주 내역 로드 (베르티스 전용)
  const loadUserOrders = async () => {
    if (!isBertis) return;
    setIsOrdersLoading(true);
    try {
      const all = await getOrdersFromSupabase();
      // 베르티스 주문만 필터링
      const bertisOrders = all.filter(o => o.clientId === 'bertis');
      setUserOrders(bertisOrders);
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setIsOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'payment' && isBertis) {
      loadUserOrders();
    }
  }, [activeTab, isBertis]);

  const filteredUserOrders = useMemo(() => {
    return userOrders
      .filter(o => 
        o.orderDate >= appliedRange.start && 
        o.orderDate <= appliedRange.end &&
        (historyTab === 'order' 
          ? (o.orderType === 'order' && !o.isConverted && o.items.length > 0) 
          : (o.orderType === 'quote' || o.isConverted || o.items.length === 0)) &&
        // 'paid' (입금확인) 및 'cancelled' (주문취소) 시 화면 숨기기
        o.status !== 'paid' && o.status !== 'cancelled'
      )
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.id.localeCompare(a.id));
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
  const subtotalAmount = cartItems.reduce((s, p) => s + p.price * (quantities[p.id] || 0), 0);
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
    const y = parts.find(p => p.type === 'year')?.value;
    const mo = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    const h = parts.find(p => p.type === 'hour')?.value;
    const mi = parts.find(p => p.type === 'minute')?.value;
    const s = parts.find(p => p.type === 'second')?.value;
    
    const kstDateString = `${y}-${mo}-${d}`;
    const kstDateTimeString = `${y}-${mo}-${d}T${h}:${mi}:${s}`;

    const order: Order = {
      id: generateOrderId(),
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
      status: 'payment_waiting',
      paymentMethod: 'bank_transfer',
      orderType: activeTab === 'quote' ? 'quote' : 'order',
    };

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
      order_title:    `[${clientName} ${activeTab === 'quote' ? '견적' : '주문'} 접수]`,
      order_type_text: activeTab === 'quote' ? '견적' : '주문',
      detail_label:   `${activeTab === 'quote' ? '견적' : '주문'} 상세 내역`,
      order_id:       order.id,
      order_date:     order.orderDate,
      client_name:    clientName,
      orderer_name:   ordererName,
      orderer_phone:  order.ordererPhone,
      orderer_email:  order.ordererEmail || '(미입력)',
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
      to_email:       `${NGS_EMAIL}, ${clientData.email}`,
      ngs_email:      NGS_EMAIL,
      client_email:   clientData.email,
    };


    if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
      try {
        console.log('📧 이메일 발송 시작...');
        
        // 1. 뉴진사이언스 본사로 발송 (관리자용)
        const resNGS = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          ...emailParams,
          info_label: '주문자 정보',
          greeting: '관리자님, 안녕하세요.',
          to_email: NGS_EMAIL,
          reply_to: ordererEmail || clientData.email || NGS_EMAIL,
        }, EMAILJS_PUBLIC_KEY);
        console.log('✅ 뉴진사이언스 발송 완료:', resNGS.status);

        // 2. 고객(베르티스 등)에게 발송 (고객용)
        const targetClientEmail = ordererEmail || clientData.email;
        if (targetClientEmail && targetClientEmail.includes('@')) {
          const resClient = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            ...emailParams,
            order_title: `[뉴진사이언스 ${activeTab === 'quote' ? '견적' : '주문'} 접수]`,
            info_label: '공급자 정보',
            greeting: '담당자님, 안녕하세요.',
            // 고객 메일에는 공급자(뉴진사이언스) 정보를 표시
            orderer_name: '나혜원',
            orderer_phone: '010-9915-5974',
            orderer_email: 'newgenes@newgenesci.com',
            to_email: targetClientEmail,
            reply_to: NGS_EMAIL,
          }, EMAILJS_PUBLIC_KEY);
          console.log('✅ 고객사 발송 완료:', resClient.status);
        } else {
          console.log('ℹ️ 고객 이메일이 없어 본사에만 발송했습니다.');
        }
      } catch (e) {
        console.error('❌ EmailJS 발송 오류:', e);
        alert('이메일 발송 중 오류가 발생했습니다. 하지만 주문은 시스템에 등록되었습니다.');
      }
    } else {
      console.warn('⚠️ EmailJS 설정값이 누락되었습니다. Vercel 환경변수를 확인하세요.');
    }

    saveOrder(order);
    setIsSubmitting(false);

    if (order.orderType === 'quote') {
      setIsQuoteSuccess(true);
      // 폼 초기화
      setOtherRequest('');
      setQuantities({});
    } else {
      navigate(`/payment?orderId=${order.id}`);
    }
  };

  const productsByCategory = (cat: string) =>
    filteredProducts.filter(p => p.category === cat);

  if (isQuoteSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F0F4F1] to-[#E8F0EA] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl space-y-6"
        >
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">문의 접수 완료!</h2>
            <p className="text-slate-500 text-sm mt-2 leading-relaxed">
              견적 문의가 담당자에게 전달되었습니다.<br />
              확인 후 빠르게 연락드리겠습니다.
            </p>
          </div>
          <button
            onClick={() => {
              setIsQuoteSuccess(false);
              setActiveTab('order');
            }}
            className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-lg hover:bg-primary-dark transition-all"
          >
            메인으로 돌아가기
          </button>
        </motion.div>
      </div>
    );
  }

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
            <h1 className="text-xl font-black">{clientName}님 반갑습니다! 👋</h1>
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
            {isBertis ? '내역/결제' : '결제하기'}
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
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary mb-4">
                  <User className="w-4 h-4" /> 주문자 정보 {isBertis && '(베르티스)'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {!isBertis && (
                    <div>
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">기관명</label>
                      <input value={clientName} onChange={e => setClientName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                    </div>
                  )}
                  <div className={`flex flex-wrap items-end gap-x-12 gap-y-6 ${isBertis ? 'sm:col-span-2' : ''}`}>
                    <div className="min-w-[140px]">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">문의자 성함 *</label>
                      <input value={ordererName} onChange={e => setOrdererName(e.target.value)} placeholder="성함을 입력하세요" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                    </div>
                    {(!isBertis || isBertis) && (
                      <div className="flex-1 min-w-[280px]">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">이메일</label>
                        <input value={ordererEmail} onChange={e => setOrdererEmail(e.target.value)} placeholder="email@company.com" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                      </div>
                    )}
                    {isBertis && (
                      <div className="min-w-[180px]">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">연락처 *</label>
                        <input 
                          value={ordererPhone} 
                          onChange={e => setOrdererPhone(e.target.value)} 
                          placeholder="000-0000-0000" 
                          className={`w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all ${ordererPhone === '000-0000-0000' ? 'text-slate-300' : 'text-slate-800'}`} 
                        />
                      </div>
                    )}
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
                  <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary mb-4">
                    <User className="w-4 h-4" /> 주문자 정보 {isBertis && '(베르티스)'}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {!isBertis && (
                      <div>
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">기관명</label>
                        <input value={clientName} onChange={e => setClientName(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                      </div>
                    )}
                  <div className={`flex flex-wrap items-end gap-x-12 gap-y-6 ${isBertis ? 'sm:col-span-2' : ''}`}>
                    <div className="min-w-[140px]">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">주문자 성함 *</label>
                      <input value={ordererName} onChange={e => setOrdererName(e.target.value)} placeholder="홍길동" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                    </div>
                    {(!isBertis || isBertis) && (
                      <div className="flex-1 min-w-[280px]">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">이메일</label>
                        <input value={ordererEmail} onChange={e => setOrdererEmail(e.target.value)} placeholder="email@company.com" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                      </div>
                    )}
                    {isBertis && (
                      <div className="min-w-[180px]">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">연락처 *</label>
                        <input 
                          value={ordererPhone} 
                          onChange={e => setOrdererPhone(e.target.value)} 
                          placeholder="000-0000-0000" 
                          className={`w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all ${ordererPhone === '000-0000-0000' ? 'text-slate-300' : 'text-slate-800'}`} 
                        />
                      </div>
                    )}
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

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-4 bg-primary text-white rounded-2xl font-black text-base shadow-xl shadow-green-900/20 hover:bg-primary-dark transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-3"
              >
                <FileText className="w-5 h-5" />
                발주서 제출
              </button>
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
                    <button
                      onClick={loadUserOrders}
                      disabled={isOrdersLoading}
                      className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-primary transition-all active:scale-95 shadow-sm disabled:opacity-50"
                      title="내역 새로고침"
                    >
                      <RefreshCw className={`w-4 h-4 ${isOrdersLoading ? 'animate-spin' : ''}`} />
                    </button>
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
                      filteredUserOrders.map(order => (
                        <div key={order.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:border-primary/20 transition-all">
                          <div className="bg-slate-50/50 px-5 py-4 flex items-center justify-between gap-4 border-b border-slate-50">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-bold text-slate-400">{order.orderDate}</span>
                              </div>
                              <p className="text-sm font-black text-slate-800 truncate">
                                {order.items.length > 0 
                                  ? `${order.items[0].productCode}${order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}`
                                  : (order.orderType === 'quote' || order.isConverted ? '견적 문의 내역' : '기타 발주')}
                              </p>
                            </div>
                            <div className="shrink-0 flex items-center gap-3">
                              {order.orderType === 'order' ? (
                                <>
                                  {order.status !== 'paid' && order.status !== 'cancelled' && (
                                    <input 
                                      type="checkbox" 
                                      checked={selectedOrderIds.includes(order.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) setSelectedOrderIds(prev => [...prev, order.id]);
                                        else setSelectedOrderIds(prev => prev.filter(id => id !== order.id));
                                      }}
                                      className="w-4 h-4 rounded border-slate-200 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                    />
                                  )}
                                  <span className={`px-3 py-1.5 rounded-full text-[10px] font-black shadow-sm ${
                                    order.status === 'shipped'
                                      ? 'bg-blue-500 text-white'
                                      : order.status === 'payment_waiting'
                                        ? 'bg-rose-500 text-white'
                                        : order.status === 'cancelled'
                                          ? 'bg-red-50 text-red-500 border border-red-100'
                                          : 'bg-emerald-500 text-white'
                                  }`}>
                                    {order.status === 'shipped' ? '납품완료' : 
                                     order.status === 'payment_waiting' ? '미수금' : 
                                     order.status === 'cancelled' ? '주문취소' : '주문완료'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  {order.status === 'order_requested' && (
                                    <input 
                                      type="checkbox" 
                                      checked={selectedOrderIds.includes(order.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) setSelectedOrderIds(prev => [...prev, order.id]);
                                        else setSelectedOrderIds(prev => prev.filter(id => id !== order.id));
                                      }}
                                      className="w-4 h-4 rounded border-slate-200 text-blue-500 focus:ring-blue-500 cursor-pointer"
                                    />
                                  )}
                                    <div className="flex gap-2">
                                      {order.status === 'pending' || order.status === 'order_requested' || order.orderType === 'order' ? (
                                        <span className="px-3 py-1.5 rounded-full text-[10px] font-black border bg-emerald-500 text-white border-emerald-600 shadow-sm">
                                          주문완료
                                        </span>
                                      ) : (
                                        <button 
                                          onClick={() => handlePlaceOrderFromQuote(order)}
                                          className="px-3 py-1.5 rounded-full text-[10px] font-black border bg-blue-500 text-white border-blue-600 hover:bg-blue-600 transition-colors shadow-sm"
                                        >
                                          발주요청
                                        </button>
                                      )}
                                    </div>
                                </>
                              )}
                            </div>
                          </div>
                          
                          <div className="px-5 py-4 space-y-3">
                            {order.orderType === 'order' && order.items.length > 0 && (
                              <div className="space-y-2">
                                {order.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500 truncate flex-1 mr-4">• {item.productName} ({item.spec})</span>
                                    <span className="font-bold text-slate-400 shrink-0">{item.quantity}개 / ₩{item.subtotal.toLocaleString()}</span>
                                  </div>
                                ))}
                                <div className="pt-2 border-t border-dashed border-slate-100 flex justify-between items-center">
                                  <span className="text-xs font-bold text-slate-400">총 합계(VAT 포함)</span>
                                  <span className="text-sm font-black text-primary">₩{order.totalAmount.toLocaleString()}</span>
                                </div>
                              </div>
                            )}
                            
                            {order.orderType === 'quote' && (
                              <div className="bg-slate-50 rounded-2xl p-4">
                                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                                  {order.otherRequest || '상세 요청 내역 없음'}
                                </p>
                              </div>
                            )}

                            {order.orderType === 'order' && order.otherRequest && (
                              <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100/50">
                                <p className="text-[11px] text-amber-700 italic">기타 요청: {order.otherRequest}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4] space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-black text-slate-800">무통장 입금 안내</h2>
                    <p className="text-[10px] text-slate-400 font-bold">아래 계좌로 입금해 주시면 확인 후 처리됩니다.</p>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-2xl p-5 text-left space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-black uppercase">은행명</span>
                    <span className="text-sm font-bold text-slate-800">{NGS_BANK.bank}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-black uppercase">예금주</span>
                    <span className="text-sm font-bold text-slate-800">{NGS_BANK.holder}</span>
                  </div>
                  <div className="pt-2 border-t border-dashed border-slate-200">
                    <span className="text-[10px] text-slate-400 font-black uppercase block mb-2">계좌번호</span>
                    <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-100">
                      <span className="font-black text-slate-800 font-mono text-base">{NGS_BANK.account}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(NGS_BANK.account);
                          alert('계좌번호가 복사되었습니다.');
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-white rounded-lg text-[10px] font-bold hover:bg-primary-dark transition-all"
                      >
                        <Copy className="w-3 h-3" />
                        복사
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-2.5 text-left">
                  <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                    발주서 제출 후 <strong>3영업일 이내</strong>에 입금해 주세요. <br />
                    입금 시 <strong>기관명 또는 주문자명</strong>으로 입금 부탁드립니다.
                  </p>
                </div>
              </div>

              {/* Tax Invoice Request Section */}
              {isBertis && (
                <div className="space-y-4">
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4] space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800">전자세금계산서 발행 요청</h3>
                        <p className="text-[10px] text-slate-400 font-bold">계산서를 받으실 이메일 주소를 확인해주세요.</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">발행 이메일 주소</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="email"
                            value={taxEmail}
                            onChange={(e) => setTaxEmail(e.target.value)}
                            placeholder="invoice@company.com"
                            className="flex-1 min-w-0 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                          />
                          <button
                            onClick={handleTaxInvoiceRequest}
                            disabled={isTaxSubmitting}
                            className="sm:px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                          >
                            {isTaxSubmitting ? '요청 중...' : '발행 요청'}
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        ※ 요청하신 내용은 <strong>{NGS_EMAIL}</strong>으로 즉시 전달되며, 입금 확인 후 순차적으로 발행됩니다.
                      </p>
                    </div>
                  </div>

                  {/* Transaction Statement Request Section */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4] space-y-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800">거래명세서 발행 요청</h3>
                        <p className="text-[10px] text-slate-400 font-bold">발행 요청 시 등록된 이메일로 발송됩니다.</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 min-w-0 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold text-slate-500 truncate">
                          {taxEmail || '이메일을 먼저 입력해주세요'}
                        </div>
                        <button
                          onClick={handleStatementRequest}
                          disabled={isStatementSubmitting || !taxEmail}
                          className="sm:px-6 py-3 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                        >
                          {isStatementSubmitting ? '요청 중...' : '발행 요청'}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        ※ 거래명세서는 입금 전에도 발행 가능하며, 요청 즉시 담당자에게 전달됩니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
    </div>
  );
}
