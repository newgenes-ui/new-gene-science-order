import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3, Calendar, Download, TrendingUp, Package,
  DollarSign, ShoppingBag, Search, ChevronDown, ChevronUp, Eye, RefreshCw, MessageSquare, Trash2,
  Smartphone, Share, X
} from 'lucide-react';
import { getOrders, getOrdersFromSupabase, STATUS_LABELS, STATUS_COLORS, Order, OrderItem, deleteOrder, updateOrderStatus, updateQuoteDetails, subscribeToOrders, fixShippedDates } from '../store/orderStore';
import { NGS_EMAIL } from '../data/products';
import emailjs from '@emailjs/browser';
import AdminPinLock from '../components/AdminPinLock';

// 주문번호 표시용:
// 1) 신규 형식: NGS-[clientId]-[YYYYMMDD]-[X]-[HHMMSS] -> YYYYMMDD-HHMMSS
// 2) 기존 형식: NGS-[YYYYMMDD]-[X]-[HHMMSS] -> YYYYMMDD-HHMMSS
const formatOrderId = (id: string): string => {
  const clean = id.replace('NGS-', '');
  const parts = clean.split('-');
  if (parts.length >= 4) {
    const datePart = parts[1];
    const timePart = parts[parts.length - 1];
    return `${datePart}-${timePart}`;
  }
  if (parts.length === 3) {
    return `${parts[0]}-${parts[2]}`;
  }
  return clean;
};


const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || '';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '';
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '';

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 border border-[#E2E8E4] shadow-sm"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-black text-slate-800">{value}</p>
      <p className="text-xs font-bold text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-primary font-bold mt-1">{sub}</p>}
    </motion.div>
  );
}

// ── 알림음 재생 함수 (Web Audio API 기반) ──────────────────────────────
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playTone = (freq: number, start: number, duration: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    // 3음 멜로디 알림 (도-미-솔)
    playTone(523.25, 0, 0.2);      // C5
    playTone(659.25, 0.2, 0.2);    // E5
    playTone(783.99, 0.4, 0.35);   // G5
  } catch (e) {
    console.warn('알림음 재생 실패:', e);
  }
}

