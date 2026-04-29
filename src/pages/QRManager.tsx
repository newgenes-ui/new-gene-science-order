import { useState, useRef } from 'react';
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

        {/* QR URL Info Panel */}
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

        {/* Upload Guide */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-primary to-[#1E3D30] rounded-3xl p-5 text-white">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-2xl flex items-center justify-center shrink-0">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <p className="font-extrabold text-sm">캔바 QR 이미지 업로드</p>
              <p className="text-xs opacity-70 mt-0.5 leading-relaxed">
                캔바에서 만든 QR 이미지를 각 업체 카드의 업로드 버튼으로 추가하세요.<br />
                업로드한 이미지는 카드에 표시되며 브라우저에 저장됩니다.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Add New Client */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-6 border border-[#E2E8E4] shadow-sm">
          <h2 className="font-extrabold text-slate-800 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> 새 업체 추가
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">업체 ID (영문)*</label>
              <input value={newId} onChange={e => setNewId(e.target.value.toLowerCase().replace(/\s/g, ''))} placeholder="예: bertis"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">업체명 *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="예: (주)베르티스"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
            </div>
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">업체 이메일</label>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="order@company.com" type="email"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
            </div>
          </div>
          <button onClick={addClient} className="mt-4 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-all active:scale-95">추가</button>
        </motion.div>

        {/* QR Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {clients.map((client, idx) => {
            const uploadedImg = uploadedImages[client.id];
            return (
              <motion.div key={client.id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                className={`bg-white rounded-3xl p-5 border shadow-sm hover:shadow-md transition-all ${client.id === 'bertis' ? 'border-primary/40 ring-2 ring-primary/10' : 'border-[#E2E8E4]'}`}>

                {client.id === 'bertis' && (
                  <span className="inline-block mb-2 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-extrabold uppercase tracking-wider rounded-lg">시연용</span>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-extrabold text-slate-800">{client.name}</p>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">?client={client.id}</p>
                    {client.email && <p className="text-[10px] text-slate-400 mt-0.5">{client.email}</p>}
                  </div>
                  <button onClick={() => removeClient(client.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* QR Display Area */}
                <div
                  className="relative flex justify-center items-center py-4 bg-slate-50 rounded-2xl overflow-hidden cursor-pointer hover:bg-slate-100 transition-colors min-h-[160px]"
                  onClick={() => setSelectedQR(client.id)}
                >
                  {uploadedImg ? (
                    <>
                      <img src={uploadedImg} alt={`${client.name} QR`} className="w-36 h-36 object-contain rounded-xl" />
                      <button
                        onClick={e => { e.stopPropagation(); handleRemoveImage(client.id); }}
                        className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-primary/80 text-white text-[9px] font-bold rounded-full">
                        이미지 업로드됨
                      </div>
                    </>
                  ) : (
                    <QRCodeSVG
                      id={`qr-svg-${client.id}`}
                      value={getQRUrl(client.id)}
                      size={140}
                      bgColor="#FFFFFF"
                      fgColor="#2D5A47"
                      level="M"
                    />
                  )}
                </div>

                {/* Hidden file input */}
                <input
                  ref={el => { fileInputRefs.current[client.id] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(client.id, file);
                    e.target.value = '';
                  }}
                />

                <div className="mt-3 flex gap-2">
                  <button onClick={() => copyUrl(client.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
                    <Copy className="w-3 h-3" />
                    {copiedId === client.id ? 'URL 복사됨!' : 'URL 복사'}
                  </button>
                  <button
                    onClick={() => fileInputRefs.current[client.id]?.click()}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      uploadedImg
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : 'bg-primary text-white hover:bg-primary-dark'
                    }`}
                  >
                    {uploadedImg
                      ? <><ImageIcon className="w-3 h-3" />이미지 교체</>
                      : <><Upload className="w-3 h-3" />이미지 업로드</>
                    }
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Fullscreen QR/Image Modal */}
      {selectedQR && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={() => setSelectedQR(null)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl p-8 text-center space-y-4 max-w-xs w-full shadow-2xl">
            <p className="font-extrabold text-slate-800 text-lg">{clients.find(c => c.id === selectedQR)?.name}</p>
            <div className="flex justify-center p-4 bg-slate-50 rounded-2xl">
              {uploadedImages[selectedQR] ? (
                <img src={uploadedImages[selectedQR]} alt="QR" className="w-52 h-52 object-contain" />
              ) : (
                <QRCodeSVG value={getQRUrl(selectedQR)} size={220} bgColor="#FFFFFF" fgColor="#2D5A47" level="M" />
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-mono break-all">{getQRUrl(selectedQR)}</p>
            <div className="flex gap-2">
              <button onClick={() => copyUrl(selectedQR)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">
                <Copy className="w-4 h-4 inline mr-1" />URL 복사
              </button>
              <button
                onClick={() => { fileInputRefs.current[selectedQR]?.click(); setSelectedQR(null); }}
                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-all">
                <Upload className="w-4 h-4 inline mr-1" />업로드
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
