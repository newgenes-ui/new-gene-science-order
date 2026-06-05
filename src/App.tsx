import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { QrCode, BarChart3, ShoppingBag, ArrowLeft } from 'lucide-react';
import { CLIENTS } from './data/products';
import OrderPage from './pages/OrderPage';
import PaymentPage from './pages/PaymentPage';
import AdminDashboard from './pages/AdminDashboard';
import QRManager from './pages/QRManager';
import StatementViewer from './pages/StatementViewer';
import QuoteViewer from './pages/QuoteViewer';
import InstallPrompt from './components/InstallPrompt';

function AdminNav() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isAdminPath = location.pathname.startsWith('/admin') || location.pathname.startsWith('/qr');
  const isFromAdmin = searchParams.get('from') === 'admin';
  const currentClientId = searchParams.get('client') || '';
  
  // Show admin nav on admin pages OR when viewing client pages from admin context
  if (!isAdminPath && !isFromAdmin) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-[#E2E8E4] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-around px-2 py-2 max-w-4xl mx-auto overflow-x-auto scrollbar-hide">
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
        {CLIENTS.filter(c => c.id !== 'demo').map(client => {
          const isActiveClient = isFromAdmin && currentClientId === client.id;
          return (
            <NavLink 
              key={client.id} 
              to={`/?client=${client.id}&from=admin`} 
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all shrink-0 ${
                isActiveClient 
                  ? 'text-primary font-bold bg-primary/10 ring-1 ring-primary/20' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ShoppingBag className={`w-5 h-5 ${isActiveClient ? 'text-primary' : ''}`} />
              <span className={`text-[9px] font-bold truncate max-w-[60px] ${isActiveClient ? 'text-primary' : ''}`}>{client.name.replace('(주)', '')}</span>
            </NavLink>
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
    const CURRENT_VERSION = '1.0.6';
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
