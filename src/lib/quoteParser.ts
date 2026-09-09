import { GoogleGenAI } from '@google/genai';

export interface ParsedQuoteItem {
  manufacturer: string;     // 제조사 (Sigma, Merck, Invitrogen, SPL 등)
  catalogNumber: string;    // 카탈로그 번호
  productName: string;      // 제품명
  spec: string;             // 규격 (용량, 포장단위 등)
  quantity: number;         // 수량 (기본 1)
  estimatedPrice: number;   // 공급 단가 (원)
  remarks?: string;         // 적요 / 비고
}

export function getGeminiApiKey(): string {
  try {
    const local = localStorage.getItem('ngs_gemini_api_key');
    if (local && local.trim()) return local.trim();
  } catch {}
  return import.meta.env.VITE_GEMINI_API_KEY || '';
}

export function setGeminiApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem('ngs_gemini_api_key', key.trim());
    } else {
      localStorage.removeItem('ngs_gemini_api_key');
    }
  } catch {}
}

/**
 * Gemini AI 인스턴스 반환
 */
function getAIClient() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch (e) {
    console.error('Failed to init GoogleGenAI:', e);
    return null;
  }
}

/**
 * 1. 고객 견적 요청 텍스트 파싱
 */
export async function parseQuoteRequest(requestText: string): Promise<ParsedQuoteItem[]> {
  const ai = getAIClient();
  if (!ai) {
    console.warn('⚠️ VITE_GEMINI_API_KEY가 설정되지 않았습니다. 기본 텍스트 파서로 처리합니다.');
    return fallbackParse(requestText);
  }

  try {
    const prompt = `You are a Korean laboratory reagent/consumable procurement specialist for NuGene Science (뉴진사이언스).
Parse the following customer inquiry text and extract structured product list.

Target products typically include lab reagents, consumables from Sigma, Merck, Invitrogen/Thermo Fisher, SPL, Corning, etc.
Extract manufacturer, catalog number, clean product name, spec (volume, weight, package), quantity, and typical market price (KRW).

IMPORTANT RULES:
1. Quantity defaults to 1 unless specified (e.g., "2box" -> 2, "3개" -> 3).
2. Clean up product names and catalog numbers.
3. estimatedPrice: Put typical Korean supply/market price in KRW (number), or 0 if unknown.
4. Output STRICT JSON array format:
[
  {
    "manufacturer": "string",
    "catalogNumber": "string",
    "productName": "string",
    "spec": "string",
    "quantity": number,
    "estimatedPrice": number,
    "remarks": "string"
  }
]

Inquiry text:
"""
${requestText}
"""`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    return cleanAndParseJson(response.text?.trim() || '');
  } catch (error) {
    console.error('Gemini AI 견적 파싱 실패:', error);
    return fallbackParse(requestText);
  }
}

/**
 * 2. 구매처 견적서 이미지(사진/스크린샷) 파싱 (멀티모달)
 * 관리자가 거래처/구매처에서 받은 견적서 표 캡처 이미지를 업로드하거나 Ctrl+V 붙여넣었을 때 분석
 */
export async function parseSupplierQuoteImage(base64Data: string, mimeType = 'image/png'): Promise<ParsedQuoteItem[]> {
  const ai = getAIClient();
  if (!ai) {
    throw new Error('구매처 견적서 캡처 사진 AI 분석을 위해 Gemini API 키 설정이 필요합니다.');
  }

  // base64 prefix 제거
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '');

  const prompt = `You are an expert procurement clerk at NuGene Science (뉴진사이언스).
Analyze this supplier/vendor quotation or invoice table image and extract all quoted product line items.

For each item row in the quotation table:
1. Extract 순번/No
2. Extract 품목명/규격 (Separate manufacturer like Invitrogen, Merck, Sigma, SPL, catalog number like D11347, 345789, P5379, 20100, product name, and spec like 10 x 1mg, 20ML, 100g, 25g)
3. Extract 수량 (Quantity)
4. Extract 단가 (Unit Price, strictly the number before VAT, without commas/currency symbols)
5. Extract 적요/비고 (Remarks, 납기 등)

CRITICAL INSTRUCTIONS:
- unitPrice (단가) must be exact integer from the table (e.g. 508800, 139600, 68700, 62100).
- If table shows catalog number inside product name like "(Invitrogen) D11347 - Dihydroethidium", catalogNumber is "D11347", manufacturer is "Invitrogen", and productName is "Dihydroethidium (Hydroethidine)".
- Return STRICT JSON array format only:
[
  {
    "manufacturer": "string",
    "catalogNumber": "string",
    "productName": "string",
    "spec": "string",
    "quantity": number,
    "estimatedPrice": number,
    "remarks": "string"
  }
]`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType
          }
        },
        prompt
      ],
    });

    const result = cleanAndParseJson(response.text?.trim() || '');
    return result;
  } catch (error: any) {
    console.error('구매처 견적서 이미지 분석 실패:', error);
    throw error;
  }
}

