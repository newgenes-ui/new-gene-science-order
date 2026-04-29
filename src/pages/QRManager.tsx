import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Plus, Trash2, QrCode, Copy, Wifi } from 'lucide-react';
import { CLIENTS, Client } from '../data/products';

export default function QRManager() {
  const [clients, setClients] = useState<Client[]>(CLIENTS);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newId, setNewId] = useState('');
  const [selectedQR, setSelectedQR] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState(window.location.origin);
  const [showUrlEdit, setShowUrlEdit] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const addClient = () => {
    if (!newName || !newId) { alert('업체명과 ID를 입력해주세요.'); return; }
    if (clients.find(c => c.id === newId)) { alert('이미 존재하는 ID입니다.'); return; }
    setClients(prev => [...prev, { id: newId, name: newName, email: newEmail, contactPerson: '', phone: '' }]);
    setNewName(''); setNewEmail(''); setNewId('');
  };

  const removeClient = (id: string) => {
    if (confirm('삭제하시겠습니까?')) setClients(prev => prev.filter(c => c.id !== id));
  };

  const getQRUrl = useCallback((clientId: string) => `${baseUrl}/?client=${clientId}`, [baseUrl]);

  const copyUrl = (clientId: string) => {
    navigator.clipboard.writeText(getQRUrl(clientId)).then(() => {
      setCopiedId(clientId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const downloadQR = useCallback(async (clientId: string, clientName: string) => {
    setDownloading(clientId);
    try {
      const url = getQRUrl(clientId);

      // Get the rendered SVG element via its DOM id
      const svgEl = document.getElementById(`qr-svg-${clientId}`) as SVGSVGElement | null;
      if (!svgEl) {
        alert('QR 코드를 찾을 수 없습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      // Clone & ensure explicit dimensions so img renders correctly
      const cloned = svgEl.cloneNode(true) as SVGSVGElement;
      cloned.setAttribute('width', '300');
      cloned.setAttribute('height', '300');
      cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const svgString = new XMLSerializer().serializeToString(cloned);
      // Use base64 data URI instead of blob URL — avoids canvas CORS taint
      const svgDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 500;
            canvas.height = 580;
            const ctx = canvas.getContext('2d')!;

            // White background
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, 500, 580);

            // Green header
            ctx.fillStyle = '#2D5A47';
            ctx.fillRect(0, 0, 500, 65);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('New Gene Science', 250, 38);
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.font = '13px Arial';
            ctx.fillText('전용 주문 QR 코드', 250, 57);

            // QR image centered
            ctx.drawImage(img, 100, 80, 300, 300);

            // Company name
            ctx.fillStyle = '#2D5A47';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(clientName, 250, 425);

            ctx.fillStyle = '#64748b';
            ctx.font = '13px Arial';
            ctx.fillText('QR 코드를 스캔하여 주문하세요', 250, 452);

            // Divider line
            ctx.strokeStyle = '#E2E8E4';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(60, 470);
            ctx.lineTo(440, 470);
            ctx.stroke();

            // URL text
            const displayUrl = url.replace(/^https?:\/\//, '');
            ctx.fillStyle = '#94a3b8';
            ctx.font = '9px Courier New';
            ctx.fillText(displayUrl.length > 65 ? displayUrl.slice(0, 62) + '...' : displayUrl, 250, 490);

            ctx.fillStyle = '#cbd5e1';
            ctx.font = '10px Arial';
            ctx.fillText('© 2026 (주)뉴진사이언스', 250, 562);

            // Trigger PNG download
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `NGS_QR_${clientName}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = (e) => reject(new Error('이미지 로드 실패: ' + String(e)));
        img.src = svgDataUri;
      });
    } catch (err) {
      console.error('QR download error:', err);
      alert('다운로드 오류:\n' + String(err));
    } finally {
      setDownloading(null);
    }
  }, [getQRUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F0F4F1] to-[#E8F0EA] pb-20">
      <header className="bg-white/80 backdrop-blur-xl border-b border-[#E2E8E4] sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-primary">QR코드 관리</p>
            <p className="text-[10px] text-slate-400">업체별 전용 QR 코드 생성 및 다운로드</p>
          </div>
          <button onClick={() => setShowUrlEdit(!showUrlEdit)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-600 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors">
            <Wifi className="w-3.5 h-3.5" /> 모바일 설정
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Network URL Setting Panel */}
        {showUrlEdit && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-3">
            <div>
              <p className="text-sm font-bold text-amber-800">📱 모바일 시연용 URL 설정</p>
              <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                휴대폰으로 QR 스캔 시 같은 WiFi의 PC IP 주소를 입력하세요.<br />
                현재 서버: <code className="bg-amber-100 px-1 rounded font-mono">http://192.168.45.128:3000</code>
              </p>
            </div>
            <div className="flex gap-2">
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-white border border-amber-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="http://192.168.45.128:3000" />
              <button onClick={() => { setBaseUrl('http://192.168.45.128:3000'); setShowUrlEdit(false); }}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 transition-all whitespace-nowrap">
                IP 적용
              </button>
            </div>
            <p className="text-[10px] text-amber-500">⚠ 모바일과 PC가 같은 WiFi에 연결되어 있어야 합니다</p>
          </motion.div>
        )}

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
          {clients.map((client, idx) => (
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

              {/* QR Code display — id is used for download */}
              <div className="flex justify-center py-4 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => setSelectedQR(client.id)}>
                <QRCodeSVG
                  id={`qr-svg-${client.id}`}
                  value={getQRUrl(client.id)}
                  size={140}
                  bgColor="#FFFFFF"
                  fgColor="#2D5A47"
                  level="M"
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button onClick={() => copyUrl(client.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all">
                  <Copy className="w-3 h-3" />
                  {copiedId === client.id ? '복사됨!' : 'URL 복사'}
                </button>
                <button onClick={() => downloadQR(client.id, client.name)}
                  disabled={downloading === client.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-dark transition-all disabled:opacity-60">
                  {downloading === client.id
                    ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />생성중...</>
                    : <><Download className="w-3 h-3" />PNG 다운로드</>
                  }
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Fullscreen QR Modal */}
      {selectedQR && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={() => setSelectedQR(null)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-3xl p-8 text-center space-y-4 max-w-xs w-full shadow-2xl">
            <p className="font-extrabold text-slate-800 text-lg">{clients.find(c => c.id === selectedQR)?.name}</p>
            <div className="flex justify-center p-4 bg-slate-50 rounded-2xl">
              <QRCodeSVG value={getQRUrl(selectedQR)} size={220} bgColor="#FFFFFF" fgColor="#2D5A47" level="M" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono break-all">{getQRUrl(selectedQR)}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => copyUrl(selectedQR)}
                className="py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all">
                <Copy className="w-4 h-4 inline mr-1" />URL 복사
              </button>
              <button
                onClick={() => { const c = clients.find(cl => cl.id === selectedQR); if (c) downloadQR(c.id, c.name); }}
                disabled={downloading === selectedQR}
                className="py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-all disabled:opacity-60">
                <Download className="w-4 h-4 inline mr-1" />다운로드
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
