import { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Copy, MessageSquare, CreditCard, Clock, XCircle } from 'lucide-react';
import { getOrders, updateOrderStatus } from '../store/orderStore';
import { NGS_BANK } from '../data/products';

export default function PaymentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('orderId') || '';
  const [copied, setCopied] = useState(false);
  const [depositName, setDepositName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);

  useEffect(() => {
    if (!order) {
      navigate('/');
    } else if (!confirmed) {
      // 주문 완료(결제 대기) 진입 시 꽃가루 및 문구 효과
      triggerCelebration();
    }
  }, [order, navigate, confirmed]);

  if (!order) return null;

  const copyAccount = () => {
    navigator.clipboard.writeText(NGS_BANK.account).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleConfirmDeposit = () => {
    if (!depositName.trim()) {
      alert('입금자명을 입력해주세요.');
      return;
    }
    updateOrderStatus(orderId, 'paid');
    setConfirmed(true);
    triggerCelebration();
  };

  // 3번의 꽃가루 연출 및 문구 제어
  const triggerCelebration = () => {
    const burst = () => {
      confetti({ 
        particleCount: 150, 
        scalar: 1.6, 
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.8 },
        zIndex: 10000
      });
      confetti({ 
        particleCount: 150, 
        scalar: 1.6, 
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.8 },
        zIndex: 10000
      });
    };

    // 1회차: 문구 표시 + 꽃가루
    setShowCelebration(true);
    burst();

    // 2회차: 1초 후 꽃가루 + 문구 제거 시작
    setTimeout(() => {
      burst();
      setShowCelebration(false); // 2회차 발사 시 문구 사라짐
    }, 1000);

    // 3회차: 2초 후 마지막 꽃가루
    setTimeout(() => {
      burst();
    }, 2000);
  };

  const handleCancelOrder = () => {
    if (window.confirm('주문을 취소하시겠습니까?')) {
      updateOrderStatus(orderId, 'cancelled');
      alert('주문이 취소되었습니다.');
      navigate('/');
    }
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F0F4F1] to-[#E8F0EA] flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-[40px] p-10 max-w-sm w-full text-center shadow-2xl space-y-6"
        >
          <div className="w-24 h-24 bg-primary/10 rounded-[40px] flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 className="w-12 h-12 text-primary" />
          </div>
          <div className="space-y-2">
            <p className="text-primary font-extrabold text-2xl tracking-tight">입금 확인 요청 완료</p>
            <p className="text-slate-500 text-sm mt-4 leading-relaxed">
              입금 확인 후 빠르게 처리해 드리겠습니다.<br />
              주문번호: <span className="font-bold text-primary">{orderId}</span>
            </p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5 text-left space-y-1.5 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">주문 요약</p>
            <p className="text-sm font-semibold text-slate-700">{order.clientName} | {order.ordererName}</p>
            <p className="text-2xl font-black text-primary">₩{order.totalAmount.toLocaleString()}</p>
          </div>
          <button
            onClick={() => navigate(`/?client=${order.clientId}`)}
            className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm shadow-lg hover:bg-primary-dark transition-all"
          >
            메인으로 돌아가기
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F0F4F1] to-[#E8F0EA] py-10 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-2xl font-black text-primary">발주 완료</h1>
          <p className="text-slate-500 text-sm mt-1">아래 계좌로 입금해 주세요</p>
          <button
            onClick={() => navigate(`/?client=${order.clientId}`)}
            className="mt-6 w-full py-4 bg-primary text-white rounded-2xl font-black text-base shadow-xl shadow-green-900/20 hover:bg-primary-dark transition-all active:scale-[0.98]"
          >
            추가 주문하러 가기 (메인으로)
          </button>
        </motion.div>

        {/* Order Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-primary rounded-3xl p-6 text-white relative overflow-hidden"
        >
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
          <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">주문 번호</p>
          <p className="font-bold text-sm font-mono">{orderId}</p>
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs opacity-60 mb-1">결제 금액</p>
            <p className="text-3xl font-black">₩{order.totalAmount.toLocaleString()}</p>
            <p className="text-xs opacity-50 mt-1">부가세 포함</p>
          </div>
        </motion.div>

        {/* Order Items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4]"
        >
          <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-4">주문 내역</h3>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between items-start gap-2 py-2 border-b border-dashed border-slate-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-400">{item.productCode}</p>
                  <p className="text-sm font-semibold text-slate-700 leading-tight">{item.productName}</p>
                  <p className="text-xs text-slate-400">{item.spec}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">×{item.quantity}</p>
                  <p className="text-sm font-bold text-slate-800">₩{item.subtotal.toLocaleString()}</p>
                </div>
              </div>
            ))}
            {order.otherRequest && (
              <div className="pt-2">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">기타 요청</p>
                <p className="text-sm text-slate-600 mt-0.5">{order.otherRequest}</p>
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-slate-400">
              <span>공급가액</span>
              <span>₩{order.subtotalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-400">
              <span>부가세 (10%)</span>
              <span>₩{order.vatAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-50">
              <span className="font-bold text-slate-800">합계 (VAT 포함)</span>
              <span className="text-xl font-black text-primary">₩{order.totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </motion.div>

        {/* Bank Account Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4]"
        >
          <h3 className="flex items-center gap-2 text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-4">
            <CreditCard className="w-3.5 h-3.5" /> 입금 계좌 정보
          </h3>
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-bold">은행명</span>
              <span className="font-bold text-slate-800">{NGS_BANK.bank}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-bold">예금주</span>
              <span className="font-bold text-slate-800">{NGS_BANK.holder}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-bold">계좌번호</span>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-800 font-mono">{NGS_BANK.account}</span>
                <button
                  onClick={copyAccount}
                  className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/20 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? '복사됨!' : '복사'}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-200">
              <span className="text-xs text-slate-400 font-bold">입금액</span>
              <span className="font-black text-primary text-lg">₩{order.totalAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 font-medium leading-relaxed">
              주문일로부터 <strong>3영업일 이내</strong>에 입금해 주세요.<br />
              입금 확인 후 주문이 처리됩니다.
            </p>
          </div>
        </motion.div>

        {/* Order Cancellation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-3xl p-6 shadow-sm border border-[#E2E8E4]"
        >
          <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-4">주문 취소 안내</h3>
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              잘못 주문하셨거나 취소가 필요한 경우 아래 버튼을 눌러주세요.<br />
              취소 즉시 시스템에 반영됩니다.
            </p>
            <button
              onClick={handleCancelOrder}
              className="w-full py-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-black text-base hover:bg-rose-100 transition-all active:scale-[0.98]"
            >
              <XCircle className="w-5 h-5 inline mr-2" />
              주문 취소하기
            </button>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none"
          >
            <div className="bg-white/90 backdrop-blur-2xl px-8 py-6 md:px-12 md:py-8 rounded-[30px] md:rounded-[40px] shadow-2xl border border-primary/20 flex flex-col items-center gap-2 mx-6">
              <h2 className="text-2xl md:text-4xl font-black text-primary tracking-tighter drop-shadow-sm whitespace-nowrap">감사합니다!</h2>
              <p className="text-slate-500 font-bold text-xs md:text-sm whitespace-nowrap">정상적으로 처리되었습니다.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