/**
 * 2-1. 복수(2장 이상)의 구매처 견적서 이미지 동시 분석
 * 예: 1번 캡처는 Sigma/Merck, 2번 캡처는 SPL 견적서인 경우 등
 */
export async function parseSupplierQuoteImages(base64Array: string[]): Promise<ParsedQuoteItem[]> {
  const ai = getAIClient();
  if (!ai) {
    throw new Error('구매처 견적서 캡처 사진 AI 분석을 위해 Gemini API 키 설정이 필요합니다.');
  }

  if (base64Array.length === 0) return [];

  // 각 이미지 병렬 분석
  const results = await Promise.all(
    base64Array.map(b64 => parseSupplierQuoteImage(b64))
  );

  // 모든 이미지의 품목을 하나로 합침
  const combined = results.flat();
  if (combined.length === 0) {
    throw new Error('첨부된 이미지들에서 품목 데이터를 인식하지 못했습니다. 이미지가 선명한지 확인해주세요.');
  }
  return combined;
}

/**
 * 3. 구매처 견적서 텍스트 또는 엑셀 복사-붙여넣기 파싱
 */
export async function parseSupplierQuoteText(rawText: string): Promise<ParsedQuoteItem[]> {
  const ai = getAIClient();
  if (ai) {
    try {
      const prompt = `You are an expert procurement clerk at NuGene Science.
Extract structured quotation line items from this supplier quote text (which was copied from an Excel sheet or supplier web table).

Extract manufacturer, catalog number, product name, spec, quantity, unit price (단가 as integer), and remarks.

Return ONLY a strict JSON array:
[
  {
    "manufacturer": "string",
    "catalogNumber": "string",
    "productName": "string",
    "spec": "string",
    "quantity": number,
    "estimatedPrice": number,
    "remarks": "string"
  }
]

Supplier quote text:
"""
${rawText}
"""`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      const parsed = cleanAndParseJson(response.text?.trim() || '');
      if (parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('AI supplier text parse failed, falling back to regex:', e);
    }
  }

  // Fallback: 표 형식 / 탭 / 쉼표 / 공백 정규식 분석
  return fallbackSupplierTableParse(rawText);
}

/**
 * JSON 텍스트 정제 및 파싱 헬퍼
 */
function cleanAndParseJson(text: string): ParsedQuoteItem[] {
  let jsonStr = text;
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => ({
      manufacturer: String(item.manufacturer || '').trim(),
      catalogNumber: String(item.catalogNumber || '').trim(),
      productName: String(item.productName || '').trim(),
      spec: String(item.spec || '').trim(),
      quantity: Number(item.quantity) || 1,
      estimatedPrice: Number(item.estimatedPrice) || 0,
      remarks: String(item.remarks || '').trim(),
    }));
  } catch (e) {
    console.error('Failed to parse AI response JSON:', e, text);
    return [];
  }
}

/**
 * 엑셀 또는 웹 테이블 복사 텍스트용 fallback 파서
 * 예: "1	(Invitrogen) D11347 - Dihydroethidium [10 x 1mg]	1	508,800	508,800	1주일내"
 * 예: "SPL 20100(BX): RT: Cell Culture Dish	2	62,100	124,200"
 */