export default function AdminDashboard() {
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    // KST (UTC+9) 반영
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    kstDate.setDate(kstDate.getDate() - 30);
    return kstDate.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => {
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return kstDate.toISOString().slice(0, 10);
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [isOrdererInfoCollapsed, setIsOrdererInfoCollapsed] = useState<Record<string, boolean>>({});
  const [isQuoteInputCollapsed, setIsQuoteInputCollapsed] = useState<Record<string, boolean>>({});
  const [clientFilter, setClientFilter] = useState('전체');
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeListTab, setActiveListTab] = useState<'order' | 'quote'>('order');
  const [isSaving, setIsSaving] = useState(false);
  const prevOrderCountRef = useRef<number>(0);
  const isFirstLoadRef = useRef(true);

  // PWA 앱 설치 관련 상태
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isInApp, setIsInApp] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const wakeLockRef = useRef<any>(null);


  // Supabase + localStorage 병합 로드 (주문자 화면과 동일한 방식)
  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const supabaseOrders = await getOrdersFromSupabase();
      let localOrders = getOrders();

      // [보안 정리] 타 업체 오귀속 로컬 캐시 청소
      const cleanedLocal = localOrders.filter((o: any) => {
        const isGhostOrder = (o.id === 'NGS-20260526-1-180109' || o.id === 'NGS-20260526-180109' || o.id.includes('180109')) && o.clientId !== 'immuno';
        return !isGhostOrder;
      });
      if (cleanedLocal.length !== localOrders.length) {
        localStorage.setItem('ngs_orders', JSON.stringify(cleanedLocal));
        localOrders = cleanedLocal;
      }

      let finalSupabaseOrders: Order[] = [];
      if (supabaseOrders !== null) {
        finalSupabaseOrders = supabaseOrders;
        
        // Supabase에 저장되어 있는 주문들만 남기고 로컬 정리
        const remoteIds = new Set(supabaseOrders.map(o => o.id));
        const filteredLocal = localOrders.filter(o => remoteIds.has(o.id));
        if (filteredLocal.length !== localOrders.length) {
          localStorage.setItem('ngs_orders', JSON.stringify(filteredLocal));
        }
      }

      // 2. ID를 기준으로 중복을 제거하며 병합 (로컬 최신 데이터 우선)
      const mergedMap = new Map<string, Order>();
      
      const activeLocalOrders = supabaseOrders !== null
        ? localOrders.filter(o => new Set(supabaseOrders.map(r => r.id)).has(o.id))
        : localOrders;

      activeLocalOrders.forEach(o => mergedMap.set(o.id, o));
      
      // 서버 데이터를 병합하되, "진행도가 더 높은 상태"와 "더 큰 금액"을 유지하는 스마트 병합
      const statusRank: Record<string, number> = {
        'pending': 1,
        'payment_waiting': 2,
        'processing': 3,
        'order_requested': 4,
        'shipped': 5,
        'cancelled': 6
      };

      finalSupabaseOrders.forEach(remote => {
        const local = mergedMap.get(remote.id);
        if (!local) {
          mergedMap.set(remote.id, remote);
        } else {
          // 보안 장치: ID가 같더라도 clientId가 다르면 병합하지 않고 서버 데이터를 우선하여 덮어씀
          if (local.clientId !== remote.clientId) {
            console.warn(`[보안 경고] ID 충돌 감지 (${remote.id}): 로컬 clientId(${local.clientId}) !== 서버 clientId(${remote.clientId}). 서버 데이터로 강제 대체합니다.`);
            mergedMap.set(remote.id, remote);
            return;
          }

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

      const merged = Array.from(mergedMap.values());
      setAllOrders(merged.length > 0 ? merged : []);
    } catch {
      setAllOrders(getOrders());
    }
    setIsLoading(false);
  };

  useEffect(() => {
    // 브라우저 탭 타이틀 설정
    document.title = "관리자 대시보드 | 뉴진사이언스";

    // EmailJS 초기화 (OrderPage와 동일하게)
    if (EMAILJS_PUBLIC_KEY) {
      emailjs.init(EMAILJS_PUBLIC_KEY);
    }

    // 납품완료 날짜가 오늘로 잘못 기록된 주문을 자동 수정 후 데이터 로드
    fixShippedDates().then(logs => {
      const fixes = logs.filter(l => l.startsWith('✅'));
      if (fixes.length > 0) console.log('🔧 납품완료 날짜 자동 수정:', fixes);
    }).finally(() => {
      loadOrders();
    });
    // Supabase 실시간 구독 설정 (데이터 변경 시 즉시 갱신 + 알림음)
    const unsubscribe = subscribeToOrders((payload: any) => {
      // INSERT 이벤트(새 주문/견적)일 때만 알림음 재생
      if (payload?.eventType === 'INSERT') {
        playNotificationSound();
        // 브라우저 알림도 시도 (권한이 있는 경우)
        if ('Notification' in window && Notification.permission === 'granted') {
          const orderType = payload.new?.order_type === 'quote' ? '견적문의' : '새 주문';
          const clientName = payload.new?.client_name || '';
          new Notification('관리자대시보드', {
            body: `${clientName} - ${orderType}이(가) 접수되었습니다.`,
            icon: '/icon-192.png',
            tag: 'new-order'
          });
        }
      }
      loadOrders();
    });

    // 브라우저 알림 권한 요청
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // PWA 설치 프롬프트 감지
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(standalone);
    const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iosDevice);
    const inApp = /KAKAOTALK|NAVER|Line|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
    setIsInApp(inApp);

    if (!standalone) {
      const handleBeforeInstall = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowInstallBanner(true);
      };
      window.addEventListener('beforeinstallprompt', handleBeforeInstall);

      // iOS이거나 이벤트가 발생하지 않는 경우 2초 후 배너 표시
      const fallback = setTimeout(() => {
        if (!standalone) setShowInstallBanner(true);
      }, 2000);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        clearTimeout(fallback);
        unsubscribe();
      };
    }
    
    return () => { unsubscribe(); };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      const userAgent = navigator.userAgent || '';
      const isKakaotalk = /KAKAOTALK/i.test(userAgent);
      const isNaver = /NAVER/i.test(userAgent);
      const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;

      if (isKakaotalk || isNaver) {
        alert(
          "📲 카카오톡/네이버 브라우저 안내\n\n" +
          "현재 보시는 브라우저(인앱)에서는 보안 정책상 앱 직접 설치가 차단되어 있습니다.\n\n" +
          "오른쪽 맨 위(또는 맨 아래)의 메뉴(⋮)를 누르신 후 [다른 브라우저로 열기] (또는 기본 브라우저로 열기)를 선택해 주세요!\n\n" +
          "그 후 열리는 크롬이나 삼성 인터넷에서 '앱 설치하기'를 누르시면 즉시 정상 설치가 진행됩니다."
        );
      } else if (isIOS) {
        alert(
          "📲 아이폰(Safari) 설치 안내\n\n" +
          "1. Safari 브라우저 하단의 [공유] 버튼(⬆️)을 누릅니다.\n" +
          "2. 메뉴에서 [홈 화면에 추가]를 선택합니다.\n" +
          "3. 우측 상단의 [추가]를 누르면 즉시 휴대폰에 설치됩니다!"
        );
      } else {
        alert(
          "📲 관리자대시보드 즉시 설치 방법:\n\n" +
          "1. 화면 맨 아래 오른쪽 메뉴(⋮)를 탭하세요.\n" +
          "2. [현재 페이지 추가] 또는 [앱 설치]를 선택하세요.\n" +
          "3. [홈 화면]을 누르고 [추가]를 선택하면 휴대폰에 즉시 설치됩니다!\n\n" +
          "※ 크롬(Chrome) 브라우저인 경우: 우측 상단 메뉴(⋮) → [홈 화면에 추가] 또는 [앱 설치]"
        );
      }
    }
  };

  // 화면 켜짐 유지(Wake Lock) 제어 함수
  const toggleWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        if (!isWakeLockActive) {
          const lock = await (navigator as any).wakeLock.request('screen');
          wakeLockRef.current = lock;
          setIsWakeLockActive(true);
          
          lock.addEventListener('release', () => {
            setIsWakeLockActive(false);
          });
        } else {
          if (wakeLockRef.current) {
            await wakeLockRef.current.release();
            wakeLockRef.current = null;
          }
          setIsWakeLockActive(false);
        }
      } catch (err) {
        console.error('화면 켜짐 유지 설정 실패:', err);
      }
    } else {
      alert('죄송합니다. 현재 기기 및 브라우저는 화면 항상 켜짐 기능을 지원하지 않습니다.\n크롬 또는 삼성 인터넷 최신 버전을 사용해 주세요.');
    }
  };

  // 컴포넌트 해제 시 Wake Lock 락 해제
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch((e: any) => console.log('WakeLock 해제 오류:', e));
      }
    };
  }, []);

  const filteredOrders = useMemo(() => {
    // 기본 필터링 및 날짜 정렬 적용
    return allOrders
      .filter(o => {
        const inDate = o.orderDate >= fromDate && o.orderDate <= toDate;
        const inSearch = !searchTerm ||
          o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          o.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          o.ordererName.toLowerCase().includes(searchTerm.toLowerCase());
        const inClient = clientFilter === '전체' || o.clientName === clientFilter;
        return inDate && inSearch && inClient;
      })
      .sort((a, b) => b.orderDateTime.localeCompare(a.orderDateTime));
  }, [allOrders, fromDate, toDate, searchTerm, clientFilter]);

  const ordersList = useMemo(() => filteredOrders.filter(o => {
    const type = (o.orderType || '').toLowerCase().trim();
    const status = (o.status || '').toLowerCase().trim();
    const isQuoteStatus = ['order_requested', 'processing'].includes(status);
    const isQuoteByAmount = Number(o.quoteAmount || 0) > 0;
    return type === 'order' && !isQuoteStatus && !isQuoteByAmount;
  }), [filteredOrders]);
  const quotesList = useMemo(() => filteredOrders.filter(o => {
    const type = (o.orderType || '').toLowerCase().trim();
    const status = (o.status || '').toLowerCase().trim();
    const isQuoteStatus = ['order_requested', 'processing'].includes(status);
    const isQuoteByAmount = Number(o.quoteAmount || 0) > 0;
    return type === 'quote' || isQuoteStatus || isQuoteByAmount;
  }), [filteredOrders]);

  const totalRevenue = filteredOrders.reduce((s, o) => s + o.totalAmount, 0);
  const totalItems = filteredOrders.reduce((s, o) => s + o.items.reduce((is, i) => is + i.quantity, 0), 0);

  const clientNames = ['전체', ...Array.from(new Set(allOrders.map(o => o.clientName)))];


  const handleDelete = async (id: string) => {
    try {
      deleteOrder(id);
      setAllOrders(prev => prev.filter(o => o.id !== id));
      setDeletingId(null);
    } catch (err: any) {
      alert('삭제 중 오류가 발생했습니다: ' + err.message);
    }
  };



  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
  const [editingQuoteItems, setEditingQuoteItems] = useState<Record<string, OrderItem[]>>({});

  const sendQuoteEmail = async (order: Order) => {
    if (!order.ordererEmail || !order.ordererEmail.includes('@')) return;

    // 100% 확실한 정식 URL 및 데이터 안전장치
    const quoteUrl = "https://new-gene-science-order.vercel.app/quote?ids=" + order.id;
    const client = order.clientName || "(주)보령제약";
    const name = order.ordererName || "담당자";
    const phone = order.ordererPhone || "-";
    const email = order.ordererEmail || "-";

    // 템플릿이 어떤 변수명을 쓰더라도 대응할 수 있도록 모든 이름으로 송신
    const emailContent = "기관명: " + client + "\n주문자: " + name + "\n연락처: " + phone + "\n이메일: " + email + "\n\n▶ [공식 견적서 확인 및 인쇄]\n" + quoteUrl + "\n\n--------------------------\n[안내]\n위 링크를 클릭하시면 공식 견적서를 확인하실 수 있습니다.";

    const emailParams = {
      order_title: "[(주)뉴진사이언스] 견적서 도착 - " + client,
      detail_label: "견적서 확인",
      items_text: emailContent,    // 기본 변수
      message: emailContent,       // 대체 변수 1
      content: emailContent,       // 대체 변수 2
      order_details: emailContent, // 대체 변수 3
      
      // 개별 필드 대응
      client_name: client,
      orderer_name: name,
      orderer_phone: phone,
      orderer_email: email,
      customer_name: name,
      from_name: name,
      contact_number: phone,
      to_email: email,
      reply_to: email
    };

    if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
      try {
        console.log('📧 견적서 이메일 발송 시도 (V5)...', email);
        await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, emailParams, EMAILJS_PUBLIC_KEY);
      } catch (err) {
        console.error('❌ 발송 오류:', err);
      }
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: Order['status']) => {
    try {
      const success = await updateOrderStatus(id, newStatus);
      if (success) {
        setAllOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
        
        if (newStatus === 'processing') {
          const targetOrder = allOrders.find(o => o.id === id);
          if (targetOrder) {
            sendQuoteEmail({ ...targetOrder, status: newStatus });
          }
        }
      } else {
        alert('DB 업데이트 실패');
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleQuoteAmountUpdate = async (id: string) => {
    const amountStr = quoteAmounts[id];
    if (!amountStr) { alert('금액을 입력해주세요.'); return; }
    const amount = parseInt(amountStr.replace(/[^0-9]/g, ''));
    if (isNaN(amount)) { alert('숫자만 입력해주세요.'); return; }

    try {
      // 상세 품목 없이 금액만 업데이트할 때도 updateQuoteDetails 사용 가능하도록 하거나 기존 유지
      // 여기서는 기존 로직을 상세 입력 폼으로 대체할 것이므로 이 함수는 보조적으로 남겨둠
      const order = allOrders.find(o => o.id === id);
      if (!order) return;
      
      const subtotal = Math.floor(amount / 1.1);
      const vat = amount - subtotal;
      
      const success = await updateQuoteDetails(id, order.items, subtotal, vat, amount);
      if (success) {
        // 금액 업데이트와 동시에 상태를 'processing'(견적전송)으로 변경
        await updateOrderStatus(id, 'processing');
        const updatedOrder = { 
          ...order, 
          status: 'processing',
          quoteAmount: amount, 
          totalAmount: amount, 
          subtotalAmount: subtotal, 
          vatAmount: vat 
        };
        setAllOrders(prev => prev.map(o => o.id === id ? updatedOrder : o));
        
        // 이메일 발송
        sendQuoteEmail(updatedOrder);
        
        alert('견적 금액이 전송되었습니다.');
      }
    } catch (err: any) {
      alert('견적 금액 업데이트 중 오류가 발생했습니다:\n' + err.message);
    }
  };

  const calculateOrderTotals = (id: string) => {
    const items = editingQuoteItems[id] || allOrders.find(o => o.id === id)?.items || [];
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const vat = Math.floor(subtotal * 0.1);
    const total = subtotal + vat;
    return { subtotal, vat, total };
  };

  const handleSaveQuoteDetails = async (id: string) => {
    const { subtotal, vat, total } = calculateOrderTotals(id);
    const items = editingQuoteItems[id] || [];
    if (items.length === 0) { alert('최소 하나 이상의 품목을 입력해주세요.'); return; }
    
    setIsSaving(true);
    try {
      const success = await updateQuoteDetails(id, items, subtotal, vat, total);
      if (success) {
        const order = allOrders.find(o => o.id === id);
        const updatedOrder = { 
          ...order!,
          items, 
          subtotalAmount: subtotal, 
          vatAmount: vat, 
          totalAmount: total,
          quoteAmount: total 
        };
        setAllOrders(prev => prev.map(o => o.id === id ? updatedOrder : o));

        // 이미 '전송' 상태인 경우, 상세 내용 저장 시 이메일 재발송
        if (order?.status === 'processing') {
          sendQuoteEmail(updatedOrder);
        }
        
        alert('견적 상세 내용이 저장되었습니다.');
      }
    } catch (err: any) {
      alert('저장 중 오류가 발생했습니다:\n' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const addQuoteItem = (orderId: string) => {
    const order = allOrders.find(o => o.id === orderId);
    const currentItems = editingQuoteItems[orderId] || order?.items || [];
    const newItem: OrderItem = {
      productId: `custom-${Date.now()}`,
      productCode: '',
      productName: '',
      spec: '',
      unitPrice: 0,
      quantity: 1,
      subtotal: 0
    };
    setEditingQuoteItems(prev => ({
      ...prev,
      [orderId]: [...currentItems, newItem]
    }));
  };

  // 상세 입력창을 열 때 품목이 없으면 자동으로 하나 추가
  const toggleQuoteInput = (orderId: string) => {
    const isNowExpanded = !isQuoteInputCollapsed[orderId];
    setIsQuoteInputCollapsed(prev => ({ ...prev, [orderId]: isNowExpanded }));
    
    if (isNowExpanded) {
      const order = allOrders.find(o => o.id === orderId);
      const currentItems = editingQuoteItems[orderId] || order?.items || [];
      if (currentItems.length === 0) {
        addQuoteItem(orderId);
      }
    }
  };

  const updateQuoteItemField = (orderId: string, index: number, field: keyof OrderItem, value: any) => {
    const currentItems = [...(editingQuoteItems[orderId] || allOrders.find(o => o.id === orderId)?.items || [])];
    const item = { ...currentItems[index], [field]: value };
    
    if (field === 'unitPrice' || field === 'quantity') {
      item.subtotal = (item.unitPrice || 0) * (item.quantity || 0);
    }
    
    currentItems[index] = item;
    setEditingQuoteItems(prev => ({
      ...prev,
      [orderId]: currentItems
    }));
  };

  const removeQuoteItem = (orderId: string, index: number) => {
    const currentItems = [...(editingQuoteItems[orderId] || allOrders.find(o => o.id === orderId)?.items || [])];
    currentItems.splice(index, 1);
    setEditingQuoteItems(prev => ({
      ...prev,
      [orderId]: currentItems
    }));
  };

  const downloadCSV = () => {
    // 모든 필드를 따옴표로 감싸서 쉼표(,) 충돌 방지
    const escape = (val: any) => `"${String(val).replace(/"/g, '""')}"`;
    const headers = ['주문일', '업체명', '구분', '주문번호', '주문자', '제품코드', '제품명', '수량', '단가', '단가합계', '주문공급가액', '주문부가세', '주문총액', '상태'].map(escape);
    const rows: string[] = [];

    filteredOrders.forEach(o => {
      o.items.forEach(item => {
        const row = [
          o.orderDate,
          o.clientName,
          o.orderType === 'order' ? '발주' : '견적',
          o.id,
          o.ordererName,
          item.productCode,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.subtotal,
          o.subtotalAmount,
          o.vatAmount,
          o.totalAmount,
          STATUS_LABELS[o.status]
        ].map(escape);
        rows.push(row.join(','));
      });
      if (o.otherRequest && o.orderType === 'order') {
        const otherRow = [o.orderDate, o.clientName, '발주(기타)', o.id, o.ordererName, '-', '기타 요청사항', '-', '-', '-', o.otherRequest].map(escape);
        rows.push(otherRow.join(','));
      } else if (o.orderType === 'quote') {
        // 이미 아이템 루프에서 처리되지 않았을 경우 (견적은 아이템이 보통 0개)
        if (o.items.length === 0) {
          const quoteRow = [o.orderDate, o.clientName, '견적문의', o.id, o.ordererName, '-', o.otherRequest, '-', '-', '-', STATUS_LABELS[o.status]].map(escape);
          rows.push(quoteRow.join(','));
        }
      }
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const encodedUri = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvContent);

    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NGS_Data_${fromDate.replace(/-/g, '')}.csv`);
    document.body.appendChild(link);

    alert('데이터 생성이 완료되었습니다. 다운로드를 시작합니다.');
    link.click();

    setTimeout(() => {
      document.body.removeChild(link);
    }, 200);
  };

  return (
    <AdminPinLock>
    <div className="min-h-screen bg-[#F0F4F1] pb-40">
      <header className="bg-white/80 backdrop-blur-xl border-b border-[#E2E8E4] sticky top-0 z-40 py-3 md:py-0">
        <div className="max-w-5xl mx-auto px-4 min-h-16 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-primary">관리자 대시보드</h1>
              <p className="text-[10px] text-slate-400">실시간 주문 및 견적 현황</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold ${allOrders.length > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${allOrders.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {allOrders.length > 0 ? 'DB 연결됨' : '로컬 모드'}
            </div>
            <span className="hidden lg:inline text-[10px] text-slate-400">v2.1.0 Official</span>
            <button
              onClick={toggleWakeLock}
              className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 ${
                isWakeLockActive 
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 hover:bg-amber-600' 
                  : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
              }`}
              title="실시간 소리 알림 수신을 위해 모바일이나 PC 화면이 꺼지지 않도록 유지합니다."
            >
              <Smartphone className={`w-3.5 h-3.5 ${isWakeLockActive ? 'animate-pulse' : ''}`} />
              <span>{isWakeLockActive ? '화면 켜짐' : '실시간 알림'}</span>
            </button>
            <button
              onClick={loadOrders}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">새로고침</span>
            </button>
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-3 md:px-4 py-2 bg-primary text-white rounded-xl font-bold text-xs hover:bg-primary-dark transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">CSV 다운로드</span>
              <span className="md:hidden">CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* 앱 설치 배너 */}
      {showInstallBanner && !isStandalone && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto px-4 pt-4"
        >
          <div className="bg-gradient-to-r from-[#2D5A47] to-[#3a7a5f] rounded-2xl p-4 shadow-lg border border-[#4a8a6f]/30">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-white">📲 관리자대시보드 앱 설치</h3>
                <p className="text-[11px] text-white/70 font-medium mt-0.5">
                  {isInApp 
                    ? "⚠️ 카카오톡/네이버 브라우저에서는 외부 브라우저 이동이 필요합니다." 
                    : "홈 화면에 설치하면 앱처럼 바로 접속하고 푸시 알림을 받을 수 있습니다."}
                </p>
              </div>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors shrink-0"
              >
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleInstallClick}
                className="flex-1 py-3 bg-white text-[#2D5A47] rounded-xl font-black text-sm shadow-md hover:bg-white/90 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                앱 설치하기
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 border border-[#E2E8E4] flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">시작일</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">종료일</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">업체</label>
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {clientNames.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">검색</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="주문번호 / 업체명 / 주문자"
                className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<ShoppingBag className="w-4 h-4" />} label="총 주문 건수" value={`${filteredOrders.length}건`} />
          <StatCard icon={<DollarSign className="w-4 h-4" />} label="총 매출" value={`₩${totalRevenue.toLocaleString()}`} />
          <StatCard icon={<Package className="w-4 h-4" />} label="총 판매 수량" value={`${totalItems.toLocaleString()}개`} />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="건당 평균" value={filteredOrders.length > 0 ? `₩${Math.floor(totalRevenue / filteredOrders.length).toLocaleString()}` : '-'} />
        </div>

        {/* Tab Navigation for Lists */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex bg-white/50 backdrop-blur-md p-1 rounded-xl border border-[#E2E8E4] shadow-sm w-full md:w-auto">
            <button
              onClick={() => setActiveListTab('order')}
              className={`px-16 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeListTab === 'order' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              발주 내역 ({ordersList.length})
            </button>
            <button
              onClick={() => setActiveListTab('quote')}
              className={`px-16 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${activeListTab === 'quote' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              견적 문의 ({quotesList.length})
            </button>
          </div>
        </div>



        {/* Conditional Table Rendering */}
        {activeListTab === 'order' ? (
          <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8E4] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-primary" /> 발주 목록
                <span className="ml-auto text-xs font-bold text-slate-400">{ordersList.length}건</span>

              </h2>
            </div>
            <div className="divide-y divide-slate-50">
              {ordersList.length === 0 ? (
                <div className="py-16 text-center text-slate-300">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-3" />
                  <p className="text-sm font-bold">조회된 발주 내역이 없습니다</p>
                </div>
              ) : ordersList.map(order => (
                <div key={order.id}>
                  <div
                    className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  >
                    <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4">
                      {/* 기본 정보 영역 */}
                      {/* 기본 정보 영역 (6칸 그리드로 재배치) */}
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
                        <div className="col-span-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">
                            {formatOrderId(order.id)}
                          </p>
                          <p className="text-xs font-mono font-bold text-slate-700 truncate">
                            {order.items && order.items.length > 0 ? order.items[0].productCode : order.id}
                          </p>
                        </div>
                        <div className="col-span-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">업체명</p>
                          <p className="text-sm font-bold text-slate-700 truncate">{order.clientName}</p>
                        </div>
                        <div className="col-span-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">주문자</p>
                          <p className="text-sm font-bold text-slate-700 truncate">{order.ordererName}</p>
                        </div>
                        <div className="hidden md:block col-span-2">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">품목명 / 요청 사항</p>
                          <p className="text-sm font-black text-slate-700 truncate">
                            {order.items && order.items.length > 0
                              ? `${order.items[0].productName}${order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}`
                              : order.otherRequest || '상세 내용 없음'}
                          </p>
                        </div>
                        <div className="col-span-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">총 금액</p>
                          <p className="text-sm font-black text-primary">₩{order.totalAmount.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* 상태 관리 영역 */}
                      {/* 상태 관리 영역 */}
                      <div className="flex items-center justify-start md:justify-end gap-2 w-full md:w-[290px] shrink-0 overflow-x-auto pb-1 md:pb-0">
                        {order.status === 'cancelled' ? (
                          <div className="w-full md:text-right md:pr-2">
                            <span className="px-3 py-1.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-600 border border-rose-200 inline-block">
                              주문취소
                            </span>
                          </div>
                        ) : (
                          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 whitespace-nowrap md:ml-auto">
                            {[
                              { id: 'pending', label: '주문' },
                              { id: 'shipped', label: '납품완료' }
                            ].map((s) => (
                              <button
                                key={s.id}
                                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, s.id as Order['status']); }}
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${
                                    (s.id === 'pending' && order.status !== 'shipped') || (s.id === 'shipped' && order.status === 'shipped')
                                    ? 'text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] scale-110 ring-2 ring-white/30 z-10'
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-white/80 opacity-60 hover:opacity-100'
                                  }`}
                                style={(s.id === 'pending' && order.status !== 'shipped') || (s.id === 'shipped' && order.status === 'shipped') ? { backgroundColor: STATUS_COLORS[s.id as Order['status']] || '#94a3b8', opacity: 1 } : {}}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {order.status !== 'shipped' && order.status !== 'cancelled' && (
                        cancellingId === order.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                await handleStatusUpdate(order.id, 'cancelled'); 
                                setCancellingId(null); 
                              }}
                              className="px-2.5 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-all shadow-sm whitespace-nowrap"
                            >
                              진짜 취소
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setCancellingId(null); }}
                              className="px-2 py-1 bg-slate-100 text-slate-400 text-[10px] font-bold rounded-lg hover:bg-slate-200 whitespace-nowrap"
                            >
                              닫기
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCancellingId(order.id);
                            }}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors rounded-xl text-[10px] font-black whitespace-nowrap"
                            title="취소"
                          >
                            취소
                          </button>
                        )
                      )}
                      {expandedOrder === order.id ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm('이 발주 내역을 삭제하시겠습니까?\n삭제 후 복구가 불가능합니다.')) {
                            await handleDelete(order.id);
                          }
                        }}
                        title="삭제"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {expandedOrder === order.id && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 bg-slate-50/50 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                          <div>
                            <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">주문자 정보</p>
                            <p className="text-sm text-slate-600">📞 {order.ordererPhone}</p>
                            <p className="text-sm text-slate-600">✉️ {order.ordererEmail || '-'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                              발주 품목
                            </p>
                            <div className="space-y-1">
                              {order.items.map((item, i) => (
                                <div key={i} className="flex justify-between text-sm">
                                  <span className="text-slate-600 truncate flex-1 mr-2">{item.productName}</span>
                                  <span className="font-bold text-slate-500 shrink-0">×{item.quantity} = ₩{item.subtotal.toLocaleString()}</span>
                                </div>
                              ))}
                              <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                                <div className="flex justify-between text-[11px] font-bold text-slate-400">
                                  <span>공급가액</span>
                                  <span>₩{order.subtotalAmount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[11px] font-bold text-slate-400">
                                  <span>부가세</span>
                                  <span>₩{order.vatAmount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm font-black text-primary pt-1">
                                  <span>합계</span>
                                  <span>₩{order.totalAmount.toLocaleString()}</span>
                                </div>
                              </div>
                              {order.otherRequest && (
                                <p className="text-xs text-slate-400 italic mt-1">기타: {order.otherRequest}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8E4] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" /> 견적문의 목록
                <span className="ml-auto text-xs font-bold text-slate-400">{quotesList.length}건</span>

              </h2>
            </div>
            <div className="divide-y divide-slate-50">
              {quotesList.length === 0 ? (
                <div className="py-16 text-center text-slate-300">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3" />
                  <p className="text-sm font-bold">조회된 견적문의가 없습니다</p>
                </div>
              ) : quotesList.map(order => (
                <div key={order.id}>
                  <div
                    className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => {
                      const isExpanding = expandedOrder !== order.id;
                      setExpandedOrder(isExpanding ? order.id : null);
                      // 펼칠 때 자동으로 품목 입력 영역도 열기
                      if (isExpanding) {
                        setIsQuoteInputCollapsed(prev => ({ ...prev, [order.id]: false }));
                        const currentItems = editingQuoteItems[order.id] || order.items || [];
                        if (currentItems.length === 0) {
                          addQuoteItem(order.id);
                        }
                      }
                    }}
                  >
                    <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4">
                      {/* 기본 정보 영역 */}
                      {/* 기본 정보 영역 (6칸 그리드로 재배치) */}
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
                        <div className="col-span-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">
                            {formatOrderId(order.id)}
                          </p>
                          <p className="text-xs font-mono font-bold text-slate-700 truncate">
                            {order.items && order.items.length > 0 ? order.items[0].productCode : order.id}
                          </p>
                        </div>
                        <div className="col-span-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">업체명</p>
                          <p className="text-sm font-bold text-slate-700 truncate">{order.clientName}</p>
                        </div>
                        <div className="col-span-1">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">문의자</p>
                          <p className="text-sm font-bold text-slate-700 truncate">{order.ordererName}</p>
                        </div>
                        <div className="hidden md:block col-span-3">
                          <p className="text-[10px] font-bold text-slate-400 mb-0.5">품목명 / 요청 사항</p>
                          <p className="text-sm font-black text-slate-700 truncate">
                            {order.items && order.items.length > 0
                              ? `${order.items[0].productName}${order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : ''}${order.otherRequest ? ` / ${order.otherRequest}` : ''}`
                              : order.otherRequest || '상세 내용 없음'}
                          </p>
                        </div>
                      </div>

                      {/* 상태 및 금액 입력 영역 */}
                      <div className="flex items-center justify-start md:justify-end gap-3 w-full md:w-[420px] shrink-0">
                        {order.status === 'cancelled' ? (
                          <div className="w-full md:text-right md:pr-2">
                            <span className="px-3 py-1.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-600 border border-rose-200 inline-block">
                              견적취소
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 w-full">
                              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 whitespace-nowrap">
                                {[
                                  { id: 'pending', label: '접수' },
                                  { id: 'processing', label: '전송' },
                                  { id: 'order_requested', label: '주문' },
                                  { id: 'shipped', label: '납품완료' }
                                ].map((s) => (
                                  <button
                                    key={s.id}
                                    onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, s.id as Order['status']); }}
                                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${String(order.status).toLowerCase() === String(s.id).toLowerCase()
                                        ? 'text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] scale-110 ring-2 ring-white/30 z-10'
                                        : 'text-slate-400 hover:text-slate-600 hover:bg-white/80 opacity-60 hover:opacity-100'
                                      }`}
                                    style={String(order.status).toLowerCase() === String(s.id).toLowerCase() ? { backgroundColor: s.id === 'processing' ? '#ef4444' : (STATUS_COLORS[s.id as Order['status']] || '#94a3b8'), opacity: 1 } : {}}
                                  >
                                    {s.label}
                                  </button>
                                ))}
                              </div>
                            <div className="flex-1 flex gap-1 items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                              <input
                                type="text"
                                value={quoteAmounts[order.id] !== undefined 
                                  ? quoteAmounts[order.id] 
                                  : ((order.quoteAmount || order.totalAmount) ? (order.quoteAmount || order.totalAmount).toLocaleString() : '')}
                                onChange={(e) => {
                                  const rawValue = e.target.value.replace(/[^0-9]/g, '');
                                  if (rawValue === '') {
                                    setQuoteAmounts(prev => ({ ...prev, [order.id]: '' }));
                                    return;
                                  }
                                  const formattedValue = Number(rawValue).toLocaleString();
                                  setQuoteAmounts(prev => ({ ...prev, [order.id]: formattedValue }));
                                }}
                                placeholder="금액 입력"
                                disabled={order.status !== 'pending'}
                                className={`w-full bg-white px-2 py-1.5 rounded-lg text-xs font-bold focus:outline-none ${order.status !== 'pending' ? 'opacity-70 cursor-not-allowed bg-slate-50' : ''}`}
                                onClick={(e) => e.stopPropagation()}
                              />
                              {order.status === 'pending' ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleQuoteAmountUpdate(order.id); }}
                                  className="px-3 py-1.5 bg-primary text-white rounded-lg text-[10px] font-black hover:bg-primary-dark transition-all shrink-0"
                                >
                                  금액입력
                                </button>
                              ) : order.status === 'order_requested' ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, 'shipped'); }}
                                  className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-[10px] font-black hover:bg-emerald-600 transition-all shrink-0 shadow-sm"
                                >
                                  납품완료 처리
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {order.status !== 'shipped' && order.status !== 'cancelled' && (
                        cancellingId === order.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={async (e) => { 
                                e.stopPropagation(); 
                                await handleStatusUpdate(order.id, 'cancelled'); 
                                setCancellingId(null); 
                              }}
                              className="px-2.5 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-all shadow-sm whitespace-nowrap"
                            >
                              진짜 취소
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setCancellingId(null); }}
                              className="px-2 py-1 bg-slate-100 text-slate-400 text-[10px] font-bold rounded-lg hover:bg-slate-200 whitespace-nowrap"
                            >
                              닫기
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCancellingId(order.id);
                            }}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors rounded-xl text-[10px] font-black whitespace-nowrap"
                            title="취소"
                          >
                            취소
                          </button>
                        )
                      )}
                      {expandedOrder === order.id ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (window.confirm('이 견적 문의를 삭제하시겠습니까?\n삭제 후 복구가 불가능합니다.')) {
                            await handleDelete(order.id);
                          }
                        }}
                        title="삭제"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {expandedOrder === order.id && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-5 bg-slate-50/50 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                          {/* 주문자 정보 섹션 */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">주문자 정보</p>
                              <button 
                                onClick={() => setIsOrdererInfoCollapsed(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                                className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                {isOrdererInfoCollapsed[order.id] ? (
                                  <>펴기 <ChevronDown className="w-3 h-3" /></>
                                ) : (
                                  <>접기 <ChevronUp className="w-3 h-3" /></>
                                )}
                              </button>
                            </div>
                            
                            <AnimatePresence>
                              {!isOrdererInfoCollapsed[order.id] && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                      <span className="w-5 text-center">📞</span> {order.ordererPhone}
                                    </p>
                                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                      <span className="w-5 text-center">✉️</span> {order.ordererEmail || '-'}
                                    </p>
                                    <div className="mt-3 pt-3 border-t border-slate-50">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">문의 내용 (고객 입력)</p>
                                      <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                                        {order.otherRequest || '요청 내용 없음'}
                                      </p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          
                          {/* 견적 품목 상세 입력 섹션 */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">견적 품목 상세 입력</p>
                                <button 
                                  onClick={() => toggleQuoteInput(order.id)}
                                  className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  {isQuoteInputCollapsed[order.id] ? (
                                    <>펴기 <ChevronDown className="w-3 h-3" /></>
                                  ) : (
                                    <>접기 <ChevronUp className="w-3 h-3" /></>
                                  )}
                                </button>
                              </div>
                              {!isQuoteInputCollapsed[order.id] && (
                                <button 
                                  onClick={() => addQuoteItem(order.id)}
                                  className="px-3 py-1 bg-primary/10 text-primary text-[10px] font-black rounded-lg hover:bg-primary/20 transition-all"
                                >
                                  + 품목 추가
                                </button>
                              )}
                            </div>

                            <AnimatePresence>
                              {!isQuoteInputCollapsed[order.id] && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden space-y-4"
                                >
                                  <div className="space-y-3">
                                    {(editingQuoteItems[order.id] || order.items).map((item, idx) => (
                                      <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3 relative group">
                                        <button 
                                          onClick={() => removeQuoteItem(order.id, idx)}
                                          className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                        
                                        <div className="space-y-3">
                                          <div className="grid grid-cols-2 gap-3">
                                            <div className="col-span-1">
                                              <label className="text-[9px] font-bold text-slate-400 mb-1 block">품목코드</label>
                                              <input 
                                                type="text" 
                                                value={item.productCode} 
                                                onChange={(e) => updateQuoteItemField(order.id, idx, 'productCode', e.target.value)}
                                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                                placeholder="예: INC-2000"
                                              />
                                            </div>
                                            <div className="col-span-1">
                                              <label className="text-[9px] font-bold text-slate-400 mb-1 block">품목명</label>
                                              <input 
                                                type="text" 
                                                value={item.productName} 
                                                onChange={(e) => updateQuoteItemField(order.id, idx, 'productName', e.target.value)}
                                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                                placeholder="예: 인큐베이터"
                                              />
                                            </div>
                                          </div>
                                          <div>
                                            <label className="text-[9px] font-bold text-slate-400 mb-1 block">규격</label>
                                            <input 
                                              type="text" 
                                              value={item.spec} 
                                              onChange={(e) => updateQuoteItemField(order.id, idx, 'spec', e.target.value)}
                                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                              placeholder="예: 150L, 디지털 제어, RT+5~70°C"
                                            />
                                          </div>
                                          <div className="grid grid-cols-3 gap-3">
                                            <div>
                                              <label className="text-[9px] font-bold text-slate-400 mb-1 block">수량</label>
                                              <input 
                                                type="text" 
                                                value={item.quantity} 
                                                onChange={(e) => {
                                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                                  updateQuoteItemField(order.id, idx, 'quantity', parseInt(val) || 0);
                                                }}
                                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                              />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-slate-400 mb-1 block">공급가액 (단가)</label>
                                              <input 
                                                type="text" 
                                                value={item.unitPrice === 0 ? '' : item.unitPrice.toLocaleString()} 
                                                onChange={(e) => {
                                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                                  updateQuoteItemField(order.id, idx, 'unitPrice', parseInt(val) || 0);
                                                }}
                                                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                                placeholder="0"
                                              />
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-bold text-slate-400 mb-1 block">소계 (자동계산)</label>
                                              <div className="w-full px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-black text-slate-500">
                                                ₩{(item.subtotal || 0).toLocaleString()}
                                              </div>
                                            </div>
                                          </div>
                                          <div>
                                            <label className="text-[9px] font-bold text-slate-400 mb-1 block">비고 (자유 입력)</label>
                                            <input 
                                              type="text" 
                                              value={item.remarks || ''} 
                                              onChange={(e) => updateQuoteItemField(order.id, idx, 'remarks', e.target.value)}
                                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                              placeholder="추가적인 설명이나 비고 사항을 입력하세요 (선택)"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                                      <span>총 공급가액</span>
                                      <span>₩{(editingQuoteItems[order.id] || order.items).reduce((s, i) => s + (i.subtotal || 0), 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                                      <span>총 부가세 (10%)</span>
                                      <span>₩{Math.floor((editingQuoteItems[order.id] || order.items).reduce((s, i) => s + (i.subtotal || 0), 0) * 0.1).toLocaleString()}</span>
                                    </div>
                                    <div className="pt-3 border-t border-slate-100">
                                      <div className="flex justify-between items-center">
                                        <span className="text-sm font-black text-primary">최종 합계 금액</span>
                                        <span className="text-lg font-black text-primary">₩{Math.floor((editingQuoteItems[order.id] || order.items).reduce((s, i) => s + (i.subtotal || 0), 0) * 1.1).toLocaleString()}</span>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={() => handleSaveQuoteDetails(order.id)}
                                      disabled={isSaving}
                                      className="w-full py-3 bg-primary text-white rounded-xl font-black text-xs shadow-lg shadow-green-900/20 hover:bg-primary-dark transition-all active:scale-[0.98] disabled:opacity-50 mt-2"
                                    >
                                      {isSaving ? '저장 중...' : '견적서 상세 내용 저장 및 확정'}
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
    </AdminPinLock>
  );
}
