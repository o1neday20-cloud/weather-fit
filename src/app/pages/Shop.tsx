import { useState, useEffect, useRef } from 'react';
import { cartKey } from '../utils/storage';
import { Link, useNavigate } from 'react-router';
import Navigation from '../components/Navigation';
import { mockProducts, Product } from '../utils/products';
import { Logger } from '../utils/logger';
import { ShoppingBag, Search, X, CheckCircle, Heart } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.136:4000/api';
function wishlistKey(): string {
  const userId = localStorage.getItem('userId');
  if (userId && !userId.startsWith('anon_')) return `wishlist_${userId}`;
  return 'wishlist';
}

// ─────────────────────────────────────────
// 장바구니 추가 확인 중앙 모달 컴포넌트
// ─────────────────────────────────────────
function CartSuccessModal({
  product,
  onClose,
  onGoCart,
}: {
  product: Product | null;
  onClose: () => void;
  onGoCart: () => void;
}) {
  if (!product) return null;

  return (
    // 배경 오버레이
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      {/* 모달 카드 */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 이미지/색상 영역 */}
        <div
          className="h-36 flex items-center justify-center relative"
          style={{
            backgroundColor: product.imageUrl ? '#f3f4f6' : product.color,
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-5xl opacity-40">👕</span>
          )}
          {/* 성공 뱃지 */}
          <div className="absolute bottom-0 translate-y-1/2 bg-white rounded-full p-1 shadow-md">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>

        {/* 내용 */}
        <div className="pt-8 pb-6 px-6 text-center">
          <h2 className="text-lg font-bold text-gray-900 mb-1">장바구니에 담겼어요!</h2>
          <p className="text-sm text-gray-500 mb-6 line-clamp-1">{product.name}</p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              계속 쇼핑
            </button>
            <button
              onClick={onGoCart}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              장바구니 보기
            </button>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full bg-black/20 hover:bg-black/40 text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function Shop() {
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [category, setCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());

  const navigate = useNavigate();
  const maxScrollDepthRef = useRef(0);

  // 스크롤 깊이 추적 → 페이지 이탈 시 Fluentd SCROLL 이벤트 전송
  useEffect(() => {
    maxScrollDepthRef.current = 0;
    const handleScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const depth = Math.round((window.scrollY / scrollable) * 100);
      if (depth > maxScrollDepthRef.current) maxScrollDepthRef.current = depth;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      const partnerCid = localStorage.getItem('partnerCustomerId');
      if (maxScrollDepthRef.current > 0) {
        try {
          fetch('http://210.104.76.135:9880/weatherfit.log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: 'SCROLL',
              customer_id: partnerCid ? Number(partnerCid) : null,
              page_url: window.location.href,
              scroll_depth: maxScrollDepthRef.current,
            }),
            keepalive: true,
          }).catch(() => {});
        } catch { /* 무시 */ }
      }
    };
  }, []);

  useEffect(() => {
    Logger.log('page_view', { page: 'shop' });
    const stored: any[] = JSON.parse(localStorage.getItem(wishlistKey()) || '[]');
    setWishlist(new Set(stored.map((i: any) => i.product_id || i.id)));
  }, []);

  const handleToggleWishlist = async (product: Product, e: React.MouseEvent) => {
    e.preventDefault();
    const userId = localStorage.getItem('userId');
    const isWished = wishlist.has(product.id);
    const next = new Set(wishlist);
    if (isWished) {
      next.delete(product.id);
      setWishlist(next);
      const stored: any[] = JSON.parse(localStorage.getItem(wishlistKey()) || '[]');
      localStorage.setItem(wishlistKey(), JSON.stringify(stored.filter((i: any) => (i.product_id||i.id) !== product.id)));
      if (userId) fetch(`${API_BASE}/wishlist/${userId}/${product.id}`, { method: 'DELETE' }).catch(() => {});
    } else {
      next.add(product.id);
      setWishlist(next);
      const stored: any[] = JSON.parse(localStorage.getItem(wishlistKey()) || '[]');
      stored.push({ product_id: product.id, name: product.name, brand: product.brand, price: product.price, image_url: product.imageUrl, hex_code: product.color });
      localStorage.setItem(wishlistKey(), JSON.stringify(stored));
      if (userId) {
        const partnerCid = localStorage.getItem('partnerCustomerId');
        fetch(`${API_BASE}/wishlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: userId,
            product_id: product.id,
            partnerCustomerId: partnerCid ? Number(partnerCid) : null,
          }),
        }).catch(() => {});
      }
      Logger.log('product_view', { productId: product.id, action: 'wishlist_add' });
    }
  };

  useEffect(() => {
    let filtered = mockProducts;
    if (category !== 'all') filtered = filtered.filter(p => p.category === category);
    if (searchQuery)
      filtered = filtered.filter(
        p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.brand.toLowerCase().includes(searchQuery.toLowerCase())
      );
    setProducts(filtered);
  }, [category, searchQuery]);

  const categories = [
    { id: 'all', label: '전체' },
    { id: 'outer', label: '아우터' },
    { id: 'top', label: '상의' },
    { id: 'bottom', label: '하의' },
  ];

  const handleAddToCart = (product: Product) => {
    if ((!localStorage.getItem('userId') || localStorage.getItem('userId')!.startsWith('anon_') )) {
      navigate('/auth', { state: { from: '/shop', message: '장바구니는 로그인 후 이용 가능합니다' } });
      return;
    }
    const cart = JSON.parse(localStorage.getItem(cartKey()) || '[]');
    const existingItem = cart.find((item: any) => item.product.id === product.id);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({ product, size: product.sizes[0], quantity: 1 });
    }
    localStorage.setItem(cartKey(), JSON.stringify(cart));
    window.dispatchEvent(new Event('storage'));
    Logger.log('add_to_cart', { productId: product.id, productName: product.name });

    // 백엔드 장바구니 API 호출 (실패해도 localStorage는 이미 저장됨)
    try {
      const partnerCustomerId = localStorage.getItem('partnerCustomerId');
      const numericProductId = parseInt(String(product.id).replace(/[^0-9]/g, ''), 10) || null;
      fetch(`${API_BASE}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: localStorage.getItem('userId'),
          partnerCustomerId: partnerCustomerId ? Number(partnerCustomerId) : null,
          product_id: numericProductId,
          status: 'cart',
          price: product.price,
          size: product.sizes[0],
        }),
        signal: AbortSignal.timeout(3000),
        keepalive: true,
      }).catch(() => {});
    } catch { /* 무시 */ }

    // GA4 이벤트 전송 (추적 스크립트 연동)
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'add_to_cart', {
        currency: 'KRW',
        value: product.price,
        items: [{ item_id: product.id, item_name: product.name, price: product.price }],
      });
    }
    // 페이스북 픽셀 이벤트 전송
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'AddToCart', {
        content_ids: [product.id],
        content_name: product.name,
        value: product.price,
        currency: 'KRW',
      });
    }

    setModalProduct(product);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 장바구니 추가 모달 */}
      <CartSuccessModal
        product={modalProduct}
        onClose={() => setModalProduct(null)}
        onGoCart={() => {
          setModalProduct(null);
          window.location.href = '/cart';
        }}
      />

      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">쇼핑</h1>
            <p className="text-sm text-gray-600 mt-1">날씨에 맞는 옷을 구매하세요</p>
          </div>
          <Link
            to="/cart"
            className="relative p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ShoppingBag className="w-6 h-6" />
            <CartBadge />
          </Link>
        </div>

        {/* 검색 */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="상품명 또는 브랜드 검색"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* 카테고리 필터 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                category === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* 상품 목록 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={handleAddToCart} onToggleWishlist={handleToggleWishlist} isWished={wishlist.has(product.id)} />
          ))}
        </div>

        {products.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">검색 결과가 없습니다</p>
          </div>
        )}
      </div>

      <Navigation />
    </div>
  );
}

