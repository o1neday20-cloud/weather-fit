import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import Navigation from '../components/Navigation';
import { mockProducts, Product } from '../utils/products';
import { Logger } from '../utils/logger';
import { ShoppingBag, Search } from 'lucide-react';

export default function Shop() {
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [category, setCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    Logger.log('page_view', { page: 'shop' });
  }, []);

  useEffect(() => {
    let filtered = mockProducts;

    if (category !== 'all') {
      filtered = filtered.filter(p => p.category === category);
    }

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brand.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setProducts(filtered);
  }, [category, searchQuery]);

  const categories = [
    { id: 'all', label: '전체' },
    { id: 'outer', label: '아우터' },
    { id: 'top', label: '상의' },
    { id: 'bottom', label: '하의' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
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
            <ProductCard key={product.id} product={product} />
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

function ProductCard({ product }: { product: Product }) {
  const addToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const existingItem = cart.find((item: any) => item.product.id === product.id);

    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      cart.push({
        product,
        size: product.sizes[0],
        quantity: 1,
      });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    Logger.log('add_to_cart', { productId: product.id, productName: product.name });

    // 시각적 피드백
    alert(`${product.name}이(가) 장바구니에 추가되었습니다!`);
  };

  return (
    <Link to={`/product/${product.id}`} className="block">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        <div
          className="h-48 flex items-center justify-center text-white text-4xl"
          style={{ backgroundColor: product.color }}
        >
          <span className="opacity-50">👕</span>
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
              onClick={addToCart}
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
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
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
