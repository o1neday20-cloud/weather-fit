import { ClothingItem } from './aiModel';

export interface Product extends ClothingItem {
  price: number;
  brand: string;
  description: string;
  sizes: string[];
  inStock: boolean;
}

// Mock 쇼핑몰 상품 데이터
export const mockProducts: Product[] = [
  {
    id: 'prod_1',
    name: '울 블렌드 코트',
    category: 'outer',
    warmth: 5,
    color: '#2C3E50',
    style: 'formal',
    price: 189000,
    brand: 'ZARA',
    description: '따뜻한 울 소재의 클래식 코트',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_2',
    name: '경량 패딩 점퍼',
    category: 'outer',
    warmth: 4,
    color: '#34495E',
    style: 'casual',
    price: 129000,
    brand: 'UNIQLO',
    description: '가볍고 따뜻한 다운 패딩',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_3',
    name: '가죽 라이더 자켓',
    category: 'outer',
    warmth: 3,
    color: '#2C3E50',
    style: 'street',
    price: 259000,
    brand: 'MUSINSA',
    description: '스타일리시한 인조가죽 자켓',
    sizes: ['S', 'M', 'L'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_4',
    name: '기모 맨투맨',
    category: 'top',
    warmth: 3,
    color: '#95A5A6',
    style: 'casual',
    price: 45000,
    brand: 'SPAO',
    description: '부드러운 기모 안감의 맨투맨',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_5',
    name: '니트 스웨터',
    category: 'top',
    warmth: 4,
    color: '#E74C3C',
    style: 'minimal',
    price: 59000,
    brand: 'H&M',
    description: '따뜻한 울 혼방 니트',
    sizes: ['S', 'M', 'L'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_6',
    name: '후드 집업',
    category: 'top',
    warmth: 3,
    color: '#3498DB',
    style: 'sporty',
    price: 52000,
    brand: 'NIKE',
    description: '스포티한 후드 집업',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_7',
    name: '긴팔 티셔츠',
    category: 'top',
    warmth: 2,
    color: '#ECF0F1',
    style: 'minimal',
    price: 29000,
    brand: 'UNIQLO',
    description: '베이직 긴팔 라운드 티',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_8',
    name: '반팔 티셔츠',
    category: 'top',
    warmth: 1,
    color: '#ECF0F1',
    style: 'casual',
    price: 19000,
    brand: 'SPAO',
    description: '시원한 면 소재 반팔티',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_9',
    name: '스키니 청바지',
    category: 'bottom',
    warmth: 2,
    color: '#34495E',
    style: 'street',
    price: 79000,
    brand: 'LEVI\'S',
    description: '슬림핏 데님 팬츠',
    sizes: ['28', '30', '32', '34'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_10',
    name: '기모 스웨트팬츠',
    category: 'bottom',
    warmth: 3,
    color: '#95A5A6',
    style: 'sporty',
    price: 39000,
    brand: 'ADIDAS',
    description: '편안한 기모 트레이닝 팬츠',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_11',
    name: '슬랙스',
    category: 'bottom',
    warmth: 2,
    color: '#2C3E50',
    style: 'formal',
    price: 69000,
    brand: 'ZARA',
    description: '정장용 슬림 슬랙스',
    sizes: ['28', '30', '32', '34'],
    inStock: true,
    isOwned: false,
  },
  {
    id: 'prod_12',
    name: '반바지',
    category: 'bottom',
    warmth: 1,
    color: '#3498DB',
    style: 'casual',
    price: 35000,
    brand: 'H&M',
    description: '여름용 코튼 반바지',
    sizes: ['S', 'M', 'L', 'XL'],
    inStock: true,
    isOwned: false,
  },
];

export interface CartItem {
  product: Product;
  size: string;
  quantity: number;
}

export const getProductsByCategory = (category: string): Product[] => {
  if (category === 'all') return mockProducts;
  return mockProducts.filter(p => p.category === category);
};

export const getProductById = (id: string): Product | undefined => {
  return mockProducts.find(p => p.id === id);
};

export const getRecommendedProducts = (feelTemp: number, excludeIds: string[]): Product[] => {
  let requiredWarmth: number;
  if (feelTemp < 5) requiredWarmth = 4;
  else if (feelTemp < 10) requiredWarmth = 3;
  else if (feelTemp < 20) requiredWarmth = 2;
  else requiredWarmth = 1;

  return mockProducts
    .filter(p => !excludeIds.includes(p.id))
    .filter(p => Math.abs(p.warmth - requiredWarmth) <= 1)
    .slice(0, 6);
};
