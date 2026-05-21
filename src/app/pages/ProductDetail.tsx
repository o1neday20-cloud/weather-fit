import { useState, useEffect } from 'react';
import { cartKey } from '../utils/storage';
function wishlistKey(): string {
  const userId = localStorage.getItem('userId');
  if (userId && !userId.startsWith('anon_')) return `wishlist_${userId}`;
  return 'wishlist';
}
import { useParams, useNavigate } from 'react-router';
import { getProductById, Product } from '../utils/products';
import { Logger } from '../utils/logger';
import { ShoppingBag, ArrowLeft, Heart, X, CheckCircle } from 'lucide-react';

// ─────────────────────────────────────────
// 장바구니 추가 확인 중앙 모달
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-36 flex items-center justify-center"
          style={{ backgroundColor: product.imageUrl ? '#f3f4f6' : product.color }}
        >
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-5xl opacity-40">👕</span>
          )}
          <div className="absolute top-28 bg-white rounded-full p-1 shadow-md">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>

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

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<{ name: string; hex: string } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [loginToast, setLoginToast] = useState(false);
  const [isWished, setIsWished] = useState(false);

  const requireLogin = (action = '이 기능을') => {
    setLoginToast(true);
    setTimeout(() => setLoginToast(false), 2500);
  };

  // 찜 토글
  const handleToggleWishlist = () => {
    if (!product) return;
    const stored: any[] = JSON.parse(localStorage.getItem(wishlistKey()) || '[]');
    if (isWished) {
      const next = stored.filter((i: any) => (i.product_id || i.id) !== product.id);
      localStorage.setItem(wishlistKey(), JSON.stringify(next));
      setIsWished(false);
    } else {
      stored.push({
        product_id: product.id, name: product.name, brand: product.brand,
        price: product.price, image_url: product.imageUrl, hex_code: product.color,
      });
      localStorage.setItem(wishlistKey(), JSON.stringify(stored));
      setIsWished(true);
    }
    Logger.log('product_view', { productId: product.id, action: isWished ? 'wishlist_remove' : 'wishlist_add' });
  };

  useEffect(() => {
    const enterTime = Date.now();
    if (!id) return;

    const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.136:4000/api';
    const local = getProductById(id);

    // 상품 초기화 공통 처리
    const initProduct = (p: Product) => {
      setProduct(p);
      setSelectedSize(p.sizes[0]);
      setSelectedColor(p.colors?.[0] || { name: '', hex: p.color });
      const stored: any[] = JSON.parse(localStorage.getItem(wishlistKey()) || '[]');
      setIsWished(stored.some((i: any) => (i.product_id || i.id) === p.id));
      Logger.log('product_view', { productId: id, productName: p.name });
      if ((window as any).gtag) {
        (window as any).gtag('event', 'view_item', {
          currency: 'KRW', value: p.price,
          items: [{ item_id: p.id, item_name: p.name, price: p.price }],
        });
      }
      if ((window as any).fbq) {
        (window as any).fbq('track', 'ViewContent', {
          content_ids: [p.id], content_name: p.name, value: p.price, currency: 'KRW',
        });
      }
    };

    // 백엔드 호출 → VIEW 이벤트 Fluentd 전송 + 상품 데이터 사용
    // 실패 시 로컬 데이터로 폴백
    const partnerCid = localStorage.getItem('partnerCustomerId');
    const viewQs = partnerCid ? `?partnerCustomerId=${partnerCid}` : '';
    fetch(`${API_BASE}/products/${id}${viewQs}`)
      .then(res => { if (!res.ok) throw new Error('not ok'); return res.json(); })
      .then(data => {
        const merged: Product = {
          id: data.product_id,
          name: data.name,
          brand: data.brand,
          category: data.category,
          warmth: data.warmth,
          color: data.hex_code || local?.color || '#888888',
          style: local?.style || 'casual',
          price: Number(data.price),
          description: local?.description || '',
          sizes: local?.sizes || ['S', 'M', 'L', 'XL'],
          colors: local?.colors || [{ name: data.color_name || '기본', hex: data.hex_code || '#888888' }],
          inStock: data.in_stock === 1,
          imageUrl: data.image_url || local?.imageUrl,
          isOwned: false,
        };
        initProduct(merged);
      })
      .catch(() => {
        if (local) initProduct(local);
      });

    return () => {
      const duration = Math.round((Date.now() - enterTime) / 1000);
      if (duration > 1) Logger.log('product_view', { productId: id, duration });
    };
  }, [id]);

  const addToCart = () => {
    if (!product || !selectedSize) return;
    if ((!localStorage.getItem('userId') || localStorage.getItem('userId')!.startsWith('anon_') )) { requireLogin(); return; }

    const cart = JSON.parse(localStorage.getItem(cartKey()) || '[]');
    const existingItem = cart.find(
      (item: any) => item.product.id === product.id && item.size === selectedSize && item.selectedColor?.hex === selectedColor?.hex
    );
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.push({ product, size: selectedSize, selectedColor, quantity });
    }
    localStorage.setItem(cartKey(), JSON.stringify(cart));
    window.dispatchEvent(new Event('storage'));
    Logger.log('add_to_cart', {
      productId: product.id,
      productName: product.name,
      size: selectedSize,
      quantity,
    });

    // GA4 장바구니 추가 이벤트
    if ((window as any).gtag) {
      (window as any).gtag('event', 'add_to_cart', {
        currency: 'KRW',
        value: product.price * quantity,
        items: [{ item_id: product.id, item_name: product.name, price: product.price, quantity }],
      });
    }
    // 페이스북 픽셀 AddToCart 이벤트
    if ((window as any).fbq) {
      (window as any).fbq('track', 'AddToCart', {
        content_ids: [product.id],
        content_name: product.name,
        value: product.price * quantity,
        currency: 'KRW',
      });
    }

    setShowModal(true);
  };

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">상품을 찾을 수 없습니다</p>
          <button
            onClick={() => navigate('/shop')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            쇼핑 계속하기
          </button>
        </div>
      </div>
    );
  }

  const warmthLabels = ['매우 얇음', '얇음', '보통', '두꺼움', '매우 두꺼움'];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 로그인 필요 토스트 */}
      {/* 로그인 필요 모달 */}
      {loginToast && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🔒</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">로그인이 필요합니다</h3>
              <p className="text-sm text-gray-500">장바구니 기능은 로그인 후 이용 가능합니다</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setLoginToast(false)}
                className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
              >
                닫기
              </button>
              <button
                onClick={() => navigate('/auth', { state: { from: `/product/${id}` } })}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
              >
                로그인
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 장바구니 추가 모달 */}
      <CartSuccessModal
        product={showModal ? product : null}
        onClose={() => setShowModal(false)}
        onGoCart={() => {
          setShowModal(false);
          navigate('/cart');
        }}
      />

      {/* 헤더 */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
        <div className="max-w-screen-xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>뒤로</span>
          </button>
          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            onClick={handleToggleWishlist}
          >
            <Heart
              className={`w-6 h-6 transition-colors ${isWished ? 'fill-red-500 text-red-500' : 'text-gray-400'}`}
            />
          </button>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-2 gap-8">
          {/* 상품 이미지 */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div
              className="aspect-square flex items-center justify-center overflow-hidden"
              style={{ backgroundColor: product.imageUrl ? '#f3f4f6' : product.color }}
            >
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-9xl opacity-50">👕</span>
              )}
            </div>
          </div>

          {/* 상품 정보 */}
          <div>
            <div className="bg-white rounded-2xl p-6 shadow-sm mb-4">
              <div className="text-sm text-blue-600 font-medium mb-2">{product.brand}</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">{product.name}</h1>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`w-4 h-4 rounded-sm ${
                        level <= product.warmth ? 'bg-orange-400' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-600">
                  보온성: {warmthLabels[product.warmth - 1]}
                </span>
              </div>

              <p className="text-gray-600 mb-6">{product.description}</p>

              <div className="text-3xl font-bold text-gray-900 mb-6">
                {product.price.toLocaleString()}원
              </div>

              {/* 색상 선택 */}
              {product.colors && product.colors.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-gray-700">색상 선택</label>
                    {selectedColor && (
                      <span className="text-sm text-blue-600 font-medium">{selectedColor.name}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((c) => (
                      <button
                        key={c.hex}
                        title={c.name}
                        onClick={() => setSelectedColor(c)}
                        className={`relative w-9 h-9 rounded-full border-2 transition-all hover:scale-110 ${
                          selectedColor?.hex === c.hex
                            ? 'border-blue-500 scale-110 shadow-md'
                            : 'border-gray-200'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {/* 흰색 계열은 체크 표시 */}
                        {selectedColor?.hex === c.hex && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-4 h-4 drop-shadow" viewBox="0 0 16 16">
                              <polyline
                                points="3,8 6.5,12 13,4"
                                fill="none"
                                stroke={c.hex === '#FFFFFF' || c.hex === '#D4D4D4' || c.hex === '#D4B896' ? '#374151' : 'white'}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 사이즈 선택 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">사이즈 선택</label>
                <div className="grid grid-cols-4 gap-2">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                        selectedSize === size
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* 수량 선택 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">수량</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50"
                  >
                    -
                  </button>
                  <span className="w-12 text-center font-medium">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 구매 버튼 */}
              <button
                onClick={addToCart}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                <ShoppingBag className="w-5 h-5" />
                장바구니 담기
              </button>
            </div>

            {/* 상품 정보 테이블 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">상품 정보</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">카테고리</span>
                  <span className="text-gray-900">
                    {product.category === 'outer' ? '아우터' : product.category === 'top' ? '상의' : '하의'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">브랜드</span>
                  <span className="text-gray-900">{product.brand}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">재고</span>
                  <span className="text-green-600">재고 있음</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">배송</span>
                  <span className="text-gray-900">무료배송</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
