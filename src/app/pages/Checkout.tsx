import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { CartItem } from '../utils/products';
import { Logger } from '../utils/logger';
import { CheckCircle2 } from 'lucide-react';

export default function Checkout() {
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    detailAddress: '',
    message: '',
  });
  const [addToWardrobe, setAddToWardrobe] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    if (cart.length === 0) {
      navigate('/cart');
      return;
    }
    setCartItems(cart);
    Logger.log('page_view', { page: 'checkout' });
  }, [navigate]);

  const getTotalPrice = () => {
    return cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);

    // 결제 시뮬레이션
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 옷장에 추가 옵션이 켜져있으면 구매한 상품을 옷장에 추가
    if (addToWardrobe) {
      const wardrobe = JSON.parse(localStorage.getItem('wardrobe') || '[]');
      cartItems.forEach((item) => {
        wardrobe.push({
          ...item.product,
          id: `owned_${Date.now()}_${Math.random()}`,
          isOwned: true,
        });
      });
      localStorage.setItem('wardrobe', JSON.stringify(wardrobe));
    }

    Logger.log('purchase_completed', {
      items: cartItems.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
      })),
      totalPrice: getTotalPrice(),
      addToWardrobe,
    });

    // 장바구니 비우기
    localStorage.setItem('cart', JSON.stringify([]));

    setProcessing(false);
    setCompleted(true);

    // 3초 후 홈으로 이동
    setTimeout(() => {
      navigate('/');
    }, 3000);
  };

  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">구매 완료!</h1>
          <p className="text-gray-600 mb-4">
            주문이 성공적으로 완료되었습니다.
          </p>
          {addToWardrobe && (
            <p className="text-sm text-blue-600 mb-6">
              구매하신 상품이 내 옷장에 추가되었습니다 ✨
            </p>
          )}
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
          {/* 주문 정보 입력 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 배송 정보 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">배송 정보</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    수령인
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    연락처
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="010-0000-0000"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    주소
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="기본 주소"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                    required
                  />
                  <input
                    type="text"
                    value={formData.detailAddress}
                    onChange={(e) =>
                      setFormData({ ...formData, detailAddress: e.target.value })
                    }
                    placeholder="상세 주소"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    배송 메시지 (선택)
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="배송 시 요청사항을 입력해주세요"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* 옷장 추가 옵션 */}
            <div className="bg-blue-50 rounded-xl p-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addToWardrobe}
                  onChange={(e) => setAddToWardrobe(e.target.checked)}
                  className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <div className="font-semibold text-gray-900 mb-1">
                    구매 후 내 옷장에 자동 추가
                  </div>
                  <p className="text-sm text-gray-600">
                    구매하신 상품을 내 옷장에 자동으로 추가하여 AI 코디 추천에 활용합니다.
                  </p>
                </div>
              </label>
            </div>

            {/* 주문 상품 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">주문 상품</h2>
              <div className="space-y-3">
                {cartItems.map((item, index) => (
                  <div key={index} className="flex gap-3 py-3 border-b last:border-0">
                    <div
                      className="w-16 h-16 rounded-lg flex items-center justify-center text-white text-2xl flex-shrink-0"
                      style={{ backgroundColor: item.product.color }}
                    >
                      <span className="opacity-50">👕</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-500">{item.product.brand}</div>
                      <div className="font-medium text-gray-900 truncate">
                        {item.product.name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {item.size} / 수량: {item.quantity}개
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900">
                        {(item.product.price * item.quantity).toLocaleString()}원
                      </div>
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
                type="submit"
                disabled={processing}
                className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {processing ? '처리중...' : '결제하기'}
              </button>

              <div className="mt-4 text-xs text-gray-500 text-center">
                본 서비스는 데모 버전으로 실제 결제가 이루어지지 않습니다.
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
