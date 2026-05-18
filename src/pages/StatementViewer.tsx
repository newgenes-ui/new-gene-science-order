import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getOrdersFromSupabase, Order } from '../store/orderStore';
import { Printer, Download, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function StatementViewer() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [docScale, setDocScale] = useState(1);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const statementRef = useRef<HTMLDivElement>(null);
  const scaleWrapperRef = useRef<HTMLDivElement>(null);

  const idsParam = searchParams.get('ids') || '';
  const modeParam = searchParams.get('mode') || '';
  const orderIds = idsParam.split(',').filter(Boolean);

  // 로고 및 직인 경로 (화면 출력용)
  const LOGO_PATH = "/logo.png";
  const STAMP_PATH = "/stamp.png";

  // 모바일에서 800px 문서를 화면에 맞게 축소 비율 계산
  useEffect(() => {
    const calcScale = () => {
      const available = window.innerWidth - 16;
      setDocScale(Math.min(1, available / 800));
    };
    calcScale();
    window.addEventListener('resize', calcScale);
    return () => window.removeEventListener('resize', calcScale);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleDownloadPDF = async (returnBase64 = false): Promise<string | void> => {
    if (isDownloading) return;
    setIsDownloading(true);

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;

    // Android는 window.open() 절대 사용 금지 (백그라운드 탭 전환 → html2canvas 실패)
    let iosWin: Window | null = null;
    if (isIOS && !returnBase64) {
      iosWin = window.open('', '_blank');
      if (iosWin) {
        iosWin.document.write(
          '<html><head><title>PDF 생성 중</title>' +
          '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
          '<body style="display:flex;align-items:center;justify-content:center;' +
          'height:100vh;font-family:sans-serif;color:#444;text-align:center;margin:0">' +
          '<div><p style="font-size:20px;margin-bottom:8px">📄 PDF를 생성하고 있습니다...</p>' +
          '<p style="font-size:14px;color:#888">잠시만 기다려 주세요.</p></div>' +
          '</body></html>'
        );
      }
    }

    if (isAndroid && !returnBase64) showToast('📄 PDF를 생성하고 있습니다... 잠시만 기다려 주세요.');

    // ── oklch → hex 변환 (Canvas 2D fillStyle은 모든 색상을 #rrggbb로 정규화) ──
    const colorCvs = document.createElement('canvas');
    colorCvs.width = 1; colorCvs.height = 1;
    const colorCtx = colorCvs.getContext('2d')!;
    const colorCache = new Map<string, string>();
    const toHex = (match: string): string => {
      if (colorCache.has(match)) return colorCache.get(match)!;
      try {
        colorCtx.fillStyle = '#000000';
        colorCtx.fillStyle = match;
        const hex = colorCtx.fillStyle;
        colorCache.set(match, hex);
        return hex;
      } catch {
        colorCache.set(match, '#888888');
        return '#888888';
      }
    };
    const replaceOklch = (css: string): string =>
      css.includes('oklch') ? css.replace(/oklch\([^)]+\)/g, toHex) : css;

    // ── CSSOM API로 모든 스타일시트의 oklch를 hex로 교체 ──────────────────
    const removedNodes: Node[] = [];
    const injectedStyles: HTMLStyleElement[] = [];

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules;
        const cssText = Array.from(rules).map(r => r.cssText).join('\n');
        if (!cssText.includes('oklch')) continue;
        const fixed = replaceOklch(cssText);
        const newStyle = document.createElement('style');
        newStyle.textContent = fixed;
        injectedStyles.push(newStyle);
        if (sheet.ownerNode) removedNodes.push(sheet.ownerNode);
      } catch { /* cross-origin stylesheet → skip */ }
    }
    injectedStyles.forEach(s => document.head.appendChild(s));
    removedNodes.forEach(n => n.parentNode?.removeChild(n));
    await new Promise(r => setTimeout(r, 200));

    let cloneEl: HTMLElement | null = null;
    try {
      const source = statementRef.current!;
      cloneEl = source.cloneNode(true) as HTMLElement;
      cloneEl.style.cssText =
        'position:absolute;top:99999px;left:0;width:800px;' +
        'background:#fff;overflow:hidden;transform:none;z-index:-1;';
      document.body.appendChild(cloneEl);
      await new Promise(r => setTimeout(r, 400));

      const canvas = await html2canvas(cloneEl, {
        scale: isMobile ? 1.5 : 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        width: 800,
        height: source.offsetHeight || 1131,
      });

      document.body.removeChild(cloneEl);
      cloneEl = null;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = 210;
      const pageH = (canvas.height * pageW) / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = `거래명세서_${orders[0]?.clientName || 'NGS'}_${dateStr}.pdf`;

      if (returnBase64) {
        return pdf.output('datauristring');
      }

      if (isIOS) {
        if (iosWin) {
          const dataUri = pdf.output('datauristring');
          iosWin.document.write(
            `<html><head><title>${fileName}</title>` +
            `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
            `<body style="margin:0">` +
            `<iframe src="${dataUri}" style="width:100%;height:100vh;border:none;"></iframe>` +
            `</body></html>`
          );
          iosWin.document.close();
          showToast('📥 PDF가 열렸습니다. 공유 버튼(□↑)을 눌러 "파일에 저장"하세요.');
        }
      } else if (isAndroid) {
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 5000);
        showToast('📥 다운로드가 시작됐습니다. 알림창 또는 다운로드 폴더를 확인하세요.');
      } else {
        pdf.save(fileName);
      }
    } catch (error) {
      console.error('PDF 생성 에러:', error);
      if (iosWin) iosWin.close();
      const msg = error instanceof Error ? error.message : String(error);
      alert('PDF 오류: ' + msg);
    } finally {
      if (cloneEl && document.body.contains(cloneEl)) document.body.removeChild(cloneEl);
      // 원본 스타일시트 복원, 주입된 <style> 제거
      removedNodes.forEach(n => document.head.appendChild(n));
      injectedStyles.forEach(s => s.remove());
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const allOrders = await getOrdersFromSupabase();
        const matched = allOrders.filter(o => orderIds.includes(o.id));
        setOrders(matched);
      } catch (error) {
        console.error('Failed to load orders for statement', error);
      } finally {
        setIsLoading(false);
      }
    };
    if (orderIds.length > 0) {
      loadOrders();
    } else {
      setIsLoading(false);
    }
  }, [idsParam]);

  useEffect(() => {
    if (modeParam === 'base64' && !isLoading && orders.length > 0) {
      handleDownloadPDF(true).then((base64) => {
        if (base64) {
          window.parent.postMessage({ type: 'PDF_BASE64', base64 }, '*');
        }
      });
    }
  }, [modeParam, isLoading, orders]);

  if (isLoading) {
    return <div className="p-10 text-center">불러오는 중...</div>;
  }

  if (orders.length === 0) {
    return <div className="p-10 text-center">선택된 주문내역이 없습니다.</div>;
  }

  // 데이터 취합
  const clientName = orders[0].clientName;
  const ordererName = orders[0].ordererName;
  const orderDateStr = orders[0].orderDate; // 가장 첫번째 주문의 날짜를 기준 (혹은 오늘 날짜)
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const allItems = orders.flatMap(o => o.items);
  
  // 합계 계산
  const totalSubtotal = orders.reduce((sum, o) => sum + o.subtotalAmount, 0);
  const totalVat = orders.reduce((sum, o) => sum + o.vatAmount, 0);
  const totalAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  // 금액 한글 변환
  const numberToKorean = (num: number) => {
    const result = [];
    const digits = ['영','일','이','삼','사','오','육','칠','팔','구'];
    const units = ['','십','백','천'];
    const bigUnits = ['','만','억','조'];
    
    const strNum = num.toString();
    const len = strNum.length;
    
    for (let i = 0; i < len; i++) {
      const digit = parseInt(strNum[i]);
      if (digit !== 0) {
        const bigUnitIdx = Math.floor((len - i - 1) / 4);
        const unitIdx = (len - i - 1) % 4;
        
        if (digit !== 1 || unitIdx === 0) {
          result.push(digits[digit]);
        }
        result.push(units[unitIdx]);
        
        if (unitIdx === 0 && bigUnitIdx > 0) {
          result.push(bigUnits[bigUnitIdx]);
        }
      } else {
        const bigUnitIdx = Math.floor((len - i - 1) / 4);
        const unitIdx = (len - i - 1) % 4;
        if (unitIdx === 0 && bigUnitIdx > 0) {
          // Check if previous 3 digits were all 0
          let allZero = true;
          for (let j = 1; j <= 3; j++) {
            if (i - j >= 0 && strNum[i - j] !== '0') {
              allZero = false;
              break;
            }
          }
          if (!allZero) result.push(bigUnits[bigUnitIdx]);
        }
      }
    }
    
    // 이, 삼, 사, 오, 육, 칠, 팔, 구, 일십... 보정 (10의 경우 '일십'이 아니라 '십')
    let finalStr = result.join('');
    if (finalStr.startsWith('일십') || finalStr.startsWith('일백') || finalStr.startsWith('일천')) {
       finalStr = finalStr.substring(1);
    }
    if (finalStr === '') return '영';
    return finalStr;
  };

  const totalAmountKorean = numberToKorean(totalAmount);

  // 빈 줄 채우기 (최소 15줄 정도 되도록)
  const emptyRows = Math.max(0, 15 - allItems.length);

  return (
    <div className="min-h-screen bg-gray-100 py-10 print:py-0 print:bg-white flex flex-col items-center">

      {/* iOS 안내 Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-2xl max-w-[90vw] text-center print:hidden">
          {toastMsg}
        </div>
      )}

      {/* 버튼 영역 */}
      <div className="w-full max-w-[800px] flex justify-end gap-3 mb-4 print:hidden px-4">
        <button 
          onClick={handleDownloadPDF}
          disabled={isDownloading}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg font-bold shadow-lg hover:bg-primary-dark transition-all active:scale-95 disabled:opacity-70"
        >
          {isDownloading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Download className="w-5 h-5" />
          )}
          PDF 다운로드
        </button>
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-lg font-bold shadow-lg hover:bg-slate-700 transition-all active:scale-95"
        >
          <Printer className="w-5 h-5" />
          인쇄하기
        </button>
      </div>

      {/* 모바일: 800px 고정폭 문서를 CSS scale로 축소 → 레이아웃 깨짐 방지 */}
      <div
        style={{
          width: '800px',
          transform: `scale(${docScale})`,
          transformOrigin: 'top center',
          marginBottom: docScale < 1 ? `${(docScale - 1) * 800 * 1.414}px` : undefined,
        }}
        className="print:w-full print:transform-none"
        ref={scaleWrapperRef}
      >
      {/* A4 용지 컨테이너 */}
      <div 
        ref={statementRef}
        id="statement-container"
        style={{
          width: '800px',
          height: '1131px',
          backgroundImage: 'url(/statement_template.png)',
          backgroundSize: '100% 100%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          position: 'relative',
          overflow: 'hidden',
          color: 'black',
          fontFamily: 'sans-serif',
          fontSize: '12px'
        }}
        className="shadow-2xl print:shadow-none border border-gray-200 print:border-none"
      >
        {/* 거래일자 */}
        <div style={{ position: 'absolute', top: '154px', left: '154px', width: '236px', textAlign: 'center', fontWeight: 'bold' }}>
          {todayStr}
        </div>
        
        {/* 견적번호 */}
        <div style={{ position: 'absolute', top: '177px', left: '154px', width: '236px', textAlign: 'center', fontWeight: 'bold' }}>
          {todayStr.replace(/-/g, '')}-1
        </div>

        {/* 수신 */}
        <div style={{ position: 'absolute', top: '200px', left: '154px', width: '236px', textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>
          {clientName}
        </div>

        {/* 참조 */}
        <div style={{ position: 'absolute', top: '223px', left: '154px', width: '210px', textAlign: 'center', fontWeight: 'bold' }}>
          {ordererName}
        </div>

        {/* 합계금액 한글 */}
        <div style={{ position: 'absolute', top: '346px', left: '220px', width: '440px', textAlign: 'center', fontWeight: 'black', fontSize: '14px', letterSpacing: '0.1em' }}>
          {totalAmountKorean} 원정
        </div>

        {/* 합계금액 숫자 */}
        <div style={{ position: 'absolute', top: '346px', left: '675px', width: '90px', textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>
          {totalAmount.toLocaleString()}
        </div>

        {/* 품목 리스트 오버레이 (최대 11줄) */}
        {allItems.slice(0, 11).map((item, idx) => {
          const rowTop = 404 + idx * 25.5;
          return (
            <div key={idx} style={{ position: 'absolute', top: `${rowTop}px`, left: '0px', width: '800px', height: '24px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
              {/* 품명 */}
              <div style={{ position: 'absolute', left: '92px', width: '280px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'left', paddingLeft: '4px' }}>
                {item.productName}
              </div>
              {/* 규격 */}
              <div style={{ position: 'absolute', left: '380px', width: '74px', textAlign: 'center', fontSize: '11px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {item.spec || item.productCode}
              </div>
              {/* 수량 */}
              <div style={{ position: 'absolute', left: '458px', width: '40px', textAlign: 'center', fontWeight: 'bold' }}>
                {item.quantity}
              </div>
              {/* 단가 */}
              <div style={{ position: 'absolute', left: '502px', width: '74px', textAlign: 'right', paddingRight: '4px' }}>
                {item.unitPrice.toLocaleString()}
              </div>
              {/* 금액 */}
              <div style={{ position: 'absolute', left: '580px', width: '86px', textAlign: 'right', paddingRight: '4px', fontWeight: 'bold' }}>
                {item.subtotal.toLocaleString()}
              </div>
              {/* 비고 */}
              <div style={{ position: 'absolute', left: '670px', width: '72px', textAlign: 'center', fontSize: '10px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {item.remarks || ''}
              </div>
            </div>
          );
        })}

        {/* 집계표 오버레이 */}
        {/* 금액 (공급가액 합계) */}
        <div style={{ position: 'absolute', top: '763px', left: '654px', width: '90px', textAlign: 'right', paddingRight: '4px', fontWeight: 'bold' }}>
          {totalSubtotal.toLocaleString()}
        </div>
        {/* 부가세 합계 */}
        <div style={{ position: 'absolute', top: '788px', left: '654px', width: '90px', textAlign: 'right', paddingRight: '4px', fontWeight: 'bold' }}>
          {totalVat.toLocaleString()}
        </div>
        {/* 합계금액 (총 합계) */}
        <div style={{ position: 'absolute', top: '813px', left: '654px', width: '90px', textAlign: 'right', paddingRight: '4px', fontWeight: 'bold', color: '#B91C1C', fontSize: '13px' }}>
          {totalAmount.toLocaleString()}
        </div>
      </div>
      </div>  {/* scale wrapper 닫기 */}
    </div>
  );
}