function ProductCard({
  product,
  onAddToCart,
  onToggleWishlist,
  isWished,
}: {
  product: Product;
  onAddToCart: (p: Product) => void;
  onToggleWishlist: (p: Product, e: React.MouseEvent) => void;
  isWished: boolean;
}) {
  return (
    <Link to={`/product/${product.id}`} className="block">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        {/* 상품 이미지 */}
        <div
          className="h-48 flex items-center justify-center overflow-hidden relative"
          style={{ backgroundColor: product.imageUrl ? '#f3f4f6' : product.color }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <span className="text-4xl opacity-50">👕</span>
          )}
          {/* 찜 버튼 */}
          <button
            onClick={(e) => onToggleWishlist(product, e)}
            className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:bg-white transition-colors"
          >
            <Heart className={`w-4 h-4 transition-colors ${isWished ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
          </button>
        </div>

        <div className="p-4">
          <div className="text-xs text-gray-500 mb-1">{product.brand}</div>
          <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{product.name}</h3>

          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={`w-3 h-3 rounded-sm ${
                  level <= product.warmth ? 'bg-orange-400' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-gray-900">
              {product.price.toLocaleString()}원
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                onAddToCart(product);
              }}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CartBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const cart = JSON.parse(localStorage.getItem(cartKey()) || '[]');
      const total = cart.reduce((sum: number, item: any) => sum + item.quantity, 0);
      setCount(total);
    };
    updateCount();
    window.addEventListener('storage', updateCount);
    return () => window.removeEventListener('storage', updateCount);
  }, []);

  if (count === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
      {count}
    </span>
  );
}
