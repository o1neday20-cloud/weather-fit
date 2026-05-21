import { useEffect, useRef, useState, useCallback } from 'react';
import Navigation from '../components/Navigation';
import ClothingItem from '../components/ClothingItem';
import { ClothingItem as ClothingItemType } from '../utils/aiModel';
import { Logger } from '../utils/logger';
import { wardrobeKey, deletedWardrobeKey } from '../utils/storage';

// 사람들이 많이 입는 옷 색상 20가지
const PRESET_COLORS = [
  { hex: '#FFFFFF', label: '화이트' },
  { hex: '#1A1A1A', label: '블랙' },
  { hex: '#1B2A4A', label: '네이비' },
  { hex: '#3D3D3D', label: '차콜' },
  { hex: '#8C8C8C', label: '그레이' },
  { hex: '#D4D4D4', label: '라이트그레이' },
  { hex: '#D4B896', label: '베이지' },
  { hex: '#7B4F2E', label: '브라운' },
  { hex: '#7A7A52', label: '카키' },
  { hex: '#D63031', label: '레드' },
  { hex: '#7D1935', label: '버건디' },
  { hex: '#E8A0BF', label: '핑크' },
  { hex: '#2980B9', label: '블루' },
  { hex: '#74B9FF', label: '스카이블루' },
  { hex: '#5B7FA6', label: '데님' },
  { hex: '#27AE60', label: '그린' },
  { hex: '#00B894', label: '민트' },
  { hex: '#F6C90E', label: '옐로우' },
  { hex: '#E17055', label: '오렌지' },
  { hex: '#6C5CE7', label: '퍼플' },
];
import { Plus, Shirt, Upload, X, Camera, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface DeletedItem extends ClothingItemType {
  deletedAt: string;
  imageUrl?: string; // 쇼핑 상품에서 추가된 아이템은 imageUrl 필드 사용
}

export default function Wardrobe() {
  const [wardrobe, setWardrobe] = useState<ClothingItemType[]>([]);
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ClothingItemType | null>(null);

  useEffect(() => {
    loadWardrobe();
    Logger.log('page_view', { page: 'wardrobe' });
  }, []);

  const loadWardrobe = () => {
    const wardrobeString = localStorage.getItem(wardrobeKey());
    if (wardrobeString) {
      const wardrobeData = JSON.parse(wardrobeString);
      // 기존 샘플 데이터 ID(w1~w12) 제거 — 직접 등록한 옷만 남김
      const SAMPLE_IDS = new Set(['w1','w2','w3','w4','w5','w6','w7','w8','w9','w10','w11','w12']);
      const userItems = wardrobeData
        .filter((item: ClothingItemType) => !SAMPLE_IDS.has(item.id))
        .map((item: ClothingItemType) => ({ ...item, style: item.style || 'casual' }));
      setWardrobe(userItems);
      localStorage.setItem(wardrobeKey(), JSON.stringify(userItems));
    } else {
      setWardrobe([]);
      localStorage.setItem(wardrobeKey(), JSON.stringify([]));
    }
    // 삭제된 아이템 로드
    const deletedStr = localStorage.getItem(deletedWardrobeKey());
    setDeletedItems(deletedStr ? JSON.parse(deletedStr) : []);
  };

  const handleDelete = (id: string) => {
    const item = wardrobe.find(i => i.id === id);
    if (!item) return;

    // 소프트 삭제: 삭제 목록에 보관 (image + imageUrl 모두 보존)
    const deletedItem: DeletedItem = {
      ...item,
      image: item.image || (item as any).imageUrl,
      imageUrl: (item as any).imageUrl || item.image,
      deletedAt: new Date().toISOString(),
    };
    const updatedDeleted = [deletedItem, ...deletedItems].slice(0, 30); // 최대 30개 보관
    setDeletedItems(updatedDeleted);
    localStorage.setItem(deletedWardrobeKey(), JSON.stringify(updatedDeleted));

    // 옷장에서 제거
    const updated = wardrobe.filter(i => i.id !== id);
    setWardrobe(updated);
    localStorage.setItem(wardrobeKey(), JSON.stringify(updated));
    Logger.log('item_deleted', { itemId: id });

    // 백엔드 삭제 API 호출
    const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.136:4000/api';
    const partnerCustomerId = localStorage.getItem('partnerCustomerId');
    const qp = partnerCustomerId ? `?partnerCustomerId=${partnerCustomerId}` : '';
    fetch(`${API_BASE}/wardrobe/${id}${qp}`, { method: 'DELETE', signal: AbortSignal.timeout(3000) }).catch(() => {});
  };

  const handleRestore = (deletedItem: DeletedItem) => {
    // 옷장으로 복구
    const restored: ClothingItemType = { ...deletedItem };
    delete (restored as any).deletedAt;
    const updatedWardrobe = [...wardrobe, restored];
    setWardrobe(updatedWardrobe);
    localStorage.setItem(wardrobeKey(), JSON.stringify(updatedWardrobe));

    // 삭제 목록에서 제거
    const updatedDeleted = deletedItems.filter(i => i.id !== deletedItem.id);
    setDeletedItems(updatedDeleted);
    localStorage.setItem(deletedWardrobeKey(), JSON.stringify(updatedDeleted));
    Logger.log('item_restored', { itemId: deletedItem.id });
  };

  const handlePermanentDelete = (id: string) => {
    const updatedDeleted = deletedItems.filter(i => i.id !== id);
    setDeletedItems(updatedDeleted);
    localStorage.setItem(deletedWardrobeKey(), JSON.stringify(updatedDeleted));
  };

  const handleEdit = (item: ClothingItemType) => {
    setEditingItem(item);
  };

  const handleUpdate = (updatedItem: ClothingItemType) => {
    const updated = wardrobe.map(item => item.id === updatedItem.id ? updatedItem : item);
    setWardrobe(updated);
    localStorage.setItem(wardrobeKey(), JSON.stringify(updated));
    setEditingItem(null);
    Logger.log('item_updated', { itemId: updatedItem.id });
  };

  const handleAdd = (newItem: Omit<ClothingItemType, 'id'>) => {
    const item: ClothingItemType = {
      ...newItem,
      id: Date.now().toString(),
    };
    const updated = [...wardrobe, item];
    setWardrobe(updated);
    localStorage.setItem(wardrobeKey(), JSON.stringify(updated));
    Logger.log('item_added', { itemName: item.name, category: item.category });
    setShowAddModal(false);

    // 백엔드 동기화 (실패해도 localStorage는 이미 저장됨)
    const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.136:4000/api';
    const partnerCustomerId = localStorage.getItem('partnerCustomerId');

    // partnerColors에서 선택한 색상의 color_id 조회
    const COLOR_NAME_MAP: Record<string, string> = {
      '화이트': 'WHITE', '블랙': 'BLACK', '네이비': 'NAVY', '차콜': 'CHARCOAL',
      '그레이': 'GRAY', '라이트그레이': 'LIGHT_GRAY', '베이지': 'BEIGE', '브라운': 'BROWN',
      '카키': 'KHAKI', '레드': 'RED', '버건디': 'BURGUNDY', '핑크': 'PINK',
      '블루': 'BLUE', '스카이블루': 'SKY_BLUE', '데님': 'DENIM', '그린': 'GREEN',
      '민트': 'MINT', '옐로우': 'YELLOW', '오렌지': 'ORANGE', '퍼플': 'PURPLE',
    };
    const partnerColors: any[] = JSON.parse(localStorage.getItem('partnerColors') || '[]');
    const koLabel = PRESET_COLORS.find(c => c.hex === item.color)?.label || '';
    const enName = COLOR_NAME_MAP[koLabel] || koLabel.toUpperCase();
    const matchedColor = partnerColors.find(
      (c: any) => (c.name || '').toUpperCase() === enName
    );
    const colorId = matchedColor?.id ?? null;

    fetch(`${API_BASE}/wardrobe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: item.id,
        customer_id: localStorage.getItem('userId'),
        category: item.category,
        style: item.style,
        warmth: item.warmth,
        color_id: colorId,
        partnerCustomerId: partnerCustomerId ? Number(partnerCustomerId) : null,
      }),
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">내 옷장</h1>
            <p className="text-sm text-gray-600 mt-1">총 {wardrobe.length}개의 옷</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            추가
          </button>
        </div>

        {/* 옷 목록 */}
        {wardrobe.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {wardrobe.map((item) => (
              <ClothingItem 
                key={item.id} 
                item={item}
                onDelete={handleDelete}
                onEdit={item.isOwned ? handleEdit : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <Shirt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">아직 등록된 옷이 없습니다</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              첫 번째 옷 추가하기
            </button>
          </div>
        )}

        {/* 휴지통 (삭제된 옷 복구) */}
        {deletedItems.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowTrash(v => !v)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
            >
              <Trash2 className="w-4 h-4" />
              삭제된 옷 ({deletedItems.length}개)
              {showTrash ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showTrash && (
              <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-4">
                <p className="text-xs text-gray-400 mb-3">삭제된 옷은 여기서 복구할 수 있어요. 최대 30개 보관됩니다.</p>
                <div className="space-y-2">
                  {deletedItems.map(item => (
                    <div key={item.id + item.deletedAt} className="bg-white rounded-lg p-3 flex items-center gap-3 shadow-sm">
                      <div
                        className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden"
                        style={{ backgroundColor: item.color || '#e5e7eb' }}
                      >
                        {(item.image || item.imageUrl) ? (
                          <img
                            src={item.image || item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl opacity-40">👕</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400">
                          {item.category} · {new Date(item.deletedAt).toLocaleDateString('ko-KR')} 삭제
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRestore(item)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 text-xs rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          복구
                        </button>
                        <button
                          onClick={() => handlePermanentDelete(item.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-500 text-xs rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <X className="w-3 h-3" />
                          영구삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 추가 모달 */}
      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAdd}
        />
      )}

      {/* 수정 모달 */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onUpdate={handleUpdate}
        />
      )}

      <Navigation />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 컬러 휠 컴포넌트
// ─────────────────────────────────────────────────────────
function ColorWheel({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const wheelRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const [brightness, setBrightness] = useState(1); // 0 ~ 1
  const draggingWheel = useRef(false);
  const draggingStrip = useRef(false);
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 }); // 0~1 normalized

  // hex → hsl 변환
  const hexToHsl = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s, l };
  };

  // hsl → hex
  const hslToHex = (h: number, s: number, l: number) => {
    const hk = h / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const toRgb = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const r = Math.round(toRgb(hk + 1 / 3) * 255);
    const g = Math.round(toRgb(hk) * 255);
    const b = Math.round(toRgb(hk - 1 / 3) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // 휠 그리기
  const drawWheel = useCallback(() => {
    const canvas = wheelRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, cx = W / 2, cy = W / 2, r = W / 2;
    ctx.clearRect(0, 0, W, W);
    for (let angle = 0; angle < 360; angle++) {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `hsla(${angle},0%,${brightness * 50 + 50}%,1)`);
      grad.addColorStop(1, `hsla(${angle},100%,${brightness * 50}%,1)`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, (angle - 1) * Math.PI / 180, (angle + 1) * Math.PI / 180);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    // 커서 그리기
    const px = cursor.x * W, py = cursor.y * W;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [brightness, cursor]);

  // 밝기 스트립 그리기
  const drawStrip = useCallback(() => {
    const canvas = stripRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.5, '#888');
    grad.addColorStop(1, '#000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // 커서
    const py = (1 - brightness) * H;
    ctx.beginPath();
    ctx.arc(W / 2, py, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [brightness]);

  useEffect(() => { drawWheel(); }, [drawWheel]);
  useEffect(() => { drawStrip(); }, [drawStrip]);

  // 휠에서 좌표 → 색상 추출
  const pickFromWheel = useCallback((clientX: number, clientY: number) => {
    const canvas = wheelRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = canvas.width;
    const scale = W / rect.width;
    const x = (clientX - rect.left) * scale;
    const y = (clientY - rect.top) * scale;
    const cx = W / 2, cy = W / 2, r = W / 2;
    const dx = x - cx, dy = y - cy;
    if (Math.sqrt(dx * dx + dy * dy) > r) return;
    setCursor({ x: x / W, y: y / W });
    const ctx = canvas.getContext('2d')!;
    const p = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    onChange(`#${p[0].toString(16).padStart(2,'0')}${p[1].toString(16).padStart(2,'0')}${p[2].toString(16).padStart(2,'0')}`);
  }, [onChange]);

  // 스트립에서 밝기 추출
  const pickFromStrip = useCallback((clientY: number) => {
    const canvas = stripRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setBrightness(1 - ratio);
  }, []);

  // 초기 커서 위치 설정 (hex → hsl)
  useEffect(() => {
    try {
      const { h, s } = hexToHsl(color);
      const rad = (h * Math.PI) / 180;
      const r = s;
      setCursor({ x: 0.5 + r * Math.cos(rad) * 0.5, y: 0.5 + r * Math.sin(rad) * 0.5 });
    } catch {}
  }, []);

  return (
    <div className="flex gap-3 items-start justify-center">
      {/* 원형 컬러 휠 */}
      <canvas
        ref={wheelRef} width={200} height={200}
        className="rounded-full cursor-crosshair"
        style={{ width: 200, height: 200 }}
        onMouseDown={(e) => { draggingWheel.current = true; pickFromWheel(e.clientX, e.clientY); }}
        onMouseMove={(e) => { if (draggingWheel.current) pickFromWheel(e.clientX, e.clientY); }}
        onMouseUp={() => { draggingWheel.current = false; }}
        onMouseLeave={() => { draggingWheel.current = false; }}
        onTouchStart={(e) => { e.preventDefault(); pickFromWheel(e.touches[0].clientX, e.touches[0].clientY); }}
        onTouchMove={(e) => { e.preventDefault(); pickFromWheel(e.touches[0].clientX, e.touches[0].clientY); }}
      />
      {/* 밝기 스트립 */}
      <canvas
        ref={stripRef} width={24} height={200}
        className="rounded-full cursor-ns-resize"
        style={{ width: 24, height: 200 }}
        onMouseDown={(e) => { draggingStrip.current = true; pickFromStrip(e.clientY); }}
        onMouseMove={(e) => { if (draggingStrip.current) pickFromStrip(e.clientY); }}
        onMouseUp={() => { draggingStrip.current = false; }}
        onMouseLeave={() => { draggingStrip.current = false; }}
        onTouchStart={(e) => { e.preventDefault(); pickFromStrip(e.touches[0].clientY); }}
        onTouchMove={(e) => { e.preventDefault(); pickFromStrip(e.touches[0].clientY); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// AddItemModal — 컬러 휠 + 이미지 업로드 포함
// ─────────────────────────────────────────────────────────
interface AddItemModalProps {
  onClose: () => void;
  onAdd: (item: Omit<ClothingItemType, 'id'>) => void;
}

function AddItemModal({ onClose, onAdd }: AddItemModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'top' as ClothingItemType['category'],
    warmth: 3,
    color: '#8C8C8C',
    style: 'casual' as ClothingItemType['style'],
  });
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');   // 서버에 저장된 실제 경로
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.136:4000/api';
  const SERVER_ORIGIN = API_BASE.replace(/\/api$/, '');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setImagePreview(base64);
      setUploading(true);
      try {
        const form = new FormData();
        form.append('image', file);
        const res = await fetch(`${API_BASE}/upload/wardrobe`, { method: 'POST', body: form });
        if (res.ok) {
          const data = await res.json();
          const url: string = data.imageUrl;
          setImageUrl(url.startsWith('http') ? url : `${SERVER_ORIGIN}${url}`);
        }
      } catch {
        // 업로드 실패 시 base64 미리보기로 저장됨
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      ...formData,
      isOwned: true,
      // 서버 URL 우선, 실패 시 base64 미리보기로 fallback
      image: imageUrl || imagePreview || undefined,
    });
  };

  const warmthLabels = ['매우 얇음', '얇음', '보통', '두꺼움', '매우 두꺼움'];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">새 옷 추가</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* 이미지 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">옷 사진</label>
            <div
              className="relative w-full h-40 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
              style={{ backgroundColor: imagePreview ? 'transparent' : formData.color + '33' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="미리보기" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-2 right-2 p-1 bg-black/40 rounded-full hover:bg-black/60"
                    onClick={(e) => { e.stopPropagation(); setImagePreview(''); }}
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  {uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                  <Upload className="w-8 h-8" />
                  <span className="text-sm">클릭해서 사진 선택</span>
                  <span className="text-xs">JPG, PNG, WEBP</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* 이름 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="예: 흰색 티셔츠"
              required
            />
          </div>

          {/* 카테고리 + 스타일 나란히 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="top">상의</option>
                <option value="bottom">하의</option>
                <option value="outer">외투</option>
                <option value="accessory">악세서리</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">스타일</label>
              <select
                value={formData.style}
                onChange={(e) => setFormData({ ...formData, style: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="casual">캐주얼</option>
                <option value="formal">포멀</option>
                <option value="sporty">스포티</option>
                <option value="street">스트릿</option>
                <option value="minimal">미니멀</option>
              </select>
            </div>
          </div>

          {/* 보온성 슬라이더 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              보온성 — <span className="text-blue-600">{warmthLabels[formData.warmth - 1]}</span>
            </label>
            <input
              type="range" min="1" max="5"
              value={formData.warmth}
              onChange={(e) => setFormData({ ...formData, warmth: parseInt(e.target.value) })}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>얇음</span><span>두꺼움</span>
            </div>
          </div>

          {/* 색상 팔레트 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">색상</label>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: formData.color }} />
                <span className="text-xs text-gray-500">
                  {PRESET_COLORS.find(c => c.hex === formData.color)?.label ?? ''}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map(({ hex, label }) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: hex })}
                  title={label}
                  className={`relative flex flex-col items-center gap-1 p-1 rounded-xl transition-all ${
                    formData.color === hex ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:scale-105'
                  }`}
                >
                  <div
                    className="w-10 h-10 rounded-full border border-gray-200 shadow-sm"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="text-[9px] text-gray-500 leading-none text-center w-full truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || uploading}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {uploading ? '사진 저장 중...' : '추가하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// EditItemModal — 직접 등록한 옷 수정
// ────────────────────────────────────────────────────────────────
interface EditItemModalProps {
  item: ClothingItemType;
  onClose: () => void;
  onUpdate: (item: ClothingItemType) => void;
}

function EditItemModal({ item, onClose, onUpdate }: EditItemModalProps) {
  const [formData, setFormData] = useState({
    name:     item.name,
    category: item.category as 'outer' | 'top' | 'bottom' | 'accessory',
    style:    item.style    as 'casual' | 'formal' | 'sporty' | 'street' | 'minimal',
    color:    item.color,
    warmth:   item.warmth,
  });
  const [imagePreview, setImagePreview] = useState<string>(item.image || '');
  const [imageUrl,     setImageUrl]     = useState<string>(item.image || '');
  const [uploading,    setUploading]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.136:4000/api';
  const SERVER_ORIGIN = API_BASE.replace(/\/api$/, '');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setImagePreview(base64);
      setUploading(true);
      try {
        const form = new FormData();
        form.append('image', file);
        const res = await fetch(`${API_BASE}/upload/wardrobe`, { method: 'POST', body: form });
        if (res.ok) {
          const data = await res.json();
          const url: string = data.imageUrl;
          setImageUrl(url.startsWith('http') ? url : `${SERVER_ORIGIN}${url}`);
        }
      } catch {
        // 업로드 실패 시 base64 미리보기로 저장됨
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    onUpdate({
      ...item,
      ...formData,
      image: imageUrl || imagePreview || item.image,
    });
  };

  const warmthLabels = ['매우 얇음', '얇음', '보통', '두꺼움', '매우 두꺼움'];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">옷 정보 수정</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* 이미지 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">옷 사진</label>
            <div
              className="relative w-full h-40 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors"
              style={{ backgroundColor: imagePreview ? 'transparent' : formData.color + '33' }}
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="미리보기" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-2 right-2 p-1 bg-black/40 rounded-full hover:bg-black/60"
                    onClick={(e) => { e.stopPropagation(); setImagePreview(''); }}
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  {uploading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                  <Camera className="w-8 h-8" />
                  <span className="text-sm">클릭해서 사진 변경</span>
                  <span className="text-xs">JPG, PNG, WEBP</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* 이름 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="예: 흰색 티셔츠"
              required
            />
          </div>

          {/* 카테고리 + 스타일 나란히 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="top">상의</option>
                <option value="bottom">하의</option>
                <option value="outer">외투</option>
                <option value="accessory">악세서리</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">스타일</label>
              <select
                value={formData.style}
                onChange={(e) => setFormData({ ...formData, style: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="casual">캐주얼</option>
                <option value="formal">포멀</option>
                <option value="sporty">스포티</option>
                <option value="street">스트릿</option>
                <option value="minimal">미니멀</option>
              </select>
            </div>
          </div>

          {/* 보온성 슬라이더 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              보온성 — <span className="text-blue-600">{warmthLabels[formData.warmth - 1]}</span>
            </label>
            <input
              type="range" min="1" max="5"
              value={formData.warmth}
              onChange={(e) => setFormData({ ...formData, warmth: parseInt(e.target.value) })}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>얇음</span><span>두꺼움</span>
            </div>
          </div>

          {/* 색상 팔레트 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">색상</label>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: formData.color }} />
                <span className="text-xs text-gray-500">
                  {PRESET_COLORS.find(c => c.hex === formData.color)?.label ?? ''}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map(({ hex, label }) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: hex })}
                  title={label}
                  className={`relative flex flex-col items-center gap-1 p-1 rounded-xl transition-all ${
                    formData.color === hex ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:scale-105'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: hex }} />
                  <span className="text-[9px] text-gray-500 leading-none text-center w-full truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || uploading}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {uploading ? '사진 저장 중...' : '수정 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
