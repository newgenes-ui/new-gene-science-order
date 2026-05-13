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

  const handleDownloadPDF = async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;

    // Android는 window.open() 절대 사용 금지 (백그라운드 탭 전환 → html2canvas 실패)
    let iosWin: Window | null = null;
    if (isIOS) {
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

    let cloneEl: HTMLElement | null = null;
    try {
      const source = statementRef.current!;
      cloneEl = source.cloneNode(true) as HTMLElement;
      cloneEl.style.cssText =
        'position:absolute;top:99999px;left:0;width:800px;' +
        'background:#fff;overflow:hidden;transform:none;z-index:-1;';
      document.body.appendChild(cloneEl);

      await new Promise(r => setTimeout(r, 600));

      const canvas = await html2canvas(cloneEl, {
        scale: isMobile ? 1.5 : 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        imageTimeout: 15000,
        width: 800,
        height: source.offsetHeight || 1131,
        onclone: async (_doc, el) => {
          const cvs = document.createElement('canvas');
          cvs.width = 1; cvs.height = 1;
          const ctx2d = cvs.getContext('2d')!;
          const replaceOklch = (css: string): string => {
            if (!css.includes('oklch')) return css;
            const cache = new Map<string, string>();
            return css.replace(/oklch\([^)]+\)/g, (v) => {
              if (cache.has(v)) return cache.get(v)!;
              try {
                ctx2d.fillStyle = '#000';
                ctx2d.fillStyle = v;
                const hex = ctx2d.fillStyle;
                cache.set(v, hex);
                return hex;
              } catch {
                cache.set(v, '#888888');
                return '#888888';
              }
            });
          };
          const clonedDoc = el.ownerDocument;
          const links = Array.from(clonedDoc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
          for (const link of links) {
            try {
              const res = await fetch(link.href);
              let css = replaceOklch(await res.text());
              const s = clonedDoc.createElement('style');
              s.textContent = css;
              link.parentNode?.insertBefore(s, link);
              link.parentNode?.removeChild(link);
            } catch (e) { /* skip */ }
          }
          clonedDoc.querySelectorAll('style').forEach(s => {
            s.textContent = replaceOklch(s.textContent || '');
          });
        },
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
      alert('PDF 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (cloneEl && document.body.contains(cloneEl)) document.body.removeChild(cloneEl);
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
        className="w-[800px] bg-white p-10 print:p-0 shadow-2xl print:shadow-none text-black font-sans aspect-[1/1.414] overflow-hidden text-[13px] leading-tight border border-gray-200"
      >
        
        {/* 제목 */}
        <div className="text-center text-4xl font-black tracking-[1em] mb-6">거래명세서</div>
        
        {/* 상단 정보 영역 */}
        <div className="flex justify-between items-stretch gap-2 mb-4">
          
          {/* 왼쪽: 수신자 정보 */}
          <table className="border-collapse border-[2px] border-black w-[45%] text-sm">
            <tbody>
              <tr>
                <th className="border border-black p-1.5 w-24 tracking-[0.5em]">발행일자</th>
                <td className="border border-black p-1.5 text-center font-bold">{todayStr}</td>
              </tr>
              <tr>
                <th className="border border-black p-1.5 tracking-[0.5em]">주문번호</th>
                <td className="border border-black p-1.5 text-center font-bold">{todayStr.replace(/-/g, '')}-1</td>
              </tr>
              <tr>
                <th className="border border-black p-1.5 tracking-[0.5em]">수 신</th>
                <td className="border border-black p-1.5 text-center font-bold">{clientName}</td>
              </tr>
              <tr>
                <th className="border border-black p-1.5 tracking-[0.5em]">담 당</th>
                <td className="border border-black p-1.5 text-center font-bold">{ordererName} 귀하</td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-black p-4 text-left h-32 align-top text-xs leading-relaxed">
                  1. 귀사의 일익 번창하심을 기원합니다.<br/><br/>
                  2. 거래해주셔서 감사합니다.
                </td>
              </tr>
            </tbody>
          </table>

          {/* 오른쪽: 공급자 정보 */}
          <table className="border-collapse border-[2px] border-black w-[54%] text-[11px] text-center">
            <tbody>
              <tr>
                <td colSpan={4} className="border border-black p-2 relative h-[70px]">
                  <img src={LOGO_PATH} crossOrigin="anonymous" className="h-10 mx-auto object-contain" alt="New Gene Science Logo"/>
                </td>
              </tr>
              <tr>
                <th className="border border-black p-1 w-[22%] tracking-widest">사업자번호</th>
                <td colSpan={3} className="border border-black p-1 font-bold text-sm tracking-widest">595-81-02960</td>
              </tr>
              <tr>
                <th className="border border-black p-1 tracking-widest">상 호</th>
                <td className="border border-black p-1 font-bold">(주) 뉴진사이언스</td>
                <th className="border border-black p-1 w-[18%] tracking-widest">대 표 자</th>
                <td className="border border-black p-1 font-bold relative w-[25%]">
                  김 기 환 <span className="text-[10px] ml-1">(인)</span>
                  {/* 직인 이미지 (multiply 혼합 모드로 자연스럽게 겹침) */}
                  <img src={STAMP_PATH} crossOrigin="anonymous" className="absolute top-1/2 left-[70%] transform -translate-x-1/2 -translate-y-[55%] h-16 w-auto opacity-90 pointer-events-none" alt="직인" />
                </td>
              </tr>
              <tr>
                <th className="border border-black p-1 tracking-widest">주 소</th>
                <td colSpan={3} className="border border-black p-1 text-[10px] leading-tight">경기도 광명시 소하로 190, 비동 9층 21호(소하동, 광명G타워)</td>
              </tr>
              <tr>
                <th className="border border-black p-1 tracking-widest">업 태</th>
                <td className="border border-black p-1 text-[10px] leading-tight">서비스<br/>제조업<br/>도매 및 소매업</td>
                <th className="border border-black p-1 tracking-widest">종 목</th>
                <td className="border border-black p-1 text-[9px] leading-tight whitespace-nowrap">
                  생물학 연구개발업<br/>
                  의학 및 약학 연구개발업<br/>
                  의학약학 관련<br/>
                  연구개발컨설팅업
                </td>
              </tr>
              <tr>
                <th className="border border-black p-1 tracking-widest">연 락 처</th>
                <td className="border border-black p-1">02-898-8805</td>
                <th className="border border-black p-1 tracking-widest">팩 스</th>
                <td className="border border-black p-1">02-898-8806</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 품목 테이블 */}
        <table className="border-collapse border-[2px] border-black w-full text-xs">
          <thead>
            <tr>
              <th colSpan={7} className="border border-black p-2 text-left bg-[#f4f7f5]">
                <div className="flex justify-between items-center w-full px-2">
                  <span className="font-bold text-sm tracking-widest">합계 :</span>
                  <span className="font-bold text-base tracking-widest underline underline-offset-4">{totalAmountKorean} 원정 (₩{totalAmount.toLocaleString()} 원)</span>
                  <span className="text-[10px] text-gray-600">(VAT포함)</span>
                </div>
              </th>
            </tr>
            <tr className="bg-[#E4EAF2] text-center font-bold">
              <th className="border border-black p-1.5 w-10">No</th>
              <th className="border border-black p-1.5 w-24">품목코드</th>
              <th className="border border-black p-1.5">품 명 (제품명 / 규격)</th>
              <th className="border border-black p-1.5 w-12">수량</th>
              <th className="border border-black p-1.5 w-24">단 가</th>
              <th className="border border-black p-1.5 w-24">금 액</th>
              <th className="border border-black p-1.5 w-16">비고</th>
            </tr>
          </thead>
          <tbody>
            {allItems.map((item, idx) => (
              <tr key={idx} className="text-center h-8">
                <td className="border border-black p-1">{idx + 1}</td>
                <td className="border border-black p-1 text-center font-mono text-[10px]">{item.productCode}</td>
                <td className="border border-black p-1 text-left px-2 truncate max-w-[250px] text-[11px]">
                  {item.productName} {item.spec ? `(${item.spec})` : ''}
                </td>
                <td className="border border-black p-1">{item.quantity}</td>
                <td className="border border-black p-1 text-right px-2">{item.unitPrice.toLocaleString()}</td>
                <td className="border border-black p-1 text-right px-2 font-bold">{item.subtotal.toLocaleString()}</td>
                <td className="border border-black p-1"></td>
              </tr>
            ))}
            
            {/* 빈 행 채우기 */}
            {Array.from({ length: emptyRows }).map((_, idx) => (
              <tr key={`empty-${idx}`} className="text-center h-8">
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1"></td>
              </tr>
            ))}

            {/* 하단 집계표 */}
            <tr className="font-bold h-8">
              <td colSpan={5} rowSpan={3} className="border border-black p-3 text-left align-top text-xs font-normal">
                해외 발주 품목은 배송 사정에 따라 다소 지연 될 수 있음을 양해 바랍니다.
              </td>
              <th className="border border-black p-1 text-center bg-[#f4f7f5] tracking-[0.5em]">금 액</th>
              <td className="border border-black p-1 text-right px-2">{totalSubtotal.toLocaleString()}</td>
            </tr>
            <tr className="font-bold h-8">
              <th className="border border-black p-1 text-center bg-[#f4f7f5] tracking-[0.5em]">부가세</th>
              <td className="border border-black p-1 text-right px-2">{totalVat.toLocaleString()}</td>
            </tr>
            <tr className="font-bold h-8">
              <th className="border border-black p-1 text-center bg-[#f4f7f5] tracking-[0.5em]">합 계</th>
              <td className="border border-black p-1 text-right px-2 text-primary">{totalAmount.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {/* 최하단 안내사항 */}
        <table className="border-collapse border-[2px] border-black w-full text-[11px] mt-0 border-t-0">
          <tbody>
            <tr>
              <td className="border border-black p-1.5 w-[75%]">
                ▶ 납기 유효기간 : 주문 발행일로 부터 30일 이내입니다.
              </td>
              <td rowSpan={2} className="border border-black p-1.5 align-top">
                {'<비 고>'}
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1.5">
                ▶ 결제계좌 : 기업은행 699-037504-04-022 예금주 ㈜ 뉴진사이언스
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-red-500 font-bold">
                ☆ 수입발주 품목은 발주 진행 후 취소 불가합니다.
              </td>
              <td className="border border-black p-1.5 text-right bg-[#f4f7f5]">
                ◆ 작성자 : 김기환 // 영업담당자 : 010-5882-4997
              </td>
            </tr>
          </tbody>
        </table>

      </div>
      </div>  {/* scale wrapper 닫기 */}
    </div>
  );
}
