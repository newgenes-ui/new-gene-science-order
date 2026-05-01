import { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3, Calendar, Download, TrendingUp, Package,
  DollarSign, ShoppingBag, Search, ChevronDown, ChevronUp, Eye, RefreshCw, MessageSquare, Trash2
} from 'lucide-react';
import { getOrders, getOrdersFromSupabase, STATUS_LABELS, STATUS_COLORS, Order, deleteOrder, updateOrderStatus } from '../store/orderStore';

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
  const [clientFilter, setClientFilter] = useState('전체');
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeListTab, setActiveListTab] = useState<'order' | 'quote'>('order');

  // Supabase에서 주문 데이터 로드 (없으면 localStorage fallback)
  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const supabaseOrders = await getOrdersFromSupabase();
      if (supabaseOrders.length > 0) {
        setAllOrders(supabaseOrders);
      } else {
        // Supabase에 데이터가 없으면 localStorage에서 로드
        setAllOrders(getOrders());
      }
    } catch {
      setAllOrders(getOrders());
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return allOrders.filter(o => {
      const inDate = o.orderDate >= fromDate && o.orderDate <= toDate;
      const inSearch = !searchTerm ||
        o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.ordererName.toLowerCase().includes(searchTerm.toLowerCase());
      const inClient = clientFilter === '전체' || o.clientName === clientFilter;
      return inDate && inSearch && inClient;
    }).sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.id.localeCompare(a.id));
  }, [allOrders, fromDate, toDate, searchTerm, clientFilter]);

  const ordersList = useMemo(() => filteredOrders.filter(o => o.orderType === 'order'), [filteredOrders]);
  const quotesList = useMemo(() => filteredOrders.filter(o => o.orderType !== 'order'), [filteredOrders]);

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

  const handleStatusUpdate = async (id: string, newStatus: Order['status']) => {
    try {
      const success = await updateOrderStatus(id, newStatus);
      if (success) {
        setAllOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
      } else {
        alert('DB 업데이트에 실패했습니다. Supabase의 RLS 정책에서 UPDATE 또는 UPSERT 권한이 허용되어 있는지 확인해 주세요.');
      }
    } catch (err: any) {
      alert('상태 업데이트 중 오류가 발생했습니다:\n' + err.message);
    }
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
    <div className="min-h-screen bg-[#F0F4F1] pb-40">
      <header className="bg-white/80 backdrop-blur-xl border-b border-[#E2E8E4] sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-primary">관리자 대시보드</h1>
              <p className="text-[10px] text-slate-400">실시간 주문 및 견적 현황</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold ${allOrders.length > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${allOrders.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              {allOrders.length > 0 ? 'DB 연결됨' : '로컬 모드'}
            </div>
            <button
              onClick={loadOrders}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-xs hover:bg-primary-dark transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              CSV 다운로드
            </button>
          </div>
        </div>
      </header>

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
        <div className="flex bg-white/50 backdrop-blur-md p-1.5 rounded-2xl border border-[#E2E8E4] shadow-sm">
          <button
            onClick={() => setActiveListTab('order')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeListTab === 'order' ? 'bg-primary text-white shadow-lg shadow-green-900/20' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <ShoppingBag className="w-4 h-4" />
            발주 내역 ({ordersList.length})
          </button>
          <button
            onClick={() => setActiveListTab('quote')}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${activeListTab === 'quote' ? 'bg-primary text-white shadow-lg shadow-green-900/20' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <MessageSquare className="w-4 h-4" />
            견적 문의 ({quotesList.length})
          </button>
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
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                        <div>
                          <p className="text-xs font-mono text-slate-400">{order.id}</p>
                          <p className="text-sm font-bold text-slate-700">{order.orderDate}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">업체</p>
                          <p className="text-sm font-bold text-slate-700 truncate">{order.clientName}</p>
                        </div>
                        <div className="hidden md:block">
                          <p className="text-xs text-slate-400">주문자</p>
                          <p className="text-sm font-semibold text-slate-600">{order.ordererName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">금액</p>
                          <p className="text-sm font-black text-primary">₩{order.totalAmount.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* 상태 관리 영역 */}
                      <div className="flex items-center gap-2 min-w-fit">
                        {order.status === 'cancelled' ? (
                          <span className="px-3 py-1.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-600 border border-rose-200">
                            주문취소
                          </span>
                        ) : (
                          <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl border border-slate-200/50 whitespace-nowrap">
                            {[
                              { id: 'pending', label: '주문완료' },
                              { id: 'shipped', label: '납품완료' },
                              { id: 'payment_waiting', label: '입금대기' },
                              { id: 'paid', label: '입금확인' }
                            ].map((s) => (
                              <button
                                key={s.id}
                                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, s.id as Order['status']); }}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${
                                  order.status === s.id 
                                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                                }`}
                                style={order.status === s.id ? { borderLeft: `3px solid ${STATUS_COLORS[s.id as Order['status']]}` } : {}}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {deletingId === order.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                            className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-all shadow-sm"
                          >
                            진짜 삭제
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                            className="px-2 py-1 bg-slate-100 text-slate-400 text-[10px] font-bold rounded-lg hover:bg-slate-200"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(order.id);
                          }}
                          className="p-2 hover:bg-red-50 text-slate-200 hover:text-red-500 transition-colors rounded-lg"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {expandedOrder === order.id ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
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
                    onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  >
                    <div className="flex-1 flex flex-col md:flex-row md:items-center gap-4">
                      {/* 기본 정보 영역 */}
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                        <div>
                          <p className="text-xs font-mono text-slate-400">{order.id}</p>
                          <p className="text-sm font-bold text-slate-700">{order.orderDate}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">업체</p>
                          <p className="text-sm font-bold text-slate-700 truncate">{order.clientName}</p>
                        </div>
                        <div className="hidden md:block">
                          <p className="text-xs text-slate-400">문의자</p>
                          <p className="text-sm font-semibold text-slate-600">{order.ordererName || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">구분</p>
                          <p className="text-sm font-black text-primary">견적문의</p>
                        </div>
                      </div>

                      {/* 상태 관리 영역 */}
                      <div className="flex items-center gap-2 min-w-fit">
                        {order.status === 'cancelled' ? (
                          <span className="px-3 py-1.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-600 border border-rose-200">
                            주문취소
                          </span>
                        ) : (
                          <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl border border-slate-200/50 whitespace-nowrap">
                            {[
                              { id: 'pending', label: '주문완료' },
                              { id: 'shipped', label: '납품완료' },
                              { id: 'payment_waiting', label: '입금대기' },
                              { id: 'paid', label: '입금확인' }
                            ].map((s) => (
                              <button
                                key={s.id}
                                onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, s.id as Order['status']); }}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${
                                  order.status === s.id 
                                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                                }`}
                                style={order.status === s.id ? { borderLeft: `3px solid ${STATUS_COLORS[s.id as Order['status']] || '#94a3b8'}` } : {}}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {deletingId === order.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(order.id); }}
                            className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600 transition-all shadow-sm"
                          >
                            진짜 삭제
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                            className="px-2 py-1 bg-slate-100 text-slate-400 text-[10px] font-bold rounded-lg hover:bg-slate-200"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(order.id);
                          }}
                          className="p-2 hover:bg-red-50 text-slate-200 hover:text-red-500 transition-colors rounded-lg"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {expandedOrder === order.id ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
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
                              견적 요청 내용
                            </p>
                            <div className="space-y-1">
                              <p className="text-sm text-slate-800 bg-white p-3 rounded-xl border border-slate-100 whitespace-pre-wrap">
                                {order.otherRequest || '요청 내용 없음'}
                              </p>
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
        )}

      </main>
    </div>
  );
}
