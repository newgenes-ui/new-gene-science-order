import React, { useState, useEffect } from 'react';
import { Share, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // iOS 여부 확인
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // 이미 설치되었거나 최근에 닫았는지 확인 (7일간 다시 묻지 않음)
    const lastDismissed = localStorage.getItem('pwa_prompt_dismissed');
    const now = new Date().getTime();
    if (lastDismissed && now - parseInt(lastDismissed) < 1000 * 60 * 60 * 24 * 7) {
      return;
    }

    // 안드로이드/크롬 설치 프롬프트 처리
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // 접속 후 5초 뒤에 표시
      setTimeout(() => setIsVisible(true), 5000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // iOS는 별도 이벤트가 없으므로 수동으로 설치 권유 (설치되지 않은 경우만)
    if (isIOSDevice && !(window.navigator as any).standalone) {
       setTimeout(() => setIsVisible(true), 8000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsVisible(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwa_prompt_dismissed', new Date().getTime().toString());
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-4 right-4 z-[9999] md:left-auto md:right-6 md:w-96"
      >
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
          <div className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
              <img src="/icon-192.png" alt="App Icon" className="w-10 h-10 rounded-xl" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-slate-800">앱으로 더 편리하게!</h3>
              <p className="text-[12px] font-bold text-slate-500 leading-tight mt-0.5">
                {isIOS 
                  ? '홈 화면에 추가하여 앱처럼 사용해 보세요'
                  : '바탕화면에 설치하여 빠르게 주문하세요'}
              </p>
            </div>
            <button onClick={handleDismiss} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="px-5 pb-5">
            {isIOS ? (
              <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-4 border border-slate-100">
                <div className="bg-white p-2 rounded-lg shadow-sm">
                  <Share className="w-5 h-5 text-primary" />
                </div>
                <p className="text-[11px] font-bold text-slate-600 leading-normal">
                  하단의 <span className="text-primary font-black">[공유하기]</span> 버튼을 누르고 <br/>
                  <span className="text-primary font-black">[홈 화면에 추가]</span>를 선택해 주세요.
                </p>
              </div>
            ) : (
              <button
                onClick={handleInstallClick}
                className="w-full bg-primary text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Download className="w-4 h-4" />
                앱 설치하기
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default InstallPrompt;
