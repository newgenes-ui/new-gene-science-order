import { useState, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Trash2, QrCode, Copy, Wifi, Upload, ImageIcon, X } from 'lucide-react';
import { CLIENTS, Client } from '../data/products';

const QR_IMAGES_KEY = 'ngs_qr_images'; // localStorage key

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
  const [clients, setClients] = useState<Client[]>(CLIENTS);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newId, setNewId] = useState('');
  const [selectedQR, setSelectedQR] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [baseUrl] = useState('https://new-gene-science-order.vercel.app');
  const [showUrlEdit, setShowUrlEdit] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<Record<string, string>>(loadSavedImages);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const addClient = () => {
    if (!newName || !newId) { alert('업체명과 ID를 입력해주세요.'); return; }
    if (clients.find(c => c.id === newId)) { alert('이미 존재하는 ID입니다.'); return; }
    setClients(prev => [...prev, { id: newId, name: newName, email: newEmail, contactPerson: '', phone: '' }]);
    setNewName(''); setNewEmail(''); setNewId('');
  };

  const removeClient = (id: string) => {
    if (confirm('삭제하시겠습니까?')) {
      setClients(prev => prev.filter(c => c.id !== id));
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
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      saveImage(clientId, dataUrl);
      setUploadedImages(prev => ({ ...prev, [clientId]: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = (clientId: string) => {
    removeImage(clientId);
    setUploadedImages(prev => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
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
            <p className="text-[10px] text-slate-400">업체별 전용 QR 코드 관리</p>
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
              {clients.map(c => (
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map(client => (
            <motion.div key={client.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl p-5 border border-[#E2E8E4] shadow-sm relative overflow-hidden group">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-extrabold text-slate-800">{client.name}</p>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">?client={client.id}</p>
                </div>
                <button onClick={() => removeClient(client.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-200 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                <div className="flex flex-col items-center gap-2">
                  <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setSelectedQR(getQRUrl(client.id))}>
                    <QRCodeSVG value={getQRUrl(client.id)} size={90} level="H" />
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
                <button onClick={() => fileInputRefs.current[client.id]?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-dark transition-all active:scale-95">
                  {uploadedImages[client.id] ? <ImageIcon className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
                  {uploadedImages[client.id] ? '이미지 교체' : 'QR 업로드'}
                </button>
              </div>
            </motion.div>
          ))}
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
              <QRCodeSVG value={selectedQR} size={240} level="H" />
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
