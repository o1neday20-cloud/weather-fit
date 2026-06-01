import { useState, useEffect } from 'react';
import { cartKey } from '../utils/storage';
import { Link, useNavigate } from 'react-router';
import Navigation from '../components/Navigation';
import { CartItem } from '../utils/products';
import { Logger } from '../utils/logger';
import { ShoppingBag, Trash2, Plus, Minus, ArrowLeft } from 'lucide-react';

export default function Cart() {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if ((!localStorage.getItem('userId') || localStorage.getItem('userId')!.startsWith('anon_') )) {
      navigate('/auth', { state: { from: '/cart', message: '장바구니는 로그인 후 이용 가능합니다' } });
      return;
    }
    loadCart();
    Logger.log('page_view', { page: 'cart' });
  }, [navigate]);

  const loadCart = () => {
    const cart = JSON.parse(localStorage.getItem(cartKey()) || '[]');
    setCartItems(cart);
    // 기본적으로 모든 아이템 선택
    setSelectedIndices(new Set(cart.map((_: CartItem, i: number) => i)));
  };

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...cartItems];
    updated[index].quantity = Math.max(1, updated[index].quantity + delta);
    setCartItems(updated);
    localStorage.setItem(cartKey(), JSON.stringify(updated));
  };

  const removeItem = async (index: number) => {
    const item = cartItems[index];
    const updated = cartItems.filter((_, i) => i !== index);
    // 인덱스 재정렬
    const newSelected = new Set<number>();
    selectedIndices.forEach(si => {
      if (si < index) newSelected.add(si);
      else if (si > index) newSelected.add(si - 1);
    });
    setCartItems(updated);
    setSelectedIndices(newSelected);
    localStorage.setItem(cartKey(), JSON.stringify(updated));
    Logger.log('remove_from_cart', { itemIndex: index });

    // DB에서도 삭제
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      const customerId = localStorage.getItem('userId');
      let purchaseId = (item as any).purchaseId;

      if (!purchaseId && customerId) {
        const res = await fetch(`${apiUrl}/purchase/${customerId}/cart`);
        if (res.ok) {
          const dbCart = await res.json();
          const match = dbCart.find((r: any) => r.product_id === item.product.id);
          if (match) purchaseId = match.purchase_id ?? match.id;
        }
      }

      if (purchaseId) {
        await fetch(`${apiUrl}/cart/${purchaseId}`, { method: 'DELETE' });
      }
    } catch {
      // DB 삭제 실패해도 로컬 삭제는 유지
    }
  };

  const toggleItem = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedIndices(next);
  };

  const isAllSelected = cartItems.length > 0 && selectedIndices.size === cartItems.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(cartItems.map((_, i) => i)));
    }
  };

  const getSelectedTotal = () => {
    return cartItems
      .filter((_, i) => selectedIndices.has(i))
      .reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  };

  const getSelectedCount = () => {
    return [...selectedIndices].reduce((sum, i) => sum + (cartItems[i]?.quantity || 0), 0);
  };

  const handleCheckout = () => {
    if (selectedIndices.size === 0) return;

    const selectedItems = cartItems.filter((_, i) => selectedIndices.has(i));

    Logger.log('checkout_initiated', {
      itemCount: selectedItems.length,
      totalPrice: getSelectedTotal(),
    });

    navigate('/checkout', { state: { checkoutItems: selectedItems } });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">장바구니</h1>
            <p className="text-sm text-gray-600 mt-1">{cartItems.length}개의 상품</p>
          </div>
        </div>

        {cartItems.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <ShoppingBag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">장바구니가 비어있습니다</p>
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              쇼핑 계속하기
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* 장바구니 아이템 */}
            <div className="lg:col-span-2 space-y-3">
              {/* 전체선택 바 */}
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded accent-blue-600 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    전체선택 ({selectedIndices.size}/{cartItems.length})
                  </span>
                </label>
                {selectedIndices.size > 0 && (
                  <span className="text-xs text-gray-400">
                    {getSelectedCount()}개 상품 선택됨
                  </span>
                )}
              </div>

              {cartItems.map((item, index) => {
                const isSelected = selectedIndices.has(index);
                return (
                  <div
                    key={index}
                    className={`bg-white rounded-xl p-4 shadow-sm transition-colors ${
                      isSelected ? 'ring-2 ring-blue-400' : 'opacity-60'
                    }`}
                  >
                    <div className="flex gap-3">
                      {/* 체크박스 */}
                      <div className="flex items-center flex-shrink-0 pt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(index)}
                          className="w-5 h-5 rounded accent-blue-600 cursor-pointer"
                        />
                      </div>

                      {/* 상품 이미지 */}
                      <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                        {item.product.imageUrl ? (
                          <img
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const el = e.currentTarget as HTMLImageElement;
                              el.style.display = 'none';
                              (el.nextSibling as HTMLElement)?.style.setProperty('display', 'flex');
                            }}
                          />
                        ) : null}
                        <div
                          className="w-full h-full items-center justify-center text-3xl"
                          style={{
                            display: item.product.imageUrl ? 'none' : 'flex',
                            backgroundColor: item.product.color || '#e5e7eb',
                          }}
                        >
                          <span className="opacity-40">👕</span>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-xs text-gray-500 mb-1">
                              {item.product.brand}
                            </div>
                            <h3 className="font-semibold text-gray-900 truncate">
                              {item.product.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              {(item as any).selectedColor && (
                                <div className="flex items-center gap-1">
                                  <div
                                    className="w-3.5 h-3.5 rounded-full border border-gray-300"
                                    style={{ backgroundColor: (item as any).selectedColor.hex }}
                                  />
                                  <span className="text-xs text-gray-500">{(item as any).selectedColor.name}</span>
                                </div>
                              )}
                              <span className="text-xs text-gray-500">· {item.size}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeItem(index)}
                            className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(index, -1)}
                              className="w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-8 text-center font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(index, 1)}
                              className="w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="text-lg font-bold text-gray-900">
                            {(item.product.price * item.quantity).toLocaleString()}원
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 주문 요약 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl p-6 shadow-sm sticky top-6">
                <h2 className="font-semibold text-gray-900 mb-4">주문 요약</h2>

                <div className="space-y-3 mb-4 pb-4 border-b">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">선택 상품</span>
                    <span className="text-gray-500 text-xs">
                      {selectedIndices.size}종 / {getSelectedCount()}개
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">상품 금액</span>
                    <span className="text-gray-900">
                      {getSelectedTotal().toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">배송비</span>
                    <span className="text-green-600">무료</span>
                  </div>
                </div>

                <div className="flex justify-between mb-6">
                  <span className="font-semibold text-gray-900">총 결제금액</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {getSelectedTotal().toLocaleString()}원
                  </span>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={selectedIndices.size === 0}
                  className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors mb-3"
                >
                  {selectedIndices.size === 0
                    ? '상품을 선택해주세요'
                    : `선택 상품 구매하기 (${selectedIndices.size}종)`}
                </button>

                <Link
                  to="/shop"
                  className="block w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-center"
                >
                  쇼핑 계속하기
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <Navigation />
    </div>
  );
}
