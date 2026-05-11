import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getOrdersFromSupabase, Order } from '../store/orderStore';
import { Printer, Download, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function QuoteViewer() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const quoteRef = useRef<HTMLDivElement>(null);

  const idsParam = searchParams.get('ids') || '';
  const orderIds = idsParam.split(',').filter(Boolean);

  const LOGO_PATH = "/logo.png";
  const STAMP_PATH = "/stamp.png";

  const handleDownloadPDF = async () => {
    if (!quoteRef.current || isDownloading) return;
    setIsDownloading(true);
    
    const scrollY = window.scrollY;
    
    try {
      window.scrollTo(0, 0);
      
      // 이미지를 Base64로 미리 변환 (CORS 및 로딩 에러 방지)
      const toBase64 = (url: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = url;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/png"));
          };
          img.onerror = reject;
        });
      };

      // 렌더링 대기
      await new Promise(resolve => setTimeout(resolve, 500));

      const element = quoteRef.current;
      const canvas = await html2canvas(element, {
        scale: 1.5, // 안정적인 해상도
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        width: element.scrollWidth,
        height: element.scrollHeight
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = `견적서_${orders[0]?.clientName || 'NGS'}_${dateStr}.pdf`;
      
      // 모바일 우회 방식: 새 창에서 열기 (Safari 대응)
      const blob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      
      // PC와 모바일을 구분하여 처리
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        window.open(blobUrl, '_blank');
      } else {
        pdf.save(fileName);
      }
      
      // 메모리 정리
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    } catch (error) {
      console.error('PDF 생성 상세 에러:', error);
      alert('PDF 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주시거나, 화면을 캡처해 주세요.');
    } finally {
      window.scrollTo(0, scrollY);
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

      <div ref={quoteRef} id="quote-container" className="w-full max-w-[800px] bg-white p-10 print:p-0 shadow-2xl print:shadow-none text-black font-sans aspect-[1/1.414] mx-auto overflow-hidden text-[12px] leading-tight border border-gray-200">
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
                  김 기 환
                  <img src={STAMP_PATH} crossOrigin="anonymous" className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-12 w-auto opacity-80" alt="Stamp" />
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
            <tr>
              <th colSpan={8} className="border border-black p-2 bg-[#f8fafc]">
                <div className="flex justify-between items-center px-2">
                  <span className="font-bold text-sm tracking-widest">합계 :</span>
                  <span className="font-bold text-base tracking-widest underline underline-offset-4">{totalAmountKorean} 원정</span>
                  <span className="text-sm font-bold">₩{totalAmount.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500">(VAT포함)</span>
                </div>
              </th>
            </tr>
            <tr className="bg-[#E4EAF2] text-center font-bold h-8">
              <th className="border border-black p-1 w-10">No</th>
              <th className="border border-black p-1">품 명</th>
              <th className="border border-black p-1 w-20">코드</th>
              <th className="border border-black p-1 w-20">규격</th>
              <th className="border border-black p-1 w-12">수량</th>
              <th className="border border-black p-1 w-20">단가</th>
              <th className="border border-black p-1 w-24">금액</th>
              <th className="border border-black p-1 w-20">비고</th>
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
                <td className="border border-black p-1"></td>
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
            <tr className="h-10 font-bold bg-gray-50">
              <td colSpan={5} className="border border-black p-2 text-left align-top font-normal text-[10px]">
                {`<비 고>`}
              </td>
              <td className="border border-black p-1 text-center flex flex-col items-center justify-center h-full">
                <span>금액</span>
                <span className="text-[9px] font-normal">부가세</span>
                <span className="text-primary">합계</span>
              </td>
              <td className="border border-black p-1 text-right px-2 flex flex-col justify-center h-full">
                <span>{totalSubtotal.toLocaleString()}</span>
                <span className="text-[9px] font-normal">{totalVat.toLocaleString()}</span>
                <span className="text-primary">{totalAmount.toLocaleString()}</span>
              </td>
              <td className="border border-black p-1"></td>
            </tr>
          </tfoot>
        </table>

        <div className="border-[2px] border-black p-2 text-[10px] leading-relaxed">
          <p className="font-bold">▶ 견적 유효기간 : 견적 발행일로 14일 입니다.</p>
          <p>▶ 결제계좌 : 기업은행 699-037504-04-022 예금주 ㈜ 뉴진사이언스</p>
          <p className="text-red-500 font-bold">★ 수입발주 품목은 발주 진행 후 취소 불가합니다.</p>
          <div className="flex justify-end mt-1 font-bold text-slate-700">
            ◆ 작성자 : 양유지 매니저 // 영업담당자 : 010-7169-8805
          </div>
        </div>
      </div>
    </div>
  );
}
