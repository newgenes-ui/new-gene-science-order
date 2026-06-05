import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Trash2, QrCode, Copy, Wifi, Upload, ImageIcon, X, GripVertical, Download } from 'lucide-react';
import { CLIENTS, Client } from '../data/products';
import { getClientQRsFromSupabase, saveClientQRToSupabase, deleteClientQRFromSupabase } from '../store/orderStore';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const QR_IMAGES_KEY = 'ngs_qr_images'; // localStorage key
const NAV_ORDER_KEY = 'admin_nav_order'; // 하단 네비와 공유

function loadSavedImages(): Record<string, string> {
  try {
    const raw = localStorage.getItem(QR_IMAGES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveImage(clientId: string, dataUrl: string) {
  const all = loadSavedImages();
  all[clientId] = dataUrl;
  localStorage.setItem(QR_IMAGES_KEY, JSON.stringify(all));
}

function removeImage(clientId: string) {
  const all = loadSavedImages();
  delete all[clientId];
  localStorage.setItem(QR_IMAGES_KEY, JSON.stringify(all));
}

export default function QRManager() {
  useEffect(() => {
    document.title = "QR 코드 관리 | 뉴진사이언스";

    // 1) Supabase에서 QR 코드 불러오기 및 로컬 병합 + 로컬 기존 이미지 업로드
    const fetchQRs = async () => {
      try {
        const dbQRs = await getClientQRsFromSupabase();
        const localQRs = loadSavedImages();
        
        let needsUpload = false;
        
        // 로컬에 있는데 Supabase에 없거나 다른 데이터가 있다면 Supabase 데이터셋에 통합하여 업로드
        for (const [clientId, localImage] of Object.entries(localQRs)) {
          if (dbQRs[clientId] !== localImage) {
            dbQRs[clientId] = localImage;
            needsUpload = true;
          }
        }

        if (needsUpload && isSupabaseConfigured && supabase) {
          const items = Object.entries(dbQRs).map(([clientId, qrImage]) => ({ clientId, qrImage }));
          const systemRow = {
            id: 'SYSTEM-QR-IMAGES',
            order_date: '2000-01-01',
            order_date_time: '2000-01-01T00:00:00.000Z',
            client_id: 'system',
            client_name: 'System QR Codes',
            orderer_name: 'system',
            orderer_phone: '000-0000-0000',
            status: 'pending',
            order_type: 'quote',
            total_amount: 0,
            items: items
          };
          await supabase.from('orders').upsert(systemRow);
          console.log('✅ Local QR codes uploaded to Supabase.');
        }

        const finalMerged = { ...localQRs, ...dbQRs };
        localStorage.setItem(QR_IMAGES_KEY, JSON.stringify(finalMerged));
        setUploadedImages(finalMerged);
      } catch (err) {
        console.error('Failed to fetch/sync QRs with Supabase:', err);
      }
    };
    fetchQRs();

    // 2) 실시간 QR 코드 테이블 변경 구독
    let unsubscribe: (() => void) | undefined;
    if (isSupabaseConfigured && supabase) {
      const channel = supabase
        .channel('public:orders_qr')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: 'id=eq.SYSTEM-QR-IMAGES' },
          (payload: any) => {
            console.log('🔔 실시간 QR코드 변경 감지:', payload);
            const items = payload.new?.items;
            if (Array.isArray(items)) {
              const dbQRs: Record<string, string> = {};
              items.forEach((item: any) => {
                if (item.clientId && item.qrImage) {
                  dbQRs[item.clientId] = item.qrImage;
                }
              });
              setUploadedImages(prev => {
                const merged = { ...prev, ...dbQRs };
                localStorage.setItem(QR_IMAGES_KEY, JSON.stringify(merged));
                return merged;
              });
            }
          }
        )
        .subscribe();
      
      unsubscribe = () => {
        supabase.removeChannel(channel);
      };
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ── 업체 순서 상태 (하단 네비바와 공유) ──
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(NAV_ORDER_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return CLIENTS.filter(c => c.id !== 'demo').map(c => c.id);
  });

  const orderedClients = useMemo(() => {
    const valid = CLIENTS.filter(c => c.id !== 'demo').map(c => c.id);
    const ordered = orderedIds.filter(id => valid.includes(id));
    const missing = valid.filter(id => !ordered.includes(id));
    return [...ordered, ...missing]
      .map(id => CLIENTS.find(c => c.id === id)!)
      .filter(Boolean);
  }, [orderedIds]);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newId, setNewId] = useState('');
  const [selectedQR, setSelectedQR] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [baseUrl] = useState('https://new-gene-science-order.vercel.app');
  const [showUrlEdit, setShowUrlEdit] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<string, string>>(loadSavedImages);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── 드래그 상태 ──
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const draggedRef = useRef(false);
  const touchRef = useRef({ id: '', timer: 0, dragging: false, sx: 0, sy: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  // ── 모바일 터치 드래그용 non-passive 리스너 ──
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      const tr = touchRef.current;
      const t = e.touches[0];
      if (!tr.dragging && tr.timer) {
        if (Math.abs(t.clientX - tr.sx) > 10 || Math.abs(t.clientY - tr.sy) > 10) {
          clearTimeout(tr.timer);
          tr.timer = 0;
        }
        return;
      }
      if (!tr.dragging) return;
      e.preventDefault();
      const target = document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-qid]');
      setOverId(target ? target.getAttribute('data-qid') : null);
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  // ── 순서 변경 ──
  const doReorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = orderedClients.map(c => c.id);
    const fi = ids.indexOf(fromId);
    const ti = ids.indexOf(toId);
    if (fi < 0 || ti < 0) return;
    const next = [...ids];
    next.splice(fi, 1);
    next.splice(ti, 0, fromId);
    setOrderedIds(next);
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next));
  };

  const addClient = () => {
    if (!newName || !newId) { alert('업체명과 ID를 입력해주세요.'); return; }
    if (orderedClients.find(c => c.id === newId)) { alert('이미 존재하는 ID입니다.'); return; }
    const newIds = [...orderedIds, newId];
    setOrderedIds(newIds);
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(newIds));
    setNewName(''); setNewEmail(''); setNewId('');
  };

  const removeClient = (id: string) => {
    if (confirm('삭제하시겠습니까?')) {
      const newIds = orderedIds.filter(i => i !== id);
      setOrderedIds(newIds);
      localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(newIds));
      handleRemoveImage(id);
    }
  };

  const getQRUrl = (clientId: string) => `${baseUrl}/?client=${clientId}`;

  const copyUrl = (clientId: string) => {
    navigator.clipboard.writeText(getQRUrl(clientId)).then(() => {
      setCopiedId(clientId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleImageUpload = (clientId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      saveImage(clientId, dataUrl);
      setUploadedImages(prev => ({ ...prev, [clientId]: dataUrl }));

      try {
        await saveClientQRToSupabase(clientId, dataUrl);
      } catch (err) {
        console.error('Failed to sync uploaded QR to Supabase:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = async (clientId: string) => {
    removeImage(clientId);
    setUploadedImages(prev => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });

    try {
      await deleteClientQRFromSupabase(clientId);
    } catch (err) {
      console.error('Failed to delete QR from Supabase:', err);
    }
  };

  // ── QR 이미지 다운로드 ──
  const downloadQR = (clientId: string) => {
    const client = orderedClients.find(c => c.id === clientId);
    const safeName = client?.name?.replace(/[^a-zA-Z0-9가-힣]/g, '_') || clientId;

    // 업로드된 캔바 이미지가 있으면 그것을 다운로드
    if (uploadedImages[clientId]) {
      const link = document.createElement('a');
      link.download = `QR_${safeName}.png`;
      link.href = uploadedImages[clientId];
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // 시스템 생성 QR (SVG → PNG 변환 후 다운로드)
    const svgEl = document.querySelector(`[data-qid="${clientId}"] svg`);
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const link = document.createElement('a');
      link.download = `QR_${safeName}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F0F4F1] to-[#E8F0EA] pb-20">
      <header className="bg-white/80 backdrop-blur-xl border-b border-[#E2E8E4] sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-primary">QR코드 관리</p>
            <p className="text-[10px] text-slate-400">업체별 전용 QR 코드 관리 · 드래그로 순서 변경</p>
          </div>
          <button onClick={() => setShowUrlEdit(!showUrlEdit)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-600 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors">
            <Wifi className="w-3.5 h-3.5" /> QR URL 확인
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {showUrlEdit && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 border border-blue-200 rounded-3xl p-5 space-y-3">
            <p className="text-sm font-bold text-blue-800">🔗 각 업체 QR 코드 URL 목록</p>
            <p className="text-xs text-blue-600">캔바에서 QR 만들 때 아래 URL을 사용하세요</p>
            <div className="space-y-2">
              {orderedClients.map(c => (
                <div key={c.id} className="flex items-center gap-2 bg-white rounded-xl p-3 border border-blue-100">
                  <span className="text-xs font-bold text-slate-600 w-24 shrink-0">{c.name}</span>
                  <code className="text-xs text-primary font-mono flex-1 break-all">{getQRUrl(c.id)}</code>
                  <button onClick={() => copyUrl(c.id)}
                    className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/20 shrink-0">
                    {copiedId === c.id ? '복사됨!' : '복사'}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-primary to-[#1E3D30] rounded-3xl p-5 text-white">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-2xl flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <p className="font-extrabold text-sm">캔바 QR 이미지 업로드</p>
              <p className="text-xs opacity-70 mt-0.5 leading-relaxed">
                시스템 생성 QR로 테스트 후, 캔바에서 만든 최종 이미지를 업로드하세요.
              </p>
            </div>
          </div>
        </motion.div>

        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orderedClients.map(client => {
            const isDragging = dragId === client.id;
            const isDropTarget = overId === client.id && dragId != null && dragId !== client.id;

            return (
              <motion.div
                key={client.id}
                data-qid={client.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: isDragging ? 0.4 : 1, scale: isDragging ? 0.95 : isDropTarget ? 1.02 : 1 }}
                transition={{ duration: 0.2 }}
                className={`bg-white rounded-3xl p-5 border shadow-sm relative overflow-hidden group select-none
                  transition-all duration-200
                  ${isDropTarget
                    ? 'border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10'
                    : 'border-[#E2E8E4]'
                  }`}
              >
                {/* 드래그 핸들 */}
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', client.id);
                    setTimeout(() => setDragId(client.id), 0);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== client.id) setOverId(client.id);
                  }}
                  onDragLeave={() => setOverId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId) doReorder(dragId, client.id);
                    setDragId(null); setOverId(null);
                  }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    const tr = touchRef.current;
                    tr.id = client.id; tr.sx = t.clientX; tr.sy = t.clientY; tr.dragging = false;
                    tr.timer = window.setTimeout(() => {
                      tr.dragging = true;
                      setDragId(client.id);
                      if (navigator.vibrate) navigator.vibrate(30);
                    }, 400);
                  }}
                  onTouchEnd={() => {
                    const tr = touchRef.current;
                    if (tr.timer) clearTimeout(tr.timer);
                    if (tr.dragging && dragId && overId) {
                      doReorder(dragId, overId);
                    }
                    tr.dragging = false; tr.id = '';
                    setDragId(null); setOverId(null);
                  }}
                  className="absolute top-4 right-12 w-7 h-7 flex items-center justify-center rounded-full
                    text-slate-200 hover:text-slate-500 hover:bg-slate-100 cursor-grab active:cursor-grabbing transition-colors z-10"
                  title="드래그하여 순서 변경"
                >
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* 드롭 영역 (카드 전체) */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== client.id) setOverId(client.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId) doReorder(dragId, client.id);
                    setDragId(null); setOverId(null);
                  }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-extrabold text-slate-800">{client.name}</p>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">?client={client.id}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                    <div className="flex flex-col items-center gap-2">
                      <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setSelectedQR(getQRUrl(client.id))}>
                        <QRCodeSVG 
                          value={getQRUrl(client.id)} 
                          size={90} 
                          level="H" 
                          fgColor="#1E3D30"
                          imageSettings={{
                            src: "/logo.png",
                            x: undefined,
                            y: undefined,
                            height: 20,
                            width: 20,
                            excavate: true,
                          }}
                        />
                      </div>
                      <p className="text-[9px] font-black text-primary uppercase tracking-tighter">시스템 생성 QR</p>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      {uploadedImages[client.id] ? (
                        <div className="relative group cursor-pointer" onClick={() => setSelectedQR(uploadedImages[client.id])}>
                          <img src={uploadedImages[client.id]} alt="QR" className="w-[114px] h-[114px] object-contain rounded-2xl border border-slate-100 bg-white" />
                          <button onClick={e => { e.stopPropagation(); handleRemoveImage(client.id); }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => fileInputRefs.current[client.id]?.click()}
                          className="w-[114px] h-[114px] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-300 hover:border-primary hover:text-primary transition-all bg-white">
                          <ImageIcon className="w-6 h-6" />
                          <span className="text-[10px] font-bold">이미지 업로드</span>
                        </button>
                      )}
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">캔바 업로드 QR</p>
                    </div>
                  </div>

                  <input ref={el => { fileInputRefs.current[client.id] = el; }} type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(client.id, file);
                      e.target.value = '';
                    }} />

                  <div className="mt-4 flex gap-2">
                    <button onClick={() => copyUrl(client.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all active:scale-95">
                      <Copy className="w-3 h-3" /> URL 복사
                    </button>
                    <button onClick={() => downloadQR(client.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all active:scale-95">
                      <Download className="w-3 h-3" /> {uploadedImages[client.id] ? 'QR 다운로드' : 'QR 다운로드'}
                    </button>
                    <button onClick={() => fileInputRefs.current[client.id]?.click()}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-dark transition-all active:scale-95">
                      {uploadedImages[client.id] ? <ImageIcon className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
                      {uploadedImages[client.id] ? '이미지 교체' : 'QR 업로드'}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Fullscreen QR Modal */}
      {selectedQR && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setSelectedQR(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-8 rounded-[40px] shadow-2xl flex flex-col items-center gap-6 max-w-xs w-full">
            <div className="w-full flex justify-end -mt-4 -mr-4">
               <button className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            {selectedQR.startsWith('http') && !selectedQR.startsWith('data') ? (
              <QRCodeSVG 
                value={selectedQR} 
                size={240} 
                level="H" 
                fgColor="#1E3D30"
                imageSettings={{
                  src: "/logo.png",
                  x: undefined,
                  y: undefined,
                  height: 54,
                  width: 54,
                  excavate: true,
                }}
              />
            ) : (
              <img src={selectedQR} alt="QR" className="w-60 h-60 object-contain" />
            )}
            <p className="text-center text-sm font-bold text-slate-800">휴대폰 카메라로 스캔하세요</p>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
