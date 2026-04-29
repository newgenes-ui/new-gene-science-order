import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3, Calendar, Download, TrendingUp, Package,
  DollarSign, ShoppingBag, Search, ChevronDown, ChevronUp, Eye
} from 'lucide-react';
import { getOrders, STATUS_LABELS, STATUS_COLORS, Order } from '../store/orderStore';

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
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState('전체');

  const allOrders = getOrders();

  const filteredOrders = useMemo(() => {
    return allOrders.filter(o => {
      const inDate = o.orderDate >= fromDate && o.orderDate <= toDate;
      const inSearch = !searchTerm ||
        o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.ordererName.toLowerCase().includes(searchTerm.toLowerCase());
      const inClient = clientFilter === '전체' || o.clientName === clientFilter;
      return inDate && inSearch && inClient;
    });
  }, [allOrders, fromDate, toDate, searchTerm, clientFilter]);

  const totalRevenue = filteredOrders.reduce((s, o) => s + o.totalAmount, 0);
  const totalItems = filteredOrders.reduce((s, o) => s + o.items.reduce((is, i) => is + i.quantity, 0), 0);

  const clientNames = ['전체', ...Array.from(new Set(allOrders.map(o => o.clientName)))];

  // Daily aggregation
  const dailyData = useMemo(() => {
    const map: Record<string, { date: string; count: number; revenue: number }> = {};
    filteredOrders.forEach(o => {
      if (!map[o.orderDate]) map[o.orderDate] = { date: o.orderDate, count: 0, revenue: 0 };
      map[o.orderDate].count++;
      map[o.orderDate].revenue += o.totalAmount;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredOrders]);

  // Product aggregation
  const productData = useMemo(() => {
    const map: Record<string, { code: string; name: string; qty: number; revenue: number }> = {};
    filteredOrders.forEach(o => {
      o.items.forEach(item => {
        if (!map[item.productCode]) {
          map[item.productCode] = { code: item.productCode, name: item.productName, qty: 0, revenue: 0 };
        }
        map[item.productCode].qty += item.quantity;
        map[item.productCode].revenue += item.subtotal;
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  const downloadCSV = () => {
    // 모든 필드를 따옴표로 감싸서 쉼표(,) 충돌 방지
    const escape = (val: any) => `"${String(val).replace(/"/g, '""')}"`;
    const headers = ['주문일', '업체명', '주문번호', '주문자', '제품코드', '제품명', '수량', '단가', '합계금액', '상태'].map(escape);
    const rows: string[] = [];
    
    filteredOrders.forEach(o => {
      o.items.forEach(item => {
        const row = [
          o.orderDate,
          o.clientName,
          o.id,
          o.ordererName,
          item.productCode,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.subtotal,
          STATUS_LABELS[o.status]
        ].map(escape);
        rows.push(row.join(','));
      });
      if (o.otherRequest) {
        const otherRow = [o.orderDate, o.clientName, o.id, o.ordererName, '-', '기타 요청사항', '-', '-', '-', o.otherRequest].map(escape);
        rows.push(otherRow.join(','));
      }
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NGS_상세발주내역_${fromDate}_${toDate}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F0F4F1] to-[#E8F0EA]">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-[#E2E8E4] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-primary">주문 관리 대시보드</p>
              <p className="text-[10px] text-slate-400">New Gene Science Admin</p>
            </div>
          </div>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-bold text-xs hover:bg-primary-dark transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            CSV 다운로드
          </button>
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

        {/* Orders Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8E4] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> 주문 목록
              <span className="ml-auto text-xs font-bold text-slate-400">{filteredOrders.length}건</span>
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {filteredOrders.length === 0 ? (
              <div className="py-16 text-center text-slate-300">
                <ShoppingBag className="w-10 h-10 mx-auto mb-3" />
                <p className="text-sm font-bold">조회된 주문이 없습니다</p>
              </div>
            ) : filteredOrders.map(order => (
              <div key={order.id}>
                <div
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                >
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 items-center">
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
                    <div className="hidden md:flex justify-end">
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-black text-white"
                        style={{ backgroundColor: STATUS_COLORS[order.status] }}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>
                  </div>
                  <div className="ml-2">
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
                          <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2">발주 품목</p>
                          <div className="space-y-1">
                            {order.items.map((item, i) => (
                              <div key={i} className="flex justify-between text-sm">
                                <span className="text-slate-600 truncate flex-1 mr-2">{item.productName}</span>
                                <span className="font-bold text-slate-500 shrink-0">×{item.quantity} = ₩{item.subtotal.toLocaleString()}</span>
                              </div>
                            ))}
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

        {/* Daily Summary Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8E4] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> 날짜별 집계
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {dailyData.length === 0 ? (
              <div className="py-8 text-center text-slate-300 text-sm">데이터 없음</div>
            ) : dailyData.map(d => (
              <div key={d.date} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                <span className="font-mono text-sm text-slate-600">{d.date}</span>
                <span className="text-xs text-slate-400">{d.count}건</span>
                <span className="font-black text-primary">₩{d.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Product Summary */}
        <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8E4] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> 품목별 판매 집계
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3 text-left">제품코드</th>
                  <th className="px-6 py-3 text-left">제품명</th>
                  <th className="px-6 py-3 text-right">수량</th>
                  <th className="px-6 py-3 text-right">매출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {productData.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-300 text-sm">데이터 없음</td></tr>
                ) : productData.map(p => (
                  <tr key={p.code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-slate-400">{p.code}</td>
                    <td className="px-6 py-3 text-sm font-semibold text-slate-700">{p.name}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-600">{p.qty}</td>
                    <td className="px-6 py-3 text-right font-black text-primary">₩{p.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
