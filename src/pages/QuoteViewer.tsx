import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getOrdersFromSupabase, Order } from '../store/orderStore';
import { Printer, Download, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { LOGO_BASE64 } from '../assets/logoBase64';
import { STAMP_BASE64 } from '../assets/stampBase64';

export default function QuoteViewer() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [docScale, setDocScale] = useState(1);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const scaleWrapperRef = useRef<HTMLDivElement>(null);

  const idsParam = searchParams.get('ids') || '';
  const orderIds = idsParam.split(',').filter(Boolean);

  const LOGO_PATH = LOGO_BASE64;
  const STAMP_PATH = STAMP_BASE64;

  // 모바일에서 800px 문서를 화면에 맞게 축소 비율 계산
  useEffect(() => {
    document.title = "견적서 | 뉴진사이언스";
    const calcScale = () => {
      const available = window.innerWidth - 16; // 좌우 여백 8px씩
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

  const handleDownloadPDF = async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isMacSafari = /Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent) && /Mac/i.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;

    // iOS/Safari: 팝업 차단 우회 - 버튼 클릭 직후 동기적으로 창 열기
    let iosWin: Window | null = null;
    if ((isIOS || isMacSafari)) {
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
    if (isAndroid) showToast('📄 PDF를 생성하고 있습니다... 잠시만 기다려 주세요.');

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
    // fetch() 대신 document.styleSheets를 사용 → HTTP 요청 불필요, 100% 안정적
    const removedNodes: Node[] = [];
    const injectedStyles: HTMLStyleElement[] = [];

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules; // cross-origin이면 여기서 예외 발생
        const cssText = Array.from(rules).map(r => r.cssText).join('\n');
        if (!cssText.includes('oklch')) continue; // oklch 없으면 건너뜀
        // oklch → hex 변환된 CSS를 새 <style>로 주입
        const fixed = replaceOklch(cssText);
        const newStyle = document.createElement('style');
        newStyle.textContent = fixed;
        injectedStyles.push(newStyle);
        // 원본 노드(<link> 또는 <style>) 제거 대상으로 저장
        if (sheet.ownerNode) removedNodes.push(sheet.ownerNode);
      } catch { /* cross-origin stylesheet → skip (oklch 미포함 가능성 높음) */ }
    }
    // 새 스타일 먼저 추가 → 원본 제거 (무스타일 순간 방지)
    injectedStyles.forEach(s => document.head.appendChild(s));
    removedNodes.forEach(n => n.parentNode?.removeChild(n));
    await new Promise(r => setTimeout(r, 200));

    let cloneEl: HTMLElement | null = null;
    try {
      const source = quoteRef.current!;
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
        onclone: (clonedDoc) => {
          // mix-blend-mode만 normal로 변경하여 캔버스 렌더링 검은 상자 방지
          const stamp = clonedDoc.querySelector('img[alt="Stamp"]');
          if (stamp) {
            (stamp as HTMLElement).style.mixBlendMode = 'normal';
          }
        }
      });

      document.body.removeChild(cloneEl);
      cloneEl = null;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = 210;
      const pageH = (canvas.height * pageW) / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = `견적서_${orders[0]?.clientName || 'NGS'}_${dateStr}.pdf`;

      if (isIOS || isMacSafari) {
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
        } else {
          pdf.save(fileName);
        }
      } else {
        // Desktop & Android: Native direct save (bypasses Chrome dynamic download block)
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
        console.error('Failed to load orders for quote', error);
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

  if (isLoading) return <div className="p-10 text-center text-slate-500">견적 데이터를 불러오는 중...</div>;
  if (orders.length === 0) return <div className="p-10 text-center text-slate-500">선택된 견적 내역이 없습니다.</div>;

  const clientName = orders[0].clientName;
  const ordererName = orders[0].ordererName;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const quoteNo = todayStr.replace(/-/g, '') + "-01";

  const allItems = orders.flatMap(o => o.items);
  const totalSubtotal = orders.reduce((sum, o) => sum + o.subtotalAmount, 0);
  const totalVat = orders.reduce((sum, o) => sum + o.vatAmount, 0);
  const totalAmount = orders.reduce((sum, o) => sum + o.totalAmount, 0);

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
        if (digit !== 1 || unitIdx === 0) result.push(digits[digit]);
        result.push(units[unitIdx]);
        if (unitIdx === 0 && bigUnitIdx > 0) result.push(bigUnits[bigUnitIdx]);
      } else {
        const bigUnitIdx = Math.floor((len - i - 1) / 4);
        const unitIdx = (len - i - 1) % 4;
        if (unitIdx === 0 && bigUnitIdx > 0) {
          let allZero = true;
          for (let j = 1; j <= 3; j++) {
            if (i - j >= 0 && strNum[i - j] !== '0') { allZero = false; break; }
          }
          if (!allZero) result.push(bigUnits[bigUnitIdx]);
        }
      }
    }
    let finalStr = result.join('');
    if (finalStr.startsWith('일십') || finalStr.startsWith('일백') || finalStr.startsWith('일천')) finalStr = finalStr.substring(1);
    return finalStr || '영';
  };

  const totalAmountKorean = numberToKorean(totalAmount);
  const emptyRows = Math.max(0, 15 - allItems.length);

  return (
    <div className="min-h-screen bg-gray-100 py-10 print:py-0 print:bg-white flex flex-col items-center">
      {/* iOS 안내 Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-2xl max-w-[90vw] text-center animate-fade-in print:hidden">
          {toastMsg}
        </div>
      )}
      <div className="w-full max-w-[800px] flex justify-end gap-3 mb-4 print:hidden px-4">
        <button onClick={handleDownloadPDF} disabled={isDownloading} className="flex items-center gap-2 bg-[#2D5A27] text-white px-5 py-2.5 rounded-lg font-bold shadow-lg disabled:opacity-70">
          {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          PDF 다운로드
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-lg font-bold shadow-lg">
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
      <div ref={quoteRef} id="quote-container" className="w-[800px] bg-white p-10 print:p-0 shadow-2xl print:shadow-none text-black font-sans aspect-[1/1.414] overflow-hidden text-[12px] leading-tight border border-gray-200">
        <div className="text-center text-4xl font-black tracking-[1em] mb-6 underline underline-offset-8">견 적 서</div>
        
        <div className="flex justify-between items-stretch gap-2 mb-4">
          <table className="border-collapse border-[2px] border-black w-[48%] text-xs">
            <tbody>
              <tr>
                <th className="border border-black p-1.5 w-24 bg-gray-50 tracking-widest text-center">견적일자</th>
                <td className="border border-black p-1.5 text-center font-bold">{todayStr}</td>
              </tr>
              <tr>
                <th className="border border-black p-1.5 bg-gray-50 tracking-widest text-center">견적번호</th>
                <td className="border border-black p-1.5 text-center font-bold">{quoteNo}</td>
              </tr>
              <tr>
                <th className="border border-black p-1.5 bg-gray-50 tracking-widest text-center">수 신</th>
                <td className="border border-black p-1.5 text-center font-bold">{clientName}</td>
              </tr>
              <tr>
                <th className="border border-black p-1.5 bg-gray-50 tracking-widest text-center">담 당 자</th>
                <td className="border border-black p-1.5 text-center font-bold">{ordererName} 귀하</td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-black p-3 text-[11px] leading-relaxed h-[100px] align-top">
                  1. 귀사의 일익 번창하심을 기원합니다.<br/>
                  2. 하기와 같이 견적드리오니 검토해 주시기 바랍니다.<br/>
                  3. 결제조건은 제품 납품 전 100% 결제 후 납품 예정입니다.<br/>
                  4. 배송 예정 시간은 제품에 따라 주문 후 1~2주 소요 예정입니다.<br/>
                  사정에 따라 지연될 수 있음을 양해 바라겠습니다. 비고란 참조.
                </td>
              </tr>
            </tbody>
          </table>

          <table className="border-collapse border-[2px] border-black w-[50%] text-[10px] text-center">
            <tbody>
              <tr>
                <td colSpan={4} className="border border-black p-2 relative h-[60px]">
                  <img src={LOGO_PATH} crossOrigin="anonymous" className="h-10 mx-auto object-contain" alt="Logo"/>
                </td>
              </tr>
              <tr className="h-8">
                <th className="border border-black p-1 w-[20%] bg-gray-50">사업자 번호</th>
                <td colSpan={3} className="border border-black p-1 font-bold text-sm">595-81-02960</td>
              </tr>
              <tr className="h-8">
                <th className="border border-black p-1 bg-gray-50">상 호</th>
                <td className="border border-black p-1 font-bold">(주) 뉴진사이언스</td>
                <th className="border border-black p-1 bg-gray-50">대 표 자</th>
                <td className="border border-black p-1 font-bold relative">
                  김 기 환 <span className="text-[10px] ml-1">(인)</span>
                  <img src={STAMP_PATH} crossOrigin="anonymous" className="absolute top-1/2 left-[70%] transform -translate-x-1/2 -translate-y-[55%] h-14 w-auto opacity-90 pointer-events-none" alt="Stamp" />
                </td>
              </tr>
              <tr className="h-8">
                <th className="border border-black p-1 bg-gray-50">주 소</th>
                <td colSpan={3} className="border border-black p-1 text-[9px]">경기도 광명시 소하로 190, 비동 9층 21호(소하동, 광명G타워)</td>
              </tr>
              <tr className="h-10">
                <th className="border border-black p-1 bg-gray-50">업 태</th>
                <td className="border border-black p-1 text-[9px]">서비스, 제조업, 도매 및 소매업</td>
                <th className="border border-black p-1 bg-gray-50">종 목</th>
                <td className="border border-black p-1 text-[8px] leading-tight">생물학 연구개발업, 의학약학 관련 연구개발컨설팅업</td>
              </tr>
              <tr className="h-8">
                <th className="border border-black p-1 bg-gray-50">연 락 처</th>
                <td className="border border-black p-1">02-898-8805</td>
                <th className="border border-black p-1 bg-gray-50">팩 스</th>
                <td className="border border-black p-1">02-898-8806</td>
              </tr>
            </tbody>
          </table>
        </div>

        <table className="border-collapse border-[2px] border-black w-full text-[11px] mb-4">
          <thead>
            <tr className="bg-[#f8fafc] text-center h-10 font-bold">
              <th className="border border-black p-1 w-10">합계</th>
              <td colSpan={5} className="border border-black p-1 text-base tracking-[0.5em] underline underline-offset-4">
                {totalAmountKorean} 원정
              </td>
              <td className="border border-black p-1 text-right px-2">
                {totalAmount.toLocaleString()}
              </td>
              <td className="border border-black p-1 text-[10px] font-normal text-slate-500">
                (VAT포함)
              </td>
            </tr>
            <tr className="bg-[#E4EAF2] text-center font-bold h-8">
              <th className="border border-black p-1 w-10">No</th>
              <th className="border border-black p-1">품 명</th>
              <th className="border border-black p-1 w-20">코 드</th>
              <th className="border border-black p-1 w-16">단 위</th>
              <th className="border border-black p-1 w-12">수 량</th>
              <th className="border border-black p-1 w-20">단 가</th>
              <th className="border border-black p-1 w-24">금 액</th>
              <th className="border border-black p-1 w-16">비 고</th>
            </tr>
          </thead>
          <tbody>
            {allItems.map((item, idx) => (
              <tr key={idx} className="text-center h-8">
                <td className="border border-black p-1">{idx + 1}</td>
                <td className="border border-black p-1 text-left px-2">{item.productName}</td>
                <td className="border border-black p-1 text-[10px] font-mono">{item.productCode}</td>
                <td className="border border-black p-1 text-[10px]">{item.spec || '-'}</td>
                <td className="border border-black p-1">{item.quantity}</td>
                <td className="border border-black p-1 text-right px-2">{item.unitPrice.toLocaleString()}</td>
                <td className="border border-black p-1 text-right px-2 font-bold">{item.subtotal.toLocaleString()}</td>
                <td className="border border-black p-1 text-[10px]">{item.remarks || ''}</td>
              </tr>
            ))}
            {Array.from({ length: emptyRows }).map((_, idx) => (
              <tr key={`empty-${idx}`} className="text-center h-8">
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="h-8 font-bold">
              <td colSpan={5} rowSpan={3} className="border border-black p-2 text-left align-top font-normal text-[10px]">
                {`<비 고>`}
              </td>
              <th className="border border-black p-1 text-center bg-gray-50 tracking-widest text-[10px]">금 액</th>
              <td colSpan={2} className="border border-black p-1 text-right px-2 font-normal">{totalSubtotal.toLocaleString()}</td>
            </tr>
            <tr className="h-8 font-bold">
              <th className="border border-black p-1 text-center bg-gray-50 tracking-widest text-[10px]">부가세</th>
              <td colSpan={2} className="border border-black p-1 text-right px-2 font-normal">{totalVat.toLocaleString()}</td>
            </tr>
            <tr className="h-8 font-bold">
              <th className="border border-black p-1 text-center bg-gray-50 tracking-widest text-[10px]">합 계</th>
              <td colSpan={2} className="border border-black p-1 text-right px-2 text-primary font-bold">{totalAmount.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        <table className="w-full border-collapse border-[2px] border-black text-[10px] leading-tight mt-[-2px]">
          <tbody>
            <tr>
              <td className="border border-black p-1.5 w-[60%] font-bold">▶ 견적 유효기간 : 견적 발행일로 14일 입니다.</td>
              <td rowSpan={2} className="border border-black p-1.5 bg-gray-50"></td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 font-bold">▶ 결제계좌 : 기업은행 699-037504-04-022 예금주 ㈜ 뉴진사이언스</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-red-500 font-bold">★ 수입발주 품목은 발주 진행 후 취소 불가합니다.</td>
              <td className="border border-black p-1.5 text-center font-bold bg-gray-50 whitespace-nowrap">
                ◆ 작성자 : 양유지 매니저 // 영업담당자 : 010-7169-8805
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>  {/* scale wrapper 닫기 */}
    </div>
  );
}
