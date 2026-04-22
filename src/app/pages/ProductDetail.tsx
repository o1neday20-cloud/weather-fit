import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { getProductById, Product } from '../utils/products';
import { Logger } from '../utils/logger';
import { ShoppingBag, ArrowLeft, Heart } from 'lucide-react';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (id) {
      const found = getProductById(id);
      if (found) {
        setProduct(found);
        setSelectedSize(found.sizes[0]);
        Logger.log('product_view', { productId: id, productName: found.name });
      }
    }
  }, [id]);

  const addToCart = () => {
    if (!product || !selectedSize) return;

    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const existingItem = cart.find(
      (item: any) => item.product.id === product.id && item.size === selectedSize
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.push({
        product,
        size: selectedSize,
        quantity,
      });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    Logger.log('add_to_cart', {
      productId: product.id,
      productName: product.name,
      size: selectedSize,
      quantity,
    });

    alert('장바구니에 추가되었습니다!');
    navigate('/cart');
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
          <button className="p-2 hover:bg-gray-100 rounded-lg">
            <Heart className="w-6 h-6 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-2 gap-8">
          {/* 상품 이미지 */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div
              className="aspect-square flex items-center justify-center text-white text-9xl"
              style={{ backgroundColor: product.color }}
            >
              <span className="opacity-50">👕</span>
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

              {/* 사이즈 선택 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  사이즈 선택
                </label>
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

            {/* 상품 정보 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">상품 정보</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">카테고리</span>
                  <span className="text-gray-900">
                    {product.category === 'outer'
                      ? '아우터'
                      : product.category === 'top'
                      ? '상의'
                      : '하의'}
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
