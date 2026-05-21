import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import Navigation from '../components/Navigation';
import { Logger } from '../utils/logger';
import { wardrobeKey, deletedWardrobeKey } from '../utils/storage';
import { getProductById, PRODUCT_COLORS } from '../utils/products';
import { ArrowLeft, Package, Shirt, CheckCircle2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.136:4000/api';

// 한국어 색상명 → 영문 매핑 (파트너 color_id 조회용)
const COLOR_NAME_MAP: Record<string, string> = {
  '화이트': 'WHITE', '블랙': 'BLACK', '네이비': 'NAVY', '차콜': 'CHARCOAL',
  '그레이': 'GRAY', '라이트그레이': 'LIGHT_GRAY', '베이지': 'BEIGE', '브라운': 'BROWN',
  '카키': 'KHAKI', '레드': 'RED', '버건디': 'BURGUNDY', '핑크': 'PINK',
  '블루': 'BLUE', '스카이블루': 'SKY_BLUE', '데님': 'DENIM', '그린': 'GREEN',
  '민트': 'MINT', '옐로우': 'YELLOW', '오렌지': 'ORANGE', '퍼플': 'PURPLE',
};

interface PurchaseItem {
  productId: string;
  productName: string;
  brand?: string;
  price: number;
  size: string;
  quantity: number;
  imageUrl?: string;
  color?: string;
  purchasedAt: string;
}

export default function PurchaseHistory() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<PurchaseItem[]>([]);
  const [wardrobeIds, setWardrobeIds] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set()); // 이번 세션에서 추가된 항목

  useEffect(() => {
    // 비로그인 리다이렉트
    const userId = localStorage.getItem('userId');
    if (!userId || userId.startsWith('anon_')) {
      navigate('/auth', { state: { from: '/purchases', message: '구매내역은 로그인 후 이용 가능합니다' } });
      return;
    }

    // 구매 내역 로드 (최신순)
    const stored: PurchaseItem[] = JSON.parse(localStorage.getItem('purchaseHistory') || '[]');
    setHistory(stored.slice().reverse());

    // 현재 옷장 ID 세트 구성
    const wardrobe: any[] = JSON.parse(localStorage.getItem(wardrobeKey()) || '[]');
    const ids = new Set<string>(wardrobe.map((w: any) => w.id || w.productId));
    setWardrobeIds(ids);

    Logger.log('page_view', { page: 'purchase_history' });
  }, [navigate]);

  const isInWardrobe = (productId: string) =>
    wardrobeIds.has(productId) || addedIds.has(productId);

  const handleAddToWardrobe = (item: PurchaseItem) => {
    const product = getProductById(item.productId);
    if (!product) return;

    const userId = localStorage.getItem('userId');
    const partnerCustomerId = localStorage.getItem('partnerCustomerId');
    const partnerColors: any[] = JSON.parse(localStorage.getItem('partnerColors') || '[]');

    // color_id 조회
    const colorHex = item.color || product.color;
    const matchedProductColor = Object.values(PRODUCT_COLORS as Record<string, { name: string; hex: string }>)
      .find(c => c.hex === colorHex);
    const koLabel = matchedProductColor?.name || '';
    const enName = COLOR_NAME_MAP[koLabel] || koLabel.toUpperCase();
    const partnerColor = partnerColors.find((c: any) => (c.name || '').toUpperCase() === enName);
    const colorId = partnerColor?.id ?? null;

    // localStorage 옷장에 추가
    const wardrobe: any[] = JSON.parse(localStorage.getItem(wardrobeKey()) || '[]');
    const alreadyExists = wardrobe.some((w: any) => w.id === item.productId || w.productId === item.productId);
    if (!alreadyExists) {
      wardrobe.push({
        ...product,
        id: item.productId,
        productId: item.productId,
        isOwned: true,
        color: colorHex,
        colorVariants: [{ hex: colorHex, name: koLabel }],
      });
      localStorage.setItem(wardrobeKey(), JSON.stringify(wardrobe));
    }

    // 삭제 목록에서도 제거
    const deleted: any[] = JSON.parse(localStorage.getItem(deletedWardrobeKey()) || '[]');
    const filteredDeleted = deleted.filter((d: any) => d.id !== item.productId && d.productId !== item.productId);
    localStorage.setItem(deletedWardrobeKey(), JSON.stringify(filteredDeleted));

    // 백엔드 wardrobe API 호출 (Fluentd WARDROBE 이벤트)
    const wardrobeId = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    fetch(`${API_BASE}/wardrobe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wardrobe_id: wardrobeId,
        customer_id: userId,
        category: (product.category || 'top').toUpperCase(),
        style: (product.style || 'casual').toUpperCase(),
        warmth: product.warmth,
        color: colorHex,
        color_id: colorId,
        partnerCustomerId: partnerCustomerId ? Number(partnerCustomerId) : null,
      }),
      signal: AbortSignal.timeout(3000),
      keepalive: true,
    }).catch(() => {});

    // 옷장에 추가됨 표시
    setAddedIds(prev => new Set([...prev, item.productId]));
    Logger.log('wardrobe_add', { productId: item.productId, source: 'purchase_history' });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">구매 내역</h1>
            <p className="text-sm text-gray-500 mt-0.5">총 {history.length}건</p>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-16 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium mb-1">구매 내역이 없어요</p>
            <p className="text-sm text-gray-400">쇼핑몰에서 첫 구매를 해보세요!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item, i) => {
              const inWardrobe = isInWardrobe(item.productId);
              const justAdded = addedIds.has(item.productId);
              return (
                <div
                  key={`${item.productId}_${item.purchasedAt}_${i}`}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden"
                >
                  <div className="flex gap-4 p-4">
                    {/* 썸네일 */}
                    <div
                      className="w-20 h-20 rounded-xl flex-shrink-0 overflow-hidden bg-gray-100"
                      style={{ backgroundColor: item.color || '#f3f4f6' }}
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">👕</div>
                      )}
                    </div>

                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      {item.brand && (
                        <p className="text-xs text-blue-600 font-medium mb-0.5">{item.brand}</p>
                      )}
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.productName}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        {item.size && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{item.size}</span>}
                        {item.quantity > 1 && <span>{item.quantity}개</span>}
                        <span>{new Date(item.purchasedAt).toLocaleDateString('ko-KR')}</span>
                      </div>
                      <p className="text-base font-bold text-gray-900 mt-1">
                        {item.price.toLocaleString()}원
                      </p>
                    </div>
                  </div>

                  {/* 옷장에 추가 버튼 */}
                  {!inWardrobe && (
                    <div className="px-4 pb-4">
                      <button
                        onClick={() => handleAddToWardrobe(item)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors"
                      >
                        <Shirt className="w-4 h-4" />
                        옷장에 추가
                      </button>
                    </div>
                  )}
                  {justAdded && (
                    <div className="px-4 pb-4">
                      <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-50 text-green-600 text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        옷장에 추가됨
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Navigation />
    </div>
  );
}
