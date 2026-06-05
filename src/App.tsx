import React, { useEffect, useState, useRef, useMemo } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { QrCode, BarChart3, ShoppingBag } from 'lucide-react';
import { CLIENTS } from './data/products';
import OrderPage from './pages/OrderPage';
import PaymentPage from './pages/PaymentPage';
import AdminDashboard from './pages/AdminDashboard';
import QRManager from './pages/QRManager';
import StatementViewer from './pages/StatementViewer';
import QuoteViewer from './pages/QuoteViewer';
import InstallPrompt from './components/InstallPrompt';

function AdminNav() {
  // ── Hooks (must be before any conditional return) ──
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const isAdminPath = location.pathname.startsWith('/admin') || location.pathname.startsWith('/qr');
  const isFromAdmin = searchParams.get('from') === 'admin';
  const currentClientId = searchParams.get('client') || '';

  // ── 업체 순서 상태 (localStorage 영속) ──
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('admin_nav_order');
      if (saved) return JSON.parse(saved);
    } catch {}
    return CLIENTS.filter(c => c.id !== 'demo').map(c => c.id);
  });

  const orderedClients = useMemo(() => {
    const valid = CLIENTS.filter(c => c.id !== 'demo').map(c => c.id);
    const ordered = orderedIds.filter(id => valid.includes(id));
    const missing = valid.filter(id => !ordered.includes(id));
    return [...ordered, ...missing]
      .map(id => CLIENTS.find(c => c.id === id)!)
      .filter(Boolean);
  }, [orderedIds]);

  // ── 드래그 상태 ──
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const draggedRef = useRef(false);
  const touchRef = useRef({ id: '', timer: 0, dragging: false, sx: 0, sy: 0 });
  const navRef = useRef<HTMLElement>(null);

  // ── 모바일 터치 드래그용 non-passive 리스너 ──
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      const tr = touchRef.current;
      const t = e.touches[0];
      // 롱프레스 전 이동 → 타이머 취소 (일반 스크롤 허용)
      if (!tr.dragging && tr.timer) {
        if (Math.abs(t.clientX - tr.sx) > 10 || Math.abs(t.clientY - tr.sy) > 10) {
          clearTimeout(tr.timer);
          tr.timer = 0;
        }
        return;
      }
      if (!tr.dragging) return;
      e.preventDefault();
      const target = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-cid]');
      setOverId(target ? target.getAttribute('data-cid') : null);
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  // ── 조건부 렌더링 (hooks 이후) ──
  if (!isAdminPath && !isFromAdmin) return null;

  // ── 순서 변경 로직 ──
  const doReorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = orderedClients.map(c => c.id);
    const fi = ids.indexOf(fromId);
    const ti = ids.indexOf(toId);
    if (fi < 0 || ti < 0) return;
    const next = [...ids];
    next.splice(fi, 1);
    next.splice(ti, 0, fromId);
    setOrderedIds(next);
    localStorage.setItem('admin_nav_order', JSON.stringify(next));
  };

  return (
    <nav ref={navRef} className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-[#E2E8E4] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="flex items-center px-2 py-2 max-w-4xl mx-auto overflow-x-auto scrollbar-hide">
        {/* 고정 메뉴: 대시보드 / QR */}
        <NavLink to="/admin" className={({ isActive }) =>
          `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all shrink-0 ${isActive && !isFromAdmin ? 'text-primary font-bold bg-primary/5' : 'text-slate-400 hover:text-slate-600'}`
        }>
          <BarChart3 className="w-5 h-5" />
          <span className="text-[10px] font-bold">대시보드</span>
        </NavLink>
        <NavLink to="/qr" className={({ isActive }) =>
          `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all shrink-0 ${isActive ? 'text-primary font-bold bg-primary/5' : 'text-slate-400 hover:text-slate-600'}`
        }>
          <QrCode className="w-5 h-5" />
          <span className="text-[10px] font-bold">QR 관리</span>
        </NavLink>

        {/* 구분선 */}
        <div className="w-px h-8 bg-slate-200/60 shrink-0 mx-1" />

        {/* 드래그 가능한 업체 탭 */}
        {orderedClients.map(client => {
          const isActive = isFromAdmin && currentClientId === client.id;
          const isDragging = dragId === client.id;
          const isDropTarget = overId === client.id && dragId != null && dragId !== client.id;

          return (
            <div
              key={client.id}
              data-cid={client.id}
              draggable
              /* ── 데스크톱 HTML5 DnD ── */
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', client.id);
                setTimeout(() => setDragId(client.id), 0);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragId && dragId !== client.id) setOverId(client.id);
              }}
              onDragLeave={() => setOverId(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) doReorder(dragId, client.id);
                setDragId(null); setOverId(null);
              }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              /* ── 모바일 터치 (롱프레스 → 드래그) ── */
              onTouchStart={(e) => {
                const t = e.touches[0];
                const tr = touchRef.current;
                tr.id = client.id; tr.sx = t.clientX; tr.sy = t.clientY; tr.dragging = false;
                tr.timer = window.setTimeout(() => {
                  tr.dragging = true;
                  setDragId(client.id);
                  if (navigator.vibrate) navigator.vibrate(30);
                }, 400);
              }}
              onTouchEnd={() => {
                const tr = touchRef.current;
                if (tr.timer) clearTimeout(tr.timer);
                if (tr.dragging && dragId && overId) {
                  doReorder(dragId, overId);
                  draggedRef.current = true;
                  setTimeout(() => { draggedRef.current = false; }, 300);
                }
                tr.dragging = false; tr.id = '';
                setDragId(null); setOverId(null);
              }}
              /* ── 클릭 네비게이션 (드래그 중이면 무시) ── */
              onClick={() => {
                if (!draggedRef.current && !touchRef.current.dragging) {
                  navigate(`/?client=${client.id}&from=admin`);
                }
              }}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl shrink-0 select-none
                transition-all duration-200 cursor-grab active:cursor-grabbing
                ${isDragging
                  ? 'opacity-30 scale-75'
                  : isDropTarget
                    ? 'bg-primary/15 scale-110 ring-2 ring-primary/40 text-primary'
                    : isActive
                      ? 'text-primary font-bold bg-primary/10 ring-1 ring-primary/20'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
            >
              <ShoppingBag className={`w-5 h-5 transition-colors ${isActive || isDropTarget ? 'text-primary' : ''}`} />
              <span className={`text-[9px] font-bold truncate max-w-[60px] transition-colors ${isActive ? 'text-primary' : ''}`}>
                {client.name.replace('(주)', '')}
              </span>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export default function App() {
  useEffect(() => {
    // [긴급 데이터 자가 복구] 특정 주문들이 서버에 발행 완료 상태가 아니라면 강제로 업데이트
    const fixHistoricalData = async () => {
      try {
        const { markOrdersAsInvoicedInSupabase } = await import('./store/orderStore');
        await markOrdersAsInvoicedInSupabase(['20260511-71659-084840', '20260511-1']);
        console.log('✅ 서버 데이터 자가 복구 완료');
      } catch (e) {
        console.error('자가 복구 중 오류:', e);
      }
    };
    fixHistoricalData();

    // [긴급 캐시 삭제] 배포 버전이 바뀌면 브라우저 캐시를 강제로 비우고 리로드
    const CURRENT_VERSION = '1.0.9';
    const savedVersion = localStorage.getItem('APP_VERSION');
    if (savedVersion !== CURRENT_VERSION) {
      localStorage.setItem('APP_VERSION', CURRENT_VERSION);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for(let registration of registrations) registration.unregister();
        });
      }
      window.location.reload();
    }

    // [데이터 긴급 복구/정리] 타 업체 오귀속 로컬 캐시 정리 및 이뮤노(immuno) 주문 복구
    try {
      const localOrdersRaw = localStorage.getItem('ngs_orders');
      let localOrders = localOrdersRaw ? JSON.parse(localOrdersRaw) : [];
      if (Array.isArray(localOrders)) {
        let updated = false;

        // 1. 타 업체(vertis, boryung 등)에 잘못 매핑된 20260526-180109 관련 로컬 캐시 제거
        const filtered = localOrders.filter((o: any) => {
          const isGhostOrder = (o.id === 'NGS-20260526-1-180109' || o.id === 'NGS-20260526-180109' || o.id.includes('180109')) && o.clientId !== 'immuno';
          return !isGhostOrder;
        });
        if (filtered.length !== localOrders.length) {
          localOrders = filtered;
          updated = true;
        }

        // 2. 이뮤노디자이너스(immuno) 전용 주문 강제 복구/동기화 (로컬 캐시가 유실된 기기 대응)
        const hasImmunoOrder = localOrders.some((o: any) => (o.id === 'NGS-20260526-1-180109' || o.id === 'NGS-20260526-180109') && o.clientId === 'immuno');
        if (!hasImmunoOrder) {
          localOrders.push({
            id: "NGS-20260526-1-180109",
            orderDate: "2026-05-26",
            orderDateTime: "2026-05-26T18:01:09",
            clientId: "immuno",
            clientName: "(주)이뮤노디자이너스",
            clientEmail: "",
            ordererName: "신효진",
            ordererPhone: "010-3580-1714",
            ordererEmail: "hjshin@immunodesigners.com",
            items: [
              {
                spec: "200 PCS/BOX, 6 BOXES/CASE",
                quantity: 6,
                subtotal: 240000,
                productId: "p9",
                unitPrice: 40000,
                productCode: "NGS-SEP-10",
                productName: "NuGens Serological pipette, Stretching, 10ml"
              }
            ],
            otherRequest: "[납품완료:2026-05-26]",
            totalAmount: 264000,
            status: "shipped",
            paymentMethod: "bank_transfer",
            orderType: "order",
            subtotalAmount: 240000,
            vatAmount: 24000
          });
          updated = true;
        }

        if (updated) {
          localStorage.setItem('ngs_orders', JSON.stringify(localOrders));
          console.log('✅ 타 업체 오귀속 캐시 제거 및 이뮤노 주문 복구 완료');
        }
      }
    } catch (e) {
      console.error('로컬 주문 정리 중 오류:', e);
    }

    // [데이터 긴급 복구] 특정 주문 데이터 유실 방지
    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    let updated = false;
    orders.forEach(order => {
      if (order.id === 'ORDER-2024-001' && !order.client) { order.client = 'a'; updated = true; }
      if (order.id === 'ORDER-2024-002' && !order.client) { order.client = 'b'; updated = true; }
    });
    if (updated) localStorage.setItem('orders', JSON.stringify(orders));
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OrderPage />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/qr" element={<QRManager />} />
        <Route path="/statement" element={<StatementViewer />} />
        <Route path="/quote" element={<QuoteViewer />} />
      </Routes>
      <AdminNav />
      <InstallPrompt />
    </BrowserRouter>
  );
}
