import { useState, useEffect } from 'react';
import { cartKey } from '../utils/storage';
import { Link, useNavigate } from 'react-router';
import Navigation from '../components/Navigation';
import { Logger } from '../utils/logger';
import { getProductById } from '../utils/products';
import { Heart, ShoppingBag, Trash2, ArrowLeft } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.135/api';

interface WishItem {
  product_id: string;
  name: string;
  brand: string;
  price: number;
  image_url?: string;
  hex_code?: string;
  category: string;
  wished_at: string;
}

// localStorage 기반 찜 — 로그인 시 사용자별, 비로그인 시 공통 키
function wishlistKey(): string {
  const userId = localStorage.getItem('userId');
  if (userId && !userId.startsWith('anon_')) return `wishlist_${userId}`;
  return 'wishlist'; // 비로그인 공통 키
}
function getLocalWishlist(): WishItem[] {
  return JSON.parse(localStorage.getItem(wishlistKey()) || '[]');
}
function setLocalWishlist(items: WishItem[]) {
  localStorage.setItem(wishlistKey(), JSON.stringify(items));
}

export default function Wishlist() {
  const navigate = useNavigate();
  const [items, setItems] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWishlist();
    Logger.log('page_view', { page: 'wishlist' });
  }, []);

  // mockProducts의 imageUrl을 우선 사용 (DB/localStorage image_url 경로 불일치 해결)
  const enrichImageUrl = (item: WishItem): WishItem => {
    const localProduct = getProductById(item.product_id);
    return {
      ...item,
      image_url: localProduct?.imageUrl || item.image_url,
    };
  };

  const loadWishlist = async () => {
    setLoading(true);
    const localItems = getLocalWishlist();
    const userId = localStorage.getItem('userId');
    // partnerCustomerId(bigint) 우선 사용 → DB 조회 없이 직접 필터링
    // uid_xxx는 getPartnerCustomerId()로 변환되지만 추가 DB 쿼리 발생
    const partnerCustomerId = localStorage.getItem('partnerCustomerId');
    const apiId = partnerCustomerId || userId; // bigint 우선, 없으면 uid_xxx
    if (userId && !userId.startsWith('anon_') && apiId) {
      try {
        const res = await fetch(`${API_BASE}/wishlist/${apiId}`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const apiItems: WishItem[] = await res.json();
          // API 결과 + localStorage 병합 (중복 product_id 제거)
          // 서버는 product_id를 'prod_N' 포맷으로 반환 → localStorage와 타입 일치
          const apiIds = new Set(apiItems.map(a => String(a.product_id)));
          const localOnly = localItems.filter(local => {
            const localId = String((local as any).product_id || (local as any).id);
            return !apiIds.has(localId);
          });
          setItems([...apiItems, ...localOnly].map(enrichImageUrl));
          setLoading(false);
          return;
        }
      } catch {}
    }
    setItems(localItems.map(enrichImageUrl));
    setLoading(false);
  };

  const handleRemove = async (productId: string) => {
    const userId = localStorage.getItem('userId');
    const partnerCustomerId = localStorage.getItem('partnerCustomerId');
    const apiId = partnerCustomerId || userId; // bigint 우선
    if (userId && apiId) {
      try {
        await fetch(`${API_BASE}/wishlist/${apiId}/${productId}`, { method: 'DELETE' });
      } catch {}
    }
    // localStorage에서도 제거 (String 비교로 통일)
    const local = getLocalWishlist().filter(
      (i: any) => String(i.product_id || i.id) !== String(productId)
    );
    setLocalWishlist(local);
    setItems(prev => prev.filter(i => String(i.product_id) !== String(productId)));
    Logger.log('product_view', { productId, action: 'wishlist_remove' });
  };

  const handleAddToCart = (item: WishItem) => {
    if ((!localStorage.getItem('userId') || localStorage.getItem('userId')!.startsWith('anon_') )) {
      navigate('/auth', { state: { from: '/wishlist', message: '장바구니는 로그인 후 이용 가능합니다' } });
      return;
    }
    const cart = JSON.parse(localStorage.getItem(cartKey()) || '[]');
    const existing = cart.find((c: any) => c.product.id === item.product_id);
    if (!existing) {
      cart.push({
        product: { id: item.product_id, name: item.name, brand: item.brand, price: item.price, imageUrl: item.image_url, color: item.hex_code || '#ccc' },
        size: 'M',
        quantity: 1,
      });
      localStorage.setItem(cartKey(), JSON.stringify(cart));
    }
    Logger.log('add_to_cart', { productId: item.product_id });
    navigate('/cart');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">찜 목록</h1>
          {items.length > 0 && (
            <span className="ml-auto text-sm text-gray-500">{items.length}개</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Heart className="w-16 h-16 text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-500 mb-2">찜한 상품이 없습니다</h3>
            <p className="text-sm text-gray-400 mb-6">마음에 드는 상품에 ♥를 눌러보세요</p>
            <Link
              to="/shop"
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              쇼핑하러 가기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <div key={item.product_id} className="bg-white rounded-xl shadow-sm overflow-hidden group">
                <Link to={`/product/${item.product_id}`} className="block">
                  <div
                    className="h-40 flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: item.image_url ? '#f3f4f6' : (item.hex_code || '#e5e7eb') }}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = 'none';
                          (img.nextSibling as HTMLElement)?.style.setProperty('display', 'flex');
                        }}
                      />
                    ) : null}
                    <span
                      className="text-4xl opacity-30 items-center justify-center"
                      style={{ display: item.image_url ? 'none' : 'flex' }}
                    >👕</span>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-gray-400">{item.brand}</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                    <p className="text-sm font-bold text-blue-600 mt-1">{item.price?.toLocaleString()}원</p>
                  </div>
                </Link>
                <div className="flex gap-2 px-3 pb-3">
                  <button
                    onClick={() => handleAddToCart(item)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                  >
                    <ShoppingBag className="w-3 h-3" />
                    담기
                  </button>
                  <button
                    onClick={() => handleRemove(item.product_id)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Navigation />
    </div>
  );
}
