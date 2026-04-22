import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import Navigation from '../components/Navigation';
import { CartItem } from '../utils/products';
import { Logger } from '../utils/logger';
import { ShoppingBag, Trash2, Plus, Minus, ArrowLeft } from 'lucide-react';

export default function Cart() {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  useEffect(() => {
    loadCart();
    Logger.log('page_view', { page: 'cart' });
  }, []);

  const loadCart = () => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    setCartItems(cart);
  };

  const updateQuantity = (index: number, delta: number) => {
    const updated = [...cartItems];
    updated[index].quantity = Math.max(1, updated[index].quantity + delta);
    setCartItems(updated);
    localStorage.setItem('cart', JSON.stringify(updated));
  };

  const removeItem = (index: number) => {
    const updated = cartItems.filter((_, i) => i !== index);
    setCartItems(updated);
    localStorage.setItem('cart', JSON.stringify(updated));
    Logger.log('remove_from_cart', { itemIndex: index });
  };

  const getTotalPrice = () => {
    return cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) return;

    Logger.log('checkout_initiated', {
      itemCount: cartItems.length,
      totalPrice: getTotalPrice(),
    });

    navigate('/checkout');
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
            <div className="lg:col-span-2 space-y-4">
              {cartItems.map((item, index) => (
                <div key={index} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex gap-4">
                    <div
                      className="w-24 h-24 rounded-lg flex items-center justify-center text-white text-3xl flex-shrink-0"
                      style={{ backgroundColor: item.product.color }}
                    >
                      <span className="opacity-50">👕</span>
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
                          <p className="text-sm text-gray-600">사이즈: {item.size}</p>
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
              ))}
            </div>

            {/* 주문 요약 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl p-6 shadow-sm sticky top-6">
                <h2 className="font-semibold text-gray-900 mb-4">주문 요약</h2>

                <div className="space-y-3 mb-4 pb-4 border-b">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">상품 금액</span>
                    <span className="text-gray-900">
                      {getTotalPrice().toLocaleString()}원
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
                    {getTotalPrice().toLocaleString()}원
                  </span>
                </div>

                <button
                  onClick={handleCheckout}
                  className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors mb-3"
                >
                  구매하기
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
