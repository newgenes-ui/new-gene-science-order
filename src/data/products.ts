export interface Product {
  id: string;
  code: string;
  name: string;
  spec: string;
  price: number;
  category: string;
}

export const PRODUCTS: Product[] = [
  // AG Refill Tips
  { id: 'p1', code: 'NGS-STAG-10-RTS', name: 'NuGens AG Refill Tip, 10ul, Nature, Sterile', spec: '960 Tips/Pack 10 Packs/Carton', price: 24000, category: 'AG Tip' },
  { id: 'p2', code: 'NGS-STAG-200-RTS', name: 'NuGensAG Refill Tip, 200ul, Yellow, Sterile', spec: '960 Tips/Pack 10 Packs/Carton', price: 24000, category: 'AG Tip' },
  { id: 'p3', code: 'NGS-STAG-1250-RTS', name: 'NuGens AG Refill Tip, 1250ul, Nature, Sterile', spec: '480 Tips/Pack 10 Packs/Carton', price: 19000, category: 'AG Tip' },
  // AG Racked Tips
  { id: 'p4', code: 'NGS-STAG-10-RS', name: 'NuGens AG Tip, 10ul, Nature, Racked, Sterile', spec: '96 Tips/rack, 10 racks/Pack, 5 Packs/Carton', price: 4000, category: 'AG Tip' },
  { id: 'p5', code: 'NGS-STAG-10L-RS', name: 'NuGens AG Tip, 10ul, Extra Long, Nature, Racked, Sterile', spec: '96 Tips/rack, 10 racks/Pack, 5 Packs/Carton', price: 4000, category: 'AG Tip' },
  { id: 'p6', code: 'NGS-STAG-200-RS', name: 'NuGens AG Tip, 200ul, Yellow, Racked, Sterile', spec: '96 Tips/rack, 10 racks/Pack, 5 Packs/Carton', price: 4000, category: 'AG Tip' },
  { id: 'p7', code: 'NGS-STAG-1250-RS', name: 'NuGens AG Tip, 1250ul, Nature, Racked, Sterile', spec: '96 Tips/rack, 10 racks/Pack, 5 Packs/Carton', price: 4500, category: 'AG Tip' },
  // Serological Pipette
  { id: 'p8', code: 'NGS-SEP-5', name: 'NuGens Serological pipette, Stretching, 5ml', spec: '200 PCS/BOX, 6 BOXES/CASE', price: 42000, category: '파이펫' },
  { id: 'p9', code: 'NGS-SEP-10', name: 'NuGens Serological pipette, Stretching, 10ml', spec: '200 PCS/BOX, 6 BOXES/CASE', price: 42000, category: '파이펫' },
  { id: 'p10', code: 'NGS-SEP-25', name: 'NuGens Serological pipette, Welding, 25ml', spec: '100 PCS/BOX, 6 BOXES/CASE', price: 40000, category: '파이펫' },
  { id: 'p11', code: 'NGS-SEP-50', name: 'NuGens Serological pipette, Welding, 50ml', spec: '75 PCS/BOX, 6 BOXES/CASE', price: 70000, category: '파이펫' },
  { id: 'p12', code: 'NGS-SEP-100', name: 'NuGens Serological pipette, Welding, 100ml', spec: '40 PCS/BOX, 6 BOXES/CASE', price: 85000, category: '파이펫' },
  // Centrifuge Tubes
  { id: 'p13', code: 'NGS-CT-3015-S', name: 'NuGens 15ml Centrifuge Tube, Sterile', spec: '25 PCS/Bag, 500PCS/Box', price: 64000, category: '튜브' },
  { id: 'p14', code: 'NGS-CT-3050-S', name: 'NuGens 50ml Centrifuge Tube, Sterile', spec: '25 PCS/Bag, 500PCS/Box', price: 86000, category: '튜브' },
  // Empty Racks
  { id: 'p15', code: 'NGS-STAG-10-RTS-ER', name: 'NuGens AG Tip, Empty rack, 10ul', spec: '10 racks/Pack, 5 Packs/Case', price: 2500, category: '랙' },
  { id: 'p16', code: 'NGS-STAG-200-TRS-ER', name: 'NuGens AG Tip, Empty rack, 200ul', spec: '10 racks/Pack, 5 Packs/Case', price: 2500, category: '랙' },
  { id: 'p17', code: 'NGS-STAG-1250-RTS-ER', name: 'NuGens AG Tip, Empty rack, 1250ul', spec: '10 racks/Pack, 5 Packs/Case', price: 3000, category: '랙' },
];

export interface Client {
  id: string;
  name: string;
  email: string;
  contactPerson?: string;
  phone?: string;
}

export const CLIENTS: Client[] = [
  { id: 'bertis', name: '(주)베르티스', email: 'hugyoung@naver.com', contactPerson: '양유지', phone: '010-9915-5974' },
  { id: 'samyang', name: '삼양사', email: '', contactPerson: '담당자', phone: '' },
  { id: 'samsung', name: '삼성바이오로직스', email: '', contactPerson: '담당자', phone: '' },
  { id: 'lgchem', name: 'LG화학', email: '', contactPerson: '담당자', phone: '' },
  { id: 'boryung', name: '보령제약', email: '', contactPerson: '담당자', phone: '' },
  { id: 'demo', name: '데모고객사', email: '', contactPerson: '담당자', phone: '' },
];

export const NGS_EMAIL = 'newgenes@newgenesci.com';
export const NGS_BANK = {
  bank: '기업은행',
  account: '699-037504-04-022',
  holder: '(주)뉴진사이언스',
};
