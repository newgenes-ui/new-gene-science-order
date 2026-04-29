import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Search, Plus, Minus, ShoppingCart, FileText,
  User, Phone, Mail, Building2, MessageSquare, ChevronDown, ChevronUp, X, CreditCard, Copy, Clock, CheckCircle2
} from 'lucide-react';
import { PRODUCTS, CLIENTS, NGS_EMAIL, NGS_BANK } from '../data/products';
import { Order, OrderItem, generateOrderId, saveOrder } from '../store/orderStore';
import emailjs from '@emailjs/browser';

// ─── EmailJS 설정 (Vercel 환경변수로 관리) ───────────────────────
const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || '';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || '';
// ─────────────────────────────────────────────────────────────────

export default function OrderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const clientId = searchParams.get('client') || 'demo';
  
  // clientData를 찾되, 없을 경우 마지막(데모) 데이터 사용
  const clientData = useMemo(() => {
    return CLIENTS.find(c => c.id === clientId) || CLIENTS[CLIENTS.length - 1];
  }, [clientId]);

  const isBertis = clientId === 'bertis';

  // 초기 상태를 clientData에서 직접 가져옴
  const [clientName, setClientName] = useState(clientData.name);
  const [ordererName, setOrdererName] = useState(clientData.contactPerson || '');
  const [ordererPhone, setOrdererPhone] = useState(clientData.phone || '');
  const [ordererEmail, setOrdererEmail] = useState(clientData.email || '');

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
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuoteSuccess, setIsQuoteSuccess] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ 'AG Tip': true, '파이펫': true, '튜브': true, '랙': true });
  const [activeTab, setActiveTab] = useState<'quote' | 'order' | 'payment'>('order');

  const categories = ['전체', ...Array.from(new Set(PRODUCTS.map(p => p.category)))];

  const filteredProducts = PRODUCTS.filter(p => {
    const matchCat = selectedCategory === '전체' || p.category === selectedCategory;
    const matchSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase());
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
      orderType: orderItems.length > 0 ? 'order' : 'quote',
    };

    // 주문 내용 텍스트 구성
    const itemsText = orderItems.length > 0
      ? orderItems.map(i =>
          `• ${i.productName} (${i.productCode}) - ${i.spec} / ${i.quantity}개 / ₩${i.subtotal.toLocaleString()}`
        ).join('\n')
      : '(선택 제품 없음)';

    const emailParams = {
      order_title:    `[${order.orderType === 'order' ? '발주진행' : '견적문의'}] ${clientName} - ${ordererName}님`,
      order_id:       order.id,
      order_date:     order.orderDate,
      client_name:    clientName,
      orderer_name:   ordererName,
      orderer_phone:  order.ordererPhone,
      orderer_email:  order.ordererEmail || '(미입력)',
      items_text:     itemsText,
      subtotal_amount: `₩${subtotalAmount.toLocaleString()}`,
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
        
        // 1. 뉴진사이언스 본사로 발송
        const resNGS = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          ...emailParams,
          to_email: NGS_EMAIL, // << 중요: 템플릿의 To Email 필드가 {{to_email}} 이어야 함
          reply_to: ordererEmail || clientData.email || NGS_EMAIL,
        }, EMAILJS_PUBLIC_KEY);
        console.log('✅ 뉴진사이언스 발송 완료:', resNGS.status);

        // 2. 고객(베르티스 등)에게 발송
        const targetClientEmail = ordererEmail || clientData.email;
        if (targetClientEmail && targetClientEmail.includes('@')) {
          const resClient = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
            ...emailParams,
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
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-primary tracking-widest uppercase leading-none">New Gene Science</p>
              <p className="text-[10px] text-slate-400 leading-none mt-0.5">{clientName} 전용 주문</p>
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
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-primary rounded-3xl p-6 text-white relative overflow-hidden"
        >
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute -right-4 bottom-0 w-24 h-24 rounded-full bg-white/5" />
          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">Welcome</p>
            <h1 className="text-xl font-black">{clientName}님 반갑습니다! 👋</h1>
            <p className="text-xs opacity-70 mt-1">뉴진사이언스 제품을 편리하게 {activeTab === 'quote' ? '문의' : '주문'}하세요</p>
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
            발주서 제출
          </button>
          <button
            onClick={() => setActiveTab('payment')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'payment' ? 'bg-primary text-white shadow-lg shadow-green-900/20' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <CreditCard className="w-4 h-4" />
            결제하기
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
                {isBertis && (
                  <div className="bg-primary/5 rounded-3xl p-6 border border-primary/20">
                    <h2 className="flex items-center gap-2 text-sm font-extrabold text-primary mb-4">
                      <Building2 className="w-4 h-4" /> 공급사 정보 (뉴진사이언스)
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-12 gap-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">담당자</span>
                        <span className="text-sm font-bold text-slate-800">나혜원</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">연락처</span>
                        <span className="text-sm font-bold text-slate-800">010-9915-5974</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">이메일</span>
                        <span className="text-sm font-bold text-slate-800">newgenes@newgenesci.com</span>
                      </div>
                    </div>
                  </div>
                )}

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
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="제품명 또는 코드로 검색..." className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
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
                    const expanded = expandedCategories[cat] !== false;
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
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#E2E8E4] text-center space-y-6">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                  <CreditCard className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">무통장 입금 안내</h2>
                  <p className="text-sm text-slate-400 mt-1">아래 계좌로 입금해 주시면 확인 후 처리됩니다.</p>
                </div>
                
                <div className="bg-slate-50 rounded-2xl p-6 text-left space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-bold uppercase">은행명</span>
                    <span className="font-bold text-slate-800">{NGS_BANK.bank}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-bold uppercase">예금주</span>
                    <span className="font-bold text-slate-800">{NGS_BANK.holder}</span>
                  </div>
                  <div className="flex flex-col gap-2 pt-2 border-t border-dashed border-slate-200">
                    <span className="text-xs text-slate-400 font-bold uppercase">계좌번호</span>
                    <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-100">
                      <span className="font-black text-slate-800 font-mono text-lg">{NGS_BANK.account}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(NGS_BANK.account);
                          alert('계좌번호가 복사되었습니다.');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-dark transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        복사
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3 text-left">
                  <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-medium leading-relaxed">
                    발주서 제출 후 <strong>3영업일 이내</strong>에 입금해 주세요. <br />
                    입금 시 <strong>기관명 또는 주문자명</strong>으로 입금해 주시면 더 빠른 확인이 가능합니다.
                  </p>
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
                  {cartItems.length > 0 ? '발주서 처리 중' : '견적문의 제출 처리중'}
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
