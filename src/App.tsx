import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { QrCode, BarChart3, ShoppingBag } from 'lucide-react';
import { CLIENTS } from './data/products';
import OrderPage from './pages/OrderPage';
import PaymentPage from './pages/PaymentPage';
import AdminDashboard from './pages/AdminDashboard';
import QRManager from './pages/QRManager';
import StatementViewer from './pages/StatementViewer';

function AdminNav() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin') || location.pathname.startsWith('/qr');
  if (!isAdmin) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E2E8E4] flex items-center justify-around px-4 py-2 shadow-lg">
      <NavLink to="/admin" className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${isActive ? 'text-primary font-bold' : 'text-slate-400'}`
      }>
        <BarChart3 className="w-5 h-5" />
        <span className="text-[10px] font-bold">대시보드</span>
      </NavLink>
      <NavLink to="/qr" className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${isActive ? 'text-primary font-bold' : 'text-slate-400'}`
      }>
        <QrCode className="w-5 h-5" />
        <span className="text-[10px] font-bold">QR 관리</span>
      </NavLink>
      {CLIENTS.filter(c => c.id !== 'demo').map(client => (
        <NavLink key={client.id} to={`/?client=${client.id}`} className={
          `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all text-slate-400`
        }>
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[9px] font-bold truncate max-w-[60px]">{client.name.replace('(주)', '')}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OrderPage />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/qr" element={<QRManager />} />
        <Route path="/statement" element={<StatementViewer />} />
      </Routes>
      <AdminNav />
    </BrowserRouter>
  );
}