export function fallbackSupplierTableParse(text: string): ParsedQuoteItem[] {
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const mergedLines: string[] = [];
  let currentBuffer = '';

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    
    // 줄이 순번 숫자 하나만 달랑 있는 경우 (예: "4")
    if (/^\d{1,3}$/.test(line)) {
      if (currentBuffer) {
        mergedLines.push(currentBuffer);
      }
      currentBuffer = line;
      continue;
    }

    // 새로운 품목의 시작인지 확인:
    // 순번(숫자) + 제조사 괄호/단어 (예: "1 (Invitrogen)", "2 (Merck)", "1 SPL")
    const isNewItemStart = /^\d{1,3}\s+[\(\[]?[A-Za-z가-힣]/.test(line);

    if (isNewItemStart && currentBuffer && /[\d,]{4,}/.test(currentBuffer)) {
      mergedLines.push(currentBuffer);
      currentBuffer = line;
    } else {
      if (currentBuffer) {
        currentBuffer += ' ' + line;
      } else {
        currentBuffer = line;
      }
    }
  }
  if (currentBuffer) mergedLines.push(currentBuffer);

  const items: ParsedQuoteItem[] = [];

  for (const line of mergedLines) {
    if (line.includes('품목명') && line.includes('단가')) continue;

    // 가격 패턴 찾기: [수량] [단가] [공급가] ...
    // 예: ... 1 68,700 68,700 ...
    const priceMatch = line.match(/(.*?)(?:^|\s+)(\d{1,4})\s+([\d,]{4,12})\s+([\d,]{4,12})(.*)$/);
    
    if (priceMatch) {
      let productPart = priceMatch[1].trim();
      const qty = parseInt(priceMatch[2], 10);
      const unitPrice = parseInt(priceMatch[3].replace(/,/g, ''), 10);
      const remarks = (priceMatch[5] || '').trim();

      // 앞 순번 제거 (예: "4 (Sigma)..." -> "(Sigma)...")
      productPart = productPart.replace(/^\d+\s+/, '').trim();

      // 제조사 분리
      let manufacturer = '';
      const mMatch = productPart.match(/^\(([a-zA-Z가-힣\s]+)\)/);
      if (mMatch) {
        manufacturer = mMatch[1].trim();
        productPart = productPart.replace(mMatch[0], '').trim();
      } else {
        const firstWord = productPart.split(/[\s:_-]/)[0];
        if (['SPL', 'Sigma', 'Merck', 'Thermo', 'Gibco', 'Corning', 'Invitrogen'].includes(firstWord)) {
          manufacturer = firstWord;
          productPart = productPart.replace(new RegExp(`^${firstWord}[\\s:_-]*`), '').trim();
        }
      }

      // 규격 대괄호 분리 [10 x 1mg] 등
      let spec = '';
      const sMatch = productPart.match(/\[(.*?)\]/);
      if (sMatch) {
        spec = sMatch[1].trim();
        productPart = productPart.replace(sMatch[0], '').trim();
      }

      // 카탈로그 번호 분리 (D11347, E3889-25G, P5379-100G, 345789-20MLCN, 20100)
      let catalogNumber = '';
      const catMatch = productPart.match(/^([A-Z0-9]+(?:-[A-Z0-9]+)?)\b/i) || productPart.match(/\b([A-Z]?\d{4,8}(?:-[A-Z0-9]+)?)\b/i);
      if (catMatch) {
        catalogNumber = catMatch[1];
        productPart = productPart.replace(catalogNumber, '').replace(/^[-:\s]+/, '').trim();
      }

      items.push({
        manufacturer,
        catalogNumber,
        productName: productPart || catalogNumber,
        spec,
        quantity: qty,
        estimatedPrice: unitPrice,
        remarks
      });
    } else {
      // 탭이나 다중 공백으로 분리되는 일반 테이블 fallback
      const parts = line.split(/\t+|\s{2,}/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const numbers: { val: number; raw: string; idx: number }[] = [];
        parts.forEach((p, idx) => {
          const cleanNum = p.replace(/[,\s₩원]/g, '');
          if (/^\d+$/.test(cleanNum)) {
            numbers.push({ val: parseInt(cleanNum, 10), raw: p, idx });
          }
        });

        if (numbers.length >= 1) {
          const unitPrice = numbers[numbers.length - 1].val;
          const quantity = numbers.length >= 2 ? numbers[numbers.length - 2].val : 1;
          const productPart = parts.slice(0, numbers.length >= 2 ? numbers[numbers.length - 2].idx : numbers[numbers.length - 1].idx).join(' ');

          items.push({
            manufacturer: '',
            catalogNumber: '',
            productName: productPart || line,
            spec: '',
            quantity: quantity < 500 ? quantity : 1,
            estimatedPrice: unitPrice,
            remarks: ''
          });
        }
      }
    }
  }

  return items;
}

/**
 * 4. 고객 견적요청 fallback 파서
 */
function fallbackParse(text: string): ParsedQuoteItem[] {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const items: ParsedQuoteItem[] = [];

  const manufacturerKeywords: Record<string, string> = {
    'sigma': 'Sigma',
    'merck': 'Merck',
    'thermo': 'Thermo Fisher',
    'invitrogen': 'Invitrogen',
    'gibco': 'Gibco',
    'spl': 'SPL',
    'corning': 'Corning',
    'fisher': 'Fisher Scientific',
    'bio-rad': 'Bio-Rad',
    'roche': 'Roche',
    'abcam': 'Abcam',
  };

  for (const line of lines) {
    const lower = line.toLowerCase();
    let manufacturer = '';
    for (const [keyword, name] of Object.entries(manufacturerKeywords)) {
      if (lower.includes(keyword)) {
        manufacturer = name;
        break;
      }
    }

    const catalogMatch = line.match(/\b([A-Z]\d{3,6})\b/) || line.match(/\b(\d{4,6})\b/);
    const catalogNumber = catalogMatch ? catalogMatch[1] : '';

    const qtyMatch = line.match(/(\d+)\s*(?:box|ea|개|박스|pack|bottle|set)/i);
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    const specMatch = line.match(/(\d+(?:\.\d+)?\s*(?:ml|ul|μl|mg|g|kg|l|L|ML|UL|MG|G))\b/i);
    const spec = specMatch ? specMatch[1] : '';

    let productName = line;
    if (manufacturer) {
      for (const keyword of Object.keys(manufacturerKeywords)) {
        productName = productName.replace(new RegExp(keyword, 'gi'), '');
      }
    }
    if (catalogNumber) {
      productName = productName.replace(catalogNumber, '');
    }
    productName = productName.replace(/[-–—,]/g, ' ').replace(/\s+/g, ' ').trim();

    if (productName.length > 0 || catalogNumber) {
      items.push({
        manufacturer,
        catalogNumber,
        productName: productName || `제품 ${catalogNumber}`,
        spec,
        quantity,
        estimatedPrice: 0,
      });
    }
  }

  return items;
}

export function isAIParsingAvailable(): boolean {
  return !!GEMINI_API_KEY;
}
