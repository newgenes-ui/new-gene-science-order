import React, { useState } from 'react';
import { Shield, Delete } from 'lucide-react';

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

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        background: 'linear-gradient(135deg, #1a3a2a 0%, #2D5A47 50%, #1a3a2a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        touchAction: 'manipulation',
      }}
    >
      <div style={{ width: '100%', maxWidth: '320px' }}>
        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          >
            <Shield style={{ width: '36px', height: '36px', color: 'white' }} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'white', margin: '0 0 4px' }}>
            관리자 대시보드
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: 0, fontWeight: 500 }}>
            비밀번호 4자리를 입력해 주세요
          </p>
        </div>

        {/* PIN 표시 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
            marginBottom: '36px',
            animation: shake ? 'pinShake 0.5s ease-in-out' : 'none',
          }}
        >
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                transition: 'all 0.2s',
                background: error
                  ? '#f87171'
                  : pin.length > i
                    ? 'white'
                    : 'rgba(255,255,255,0.2)',
                border: pin.length > i || error ? 'none' : '1px solid rgba(255,255,255,0.3)',
                boxShadow: error
                  ? '0 0 12px rgba(248,113,113,0.6)'
                  : pin.length > i
                    ? '0 0 12px rgba(255,255,255,0.5)'
                    : 'none',
                transform: pin.length > i ? 'scale(1.2)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {/* 숫자 키패드 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            maxWidth: '270px',
            margin: '0 auto',
          }}
        >
          {keys.map((key, idx) => {
            if (key === '') return <div key={idx} />;
            if (key === 'del') {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  style={{
                    height: '60px',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.6)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'rgba(255,255,255,0.1)',
                    touchAction: 'manipulation',
                    userSelect: 'none',
                  }}
                >
                  <Delete style={{ width: '24px', height: '24px' }} />
                </button>
              );
            }
            return (
              <button
                key={idx}
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDigitPress(key); }}
                style={{
                  height: '60px',
                  borderRadius: '16px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: '24px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'rgba(255,255,255,0.2)',
                  touchAction: 'manipulation',
                  userSelect: 'none',
                }}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <p style={{ textAlign: 'center', color: '#fca5a5', fontSize: '13px', fontWeight: 700, marginTop: '20px' }}>
            비밀번호가 올바르지 않습니다
          </p>
        )}
      </div>

      <style>{`
        @keyframes pinShake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-8px); }
          30%, 70% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
