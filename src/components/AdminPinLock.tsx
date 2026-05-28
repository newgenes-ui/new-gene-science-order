import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Lock, Delete } from 'lucide-react';

const ADMIN_PIN = '4916';
const SESSION_KEY = 'admin_pin_authenticated';

export function isAdminAuthenticated(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

export function clearAdminAuth(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

interface AdminPinLockProps {
  children: React.ReactNode;
}

export default function AdminPinLock({ children }: AdminPinLockProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => isAdminAuthenticated());
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleDigitPress = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);

    if (newPin.length === 4) {
      if (newPin === ADMIN_PIN) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        setTimeout(() => setIsAuthenticated(true), 300);
      } else {
        setError(true);
        setShake(true);
        setTimeout(() => {
          setPin('');
          setShake(false);
        }, 600);
      }
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a3a2a] via-[#2D5A47] to-[#1a3a2a] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* 헤더 */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center mx-auto mb-4 border border-white/20 shadow-2xl"
          >
            <Shield className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-2xl font-black text-white mb-1">관리자 대시보드</h1>
          <p className="text-sm text-white/60 font-medium">비밀번호 4자리를 입력해 주세요</p>
        </div>

        {/* PIN 표시 */}
        <motion.div
          animate={shake ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.5 }}
          className="flex justify-center gap-4 mb-10"
        >
          {[0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              animate={pin.length > i ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.2 }}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                error
                  ? 'bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.6)]'
                  : pin.length > i
                    ? 'bg-white shadow-[0_0_12px_rgba(255,255,255,0.5)]'
                    : 'bg-white/20 border border-white/30'
              }`}
            />
          ))}
        </motion.div>

        {/* 숫자 키패드 */}
        <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, idx) => {
            if (key === '') return <div key={idx} />;
            if (key === 'del') {
              return (
                <motion.button
                  key={idx}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleDelete}
                  className="h-16 rounded-2xl flex items-center justify-center text-white/60 hover:bg-white/10 transition-all active:bg-white/20"
                >
                  <Delete className="w-6 h-6" />
                </motion.button>
              );
            }
            return (
              <motion.button
                key={idx}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleDigitPress(key)}
                className="h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 text-white text-2xl font-bold hover:bg-white/20 transition-all active:bg-white/30 shadow-lg"
              >
                {key}
              </motion.button>
            );
          })}
        </div>

        {/* 에러 메시지 */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-red-300 text-sm font-bold mt-6"
            >
              비밀번호가 올바르지 않습니다
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
