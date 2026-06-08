import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { CartItem, PRODUCT_COLORS } from '../utils/products';
import { Logger } from '../utils/logger';
import { wardrobeKey, cartKey, loadAddressHistory, saveAddress, SavedAddress } from '../utils/storage';
import { CheckCircle2, Ticket, X, Check, ChevronDown, User, Clock } from 'lucide-react';
import { calcDiscount, isCouponValid, CouponItem } from '../utils/coupon';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.135/api';

// 한국어 색상명 → 영문 매핑 (파트너 color_id 조회용)
const COLOR_NAME_MAP: Record<string, string> = {
  '화이트': 'WHITE', '블랙': 'BLACK', '네이비': 'NAVY', '차콜': 'CHARCOAL',
  '그레이': 'GRAY', '라이트그레이': 'LIGHT_GRAY', '베이지': 'BEIGE', '브라운': 'BROWN',
  '카키': 'KHAKI', '레드': 'RED', '버건디': 'BURGUNDY', '핑크': 'PINK',
  '블루': 'BLUE', '스카이블루': 'SKY_BLUE', '데님': 'DENIM', '그린': 'GREEN',
  '민트': 'MINT', '옐로우': 'YELLOW', '오렌지': 'ORANGE', '퍼플': 'PURPLE',
};

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [cartItems, setCartItems]   = useState<CartItem[]>([]);
  const [formData, setFormData]     = useState({ name: '', phone: '', address: '', detailAddress: '', message: '' });
  const [addToWardrobe, setAddToWardrobe] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted]   = useState(false);

  const [couponInfo, setCouponInfo] = useState<(CouponItem & { discountAmt: number }) | null>(null);
  const [myCoupons, setMyCoupons]   = useState<CouponItem[]>([]);

  // 이전 배송지
  const [addressHistory, setAddressHistory] = useState<SavedAddress[]>([]);
  const [showAddrHistory, setShowAddrHistory] = useState(false);

  useEffect(() => {
    // Cart에서 선택된 아이템만 넘어온 경우 state 사용, 아니면 전체 cart 사용
    const stateItems: CartItem[] | undefined = (location.state as any)?.checkoutItems;
    const cart = stateItems && stateItems.length > 0
      ? stateItems
      : JSON.parse(localStorage.getItem(cartKey()) || '[]');
    if (cart.length === 0) { navigate('/cart'); return; }
    setCartItems(cart);

    const userId = localStorage.getItem('userId');

    // ── 사용자 정보 자동입력 ──────────────────
    const profileStr = localStorage.getItem('userProfile');
    if (profileStr) {
      const p = JSON.parse(profileStr);
      setFormData(prev => ({
        ...prev,
        name:  prev.name  || p.name  || '',
        phone: prev.phone || p.phone || '',
      }));
    }

    // ── 이전 배송지 불러오기 ──────────────────
    setAddressHistory(loadAddressHistory());

    const partnerCustomerId = localStorage.getItem('partnerCustomerId');
    if (partnerCustomerId) {
      fetch(`${API_BASE}/coupons/my/${partnerCustomerId}`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(setMyCoupons)
        .catch(() => {});
    }
    Logger.log('page_view', { page: 'checkout' });
  }, [navigate]);

  const getTotalPrice = () => cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const getFinalPrice = () => Math.max(0, getTotalPrice() - (couponInfo?.discountAmt || 0));

  const handleSelectCoupon = (c: CouponItem) => {
    if (couponInfo?.coupon_id === c.coupon_id) { setCouponInfo(null); return; }
    if (!isCouponValid(c)) return;
    const discountAmt = calcDiscount(c, getTotalPrice());
    setCouponInfo({ ...c, discountAmt });
  };

  const handleRemoveCoupon = () => setCouponInfo(null);

  // 이전 배송지 선택
  const handleSelectAddress = (addr: SavedAddress) => {
    setFormData({
      name:          addr.name,
      phone:         addr.phone,
      address:       addr.address,
      detailAddress: addr.detailAddress,
      message:       addr.message,
    });
    setShowAddrHistory(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    // ── 옷장 로컬 업데이트 (실패해도 구매는 반드시 계속됨) ────────
    if (addToWardrobe) {
      try {
        const wardrobe: any[] = JSON.parse(localStorage.getItem(wardrobeKey()) || '[]');
        cartItems.forEach(item => {
          const baseId = item.product.id;
          const color = item.selectedColor?.hex || item.product.color;
          const colorName = item.selectedColor?.name || '';
          const existing = wardrobe.find((w: any) => w.productId === baseId || w.id === baseId);
          if (existing) {
            // 같은 상품 — 새 색상만 추가, 이미 있는 색상은 스킵
            if (!Array.isArray(existing.colorVariants)) existing.colorVariants = [];
            const alreadyHasColor = existing.colorVariants.some((c: any) => c.hex === color);
            if (!alreadyHasColor) existing.colorVariants.push({ hex: color, name: colorName });
          } else {
            wardrobe.push({
              ...item.product,
              id: baseId,
              productId: baseId,
              isOwned: true,
              color,
              colorVariants: [{ hex: color, name: colorName }],
            });
          }
        });
        localStorage.setItem(wardrobeKey(), JSON.stringify(wardrobe));
      } catch { /* 옷장 추가 실패해도 구매 처리는 계속 */ }
    }
    // ── 1. DB 저장 (필수) — 아이템별 POST /api/purchase ──────────
    const partnerCustIdNum = Number(localStorage.getItem('partnerCustomerId')) || null;
    let couponSent = false; // 쿠폰은 첫 번째 아이템에만 포함 (중복 방지)
    for (const item of cartItems) {
      const numericProductId = Number(String(item.product.id).replace(/^prod_/i, ''));
      try {
        const body: Record<string, any> = {
          customer_id: partnerCustIdNum,
          product_id:  numericProductId,
          size:        item.size,
          price:       item.product.price * item.quantity,
          status:      'PURCHASED',
        };
        if (!couponSent && couponInfo?.coupon_id) {
          body.coupon_id = couponInfo.coupon_id;
          couponSent = true;
        }
        await fetch(`${API_BASE}/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        });
      } catch {}
    }

    // ── 2. 행동 로그 (별도, fire-and-forget) ──────────────────────
    Logger.log('purchase_completed', {
      items: cartItems.map(item => ({
        productId: item.product.id, productName: item.product.name,
        quantity: item.quantity, price: item.product.price,
      })),
      totalPrice: getTotalPrice(), couponUsed: couponInfo?.coupon_id,
      discountAmt: couponInfo?.discountAmt || 0, finalPrice: getFinalPrice(), addToWardrobe,
    });
    (Logger as any).logPurchase(
      cartItems.map(item => ({
        productId: item.product.id, productName: item.product.name,
        size: item.size, quantity: item.quantity, price: item.product.price,
      })),
      couponInfo?.coupon_id, couponInfo?.discountAmt,
    ).catch(() => {});

    // ── WARDROBE API (이미 같은 색상이 있으면 스킵 — 구매와 무관) ──
    if (addToWardrobe) {
      const userId = localStorage.getItem('userId');
      const partnerCustomerId = localStorage.getItem('partnerCustomerId');
      const partnerColors: any[] = JSON.parse(localStorage.getItem('partnerColors') || '[]');
      const currentWardrobe: any[] = JSON.parse(localStorage.getItem(wardrobeKey()) || '[]');
      for (const item of cartItems) {
        const colorHex = item.selectedColor?.hex || item.product.color;
        // 옷장에 동일 상품 + 동일 색상이 이미 있으면 API 스킵
        const existingItem = currentWardrobe.find((w: any) => w.productId === item.product.id || w.id === item.product.id);
        const alreadyHasColor = Array.isArray(existingItem?.colorVariants)
          && existingItem.colorVariants.some((c: any) => c.hex === colorHex);
        if (alreadyHasColor) continue;

        const matchedProductColor = Object.values(PRODUCT_COLORS).find(c => c.hex === colorHex);
        const koLabel = matchedProductColor?.name || '';
        const enName = COLOR_NAME_MAP[koLabel] || koLabel.toUpperCase();
        const partnerColor = partnerColors.find((c: any) => (c.name || '').toUpperCase() === enName);
        const colorId = partnerColor?.id ?? null;
        const wardrobeId = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        fetch(`${API_BASE}/wardrobe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wardrobe_id: wardrobeId,
            customer_id: userId,
            category: (item.product.category || 'top').toUpperCase(),
            style: (item.product.style || 'casual').toUpperCase(),
            warmth: item.product.warmth,
            color: colorHex,
            color_id: colorId,
            partnerCustomerId: partnerCustomerId ? Number(partnerCustomerId) : null,
          }),
          signal: AbortSignal.timeout(3000),
          keepalive: true,
        }).catch(() => {});
      }
    }

    // ── 구매 내역 localStorage 저장 (MyPage 표시용) ───────────────
    const purchaseHistory: any[] = JSON.parse(localStorage.getItem('purchaseHistory') || '[]');
    cartItems.forEach(item => {
      purchaseHistory.push({
        productId: item.product.id,
        productName: item.product.name,
        brand: item.product.brand,
        price: item.product.price * item.quantity,
        size: item.size,
        quantity: item.quantity,
        imageUrl: item.product.imageUrl,
        color: item.selectedColor?.hex || item.product.color,
        purchasedAt: new Date().toISOString(),
      });
    });
    localStorage.setItem('purchaseHistory', JSON.stringify(purchaseHistory));

    // 구매한 아이템만 장바구니에서 제거 (선택 구매 지원)
    const purchasedKeys = new Set(cartItems.map(item => `${item.product.id}__${item.size}`));
    const fullCart: CartItem[] = JSON.parse(localStorage.getItem(cartKey()) || '[]');
    const remainingCart = fullCart.filter(
      item => !purchasedKeys.has(`${item.product.id}__${item.size}`)
    );
    localStorage.setItem(cartKey(), JSON.stringify(remainingCart));
    // 배송지 저장
    if (formData.address) {
      saveAddress(formData);
      setAddressHistory(loadAddressHistory());
    }
    if (couponInfo) {
      setMyCoupons(prev => prev.filter(c => c.coupon_id !== couponInfo.coupon_id));
    }
    setProcessing(false); setCompleted(true);
    setTimeout(() => navigate('/'), 3000);
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">구매 완료!</h1>
          <p className="text-gray-600 mb-4">주문이 성공적으로 완료되었습니다.</p>
          {couponInfo && <p className="text-sm text-blue-600 mb-2">쿠폰 할인 {couponInfo.discountAmt.toLocaleString()}원 적용됨 🎫</p>}
          {addToWardrobe && <p className="text-sm text-blue-600 mb-6">구매하신 상품이 내 옷장에 추가되었습니다 ✨</p>}
          <p className="text-sm text-gray-500">잠시 후 홈으로 이동합니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">주문/결제</h1>
        <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* 배송 정보 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">배송 정보</h2>
                <div className="flex gap-2">
                  {/* 로그인 정보 불러오기 */}
                  {localStorage.getItem('userProfile') && (
                    <button
                      type="button"
                      onClick={() => {
                        const p = JSON.parse(localStorage.getItem('userProfile') || '{}');
                        setFormData(prev => ({ ...prev, name: p.name || '', phone: p.phone || '' }));
                      }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <User className="w-3 h-3" />
                      내 정보 불러오기
                    </button>
                  )}
                  {/* 이전 배송지 */}
                  {addressHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAddrHistory(v => !v)}
                      className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-200 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Clock className="w-3 h-3" />
                      이전 배송지
                      <ChevronDown className={`w-3 h-3 transition-transform ${showAddrHistory ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              </div>

              {/* 이전 배송지 드롭다운 */}
              {showAddrHistory && (
                <div className="mb-4 border border-gray-200 rounded-xl overflow-hidden">
                  {addressHistory.map((addr, i) => (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => handleSelectAddress(addr)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''}`}
                    >
                      <p className="text-sm font-medium text-gray-800">{addr.name} · {addr.phone}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {addr.address} {addr.detailAddress}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(addr.savedAt).toLocaleDateString('ko-KR')}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                {[{label:'수령인',key:'name',type:'text',placeholder:'홍길동'},{label:'연락처',key:'phone',type:'tel',placeholder:'010-0000-0000'}].map(f=>(
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                    <input type={f.type} value={(formData as any)[f.key]} required placeholder={f.placeholder}
                      onChange={e => setFormData({...formData,[f.key]:e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
                  <input type="text" value={formData.address} required placeholder="기본 주소"
                    onChange={e=>setFormData({...formData,address:e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
                  <input type="text" value={formData.detailAddress} placeholder="상세 주소"
                    onChange={e=>setFormData({...formData,detailAddress:e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">배송 메시지 (선택)</label>
                  <textarea value={formData.message} onChange={e=>setFormData({...formData,message:e.target.value})}
                    placeholder="배송 시 요청사항을 입력해주세요" rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                </div>
              </div>
            </div>

            {/* 쿠폰 적용 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-blue-500" />
                  <h2 className="font-semibold text-gray-900">쿠폰 적용</h2>
                </div>
                {couponInfo && (
                  <button type="button" onClick={handleRemoveCoupon}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                    선택 해제
                  </button>
                )}
              </div>

              {myCoupons.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">사용 가능한 쿠폰이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {myCoupons.map(c => {
                    const isSelected = couponInfo?.coupon_id === c.coupon_id;
                    const orderAmt = getTotalPrice();
                    const isDisabled = (c.min_order_amt > 0 && orderAmt < c.min_order_amt) || !isCouponValid(c);
                    const daysRemain = Math.ceil((new Date(c.valid_until).getTime() - Date.now()) / 86400000);
                    const isUrgent = daysRemain <= 7;
                    const discountText = c.discount_type === 'amount'
                      ? `${c.discount_value.toLocaleString()}원 할인`
                      : `${c.discount_value}% 할인${c.max_discount ? ` (최대 ${c.max_discount.toLocaleString()}원)` : ''}`;
                    const expiryText = daysRemain <= 0 ? '만료됨' : daysRemain <= 30 ? `${daysRemain}일 남음` : `~ ${new Date(c.valid_until).toLocaleDateString('ko-KR')}`;

                    return (
                      <button
                        key={c.coupon_id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleSelectCoupon(c)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : isDisabled
                            ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className={`text-sm font-semibold ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                              {c.name}
                            </p>
                            {isUrgent && !isDisabled && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-500 rounded-full font-bold flex-shrink-0">D-{daysRemain}</span>
                            )}
                          </div>
                          <p className={`text-xs ${isSelected ? 'text-blue-500' : 'text-gray-500'}`}>
                            {discountText}
                            {c.min_order_amt > 0 && ` · ${c.min_order_amt.toLocaleString()}원 이상`}
                          </p>
                          <p className={`text-xs mt-0.5 ${isUrgent ? 'text-red-400' : 'text-gray-400'}`}>
                            {expiryText}
                          </p>
                        </div>

                        <div className={`text-right flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-700'}`}>
                          <span className="text-base font-bold">
                            {c.discount_type === 'amount'
                              ? `-${c.discount_value.toLocaleString()}원`
                              : `-${c.discount_value}%`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 옷장 추가 */}
            <div className="bg-blue-50 rounded-xl p-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={addToWardrobe} onChange={e=>setAddToWardrobe(e.target.checked)}
                  className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500" />
                <div>
                  <div className="font-semibold text-gray-900 mb-1">구매 후 내 옷장에 자동 추가</div>
                  <p className="text-sm text-gray-600">구매하신 상품을 내 옷장에 자동으로 추가하여 AI 코디 추천에 활용합니다.</p>
                </div>
              </label>
            </div>

            {/* 주문 상품 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">주문 상품</h2>
              <div className="space-y-3">
                {cartItems.map((item,index)=>(
                  <div key={index} className="flex gap-3 py-3 border-b last:border-0">
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      {item.product.imageUrl ? (
                        <img src={item.product.imageUrl} alt={item.product.name} className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display='none'; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl"
                          style={{backgroundColor: item.product.color||'#e5e7eb'}}>
                          <span className="opacity-40">👕</span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-500">{item.product.brand}</div>
                      <div className="font-medium text-gray-900 truncate">{item.product.name}</div>
                      <div className="text-sm text-gray-600">{item.size} / 수량: {item.quantity}개</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">{(item.product.price*item.quantity).toLocaleString()}원</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 결제 금액 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-6">
              <h2 className="font-semibold text-gray-900 mb-4">결제 금액</h2>
              <div className="space-y-3 mb-4 pb-4 border-b">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">상품 금액</span>
                  <span className="text-gray-900">{getTotalPrice().toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">배송비</span>
                  <span className="text-green-600">무료</span>
                </div>
                {couponInfo && (
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-600 flex items-center gap-1"><Ticket className="w-3.5 h-3.5"/>쿠폰 할인</span>
                    <span className="text-blue-600 font-medium">-{couponInfo.discountAmt.toLocaleString()}원</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between mb-6">
                <span className="font-semibold text-gray-900">총 결제금액</span>
                <div className="text-right">
                  {couponInfo && <div className="text-sm text-gray-400 line-through">{getTotalPrice().toLocaleString()}원</div>}
                  <span className="text-2xl font-bold text-blue-600">{getFinalPrice().toLocaleString()}원</span>
                </div>
              </div>
              <button type="submit" disabled={processing}
                className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                {processing?'처리중...':`${getFinalPrice().toLocaleString()}원 결제하기`}
              </button>
              <div className="mt-4 text-xs text-gray-500 text-center">본 서비스는 데모 버전으로 실제 결제가 이루어지지 않습니다.</div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
