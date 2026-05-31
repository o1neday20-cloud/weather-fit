import { ClothingItem } from './aiModel';

export interface ProductColor {
  name: string;   // '화이트', '블랙' 등
  hex: string;    // '#FFFFFF'
}

export interface Product extends ClothingItem {
  price: number;
  brand: string;
  description: string;
  sizes: string[];
  colors: ProductColor[];   // 선택 가능한 색상 목록
  inStock: boolean;
  imageUrl?: string;
}

export interface CartItem {
  product: Product;
  size: string;
  selectedColor: ProductColor;
  quantity: number;
}

// ── 표준 색상 팔레트 ────────────────────────────────────────
export const PRODUCT_COLORS: Record<string, ProductColor> = {
  WHITE:      { name: '화이트',      hex: '#FFFFFF' },
  BLACK:      { name: '블랙',        hex: '#1A1A1A' },
  DARK_NAVY:  { name: '네이비',      hex: '#1B2A4A' },
  CHARCOAL:   { name: '차콜',        hex: '#3D3D3D' },
  GRAY:       { name: '그레이',      hex: '#8C8C8C' },
  LIGHT_GRAY: { name: '라이트그레이', hex: '#D4D4D4' },
  BEIGE:      { name: '베이지',      hex: '#D4B896' },
  BROWN:      { name: '브라운',      hex: '#7B4F2E' },
  KHAKI:      { name: '카키',        hex: '#7A7A52' },
  RED:        { name: '레드',        hex: '#D63031' },
  BURGUNDY:   { name: '버건디',      hex: '#7D1935' },
  PINK:       { name: '핑크',        hex: '#E8A0BF' },
  BLUE:       { name: '블루',        hex: '#2980B9' },
  SKY_BLUE:   { name: '스카이블루',   hex: '#74B9FF' },
  DENIM:      { name: '데님',        hex: '#5B7FA6' },
  GREEN:      { name: '그린',        hex: '#27AE60' },
  MINT:       { name: '민트',        hex: '#00B894' },
  YELLOW:     { name: '옐로우',      hex: '#F6C90E' },
  ORANGE:     { name: '오렌지',      hex: '#E17055' },
  PURPLE:     { name: '퍼플',        hex: '#6C5CE7' },
};

const C = PRODUCT_COLORS;

export const mockProducts: Product[] = [
  // ── OUTER ─────────────────────────────────────────────────
  {
    id: 'prod_1', name: '울 블렌드 코트', category: 'outer', warmth: 5,
    color: C.CHARCOAL.hex, style: 'formal', price: 189000, brand: 'ZARA',
    description: '따뜻한 울 소재의 클래식 코트. 세련된 실루엣으로 어떤 스타일에도 어울립니다.',
    sizes: ['S','M','L','XL'],
    colors: [C.CHARCOAL, C.BLACK, C.BEIGE, C.BURGUNDY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_1.jpg',
  },
  {
    id: 'prod_2', name: '경량 패딩 점퍼', category: 'outer', warmth: 4,
    color: C.DARK_NAVY.hex, style: 'casual', price: 129000, brand: 'UNIQLO',
    description: '가볍고 따뜻한 다운 패딩. 야외 활동에 최적화된 실용적인 아우터.',
    sizes: ['S','M','L','XL'],
    colors: [C.DARK_NAVY, C.BLACK, C.KHAKI, C.RED],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_2.jpg',
  },
  {
    id: 'prod_3', name: '가죽 라이더 자켓', category: 'outer', warmth: 3,
    color: C.BLACK.hex, style: 'street', price: 259000, brand: 'MUSINSA',
    description: '스타일리시한 인조가죽 자켓. 어느 계절이나 레이어링하기 좋습니다.',
    sizes: ['S','M','L'],
    colors: [C.BLACK, C.BROWN, C.BURGUNDY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_3.jpg',
  },
  {
    id: 'prod_13', name: '트렌치코트', category: 'outer', warmth: 3,
    color: C.BEIGE.hex, style: 'formal', price: 229000, brand: 'ZARA',
    description: '봄·가을 필수 아이템. 클래식한 더블 버튼 트렌치코트.',
    sizes: ['S','M','L','XL'],
    colors: [C.BEIGE, C.CHARCOAL, C.KHAKI],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_13.jpg',
  },
  {
    id: 'prod_14', name: '플리스 집업', category: 'outer', warmth: 3,
    color: C.GRAY.hex, style: 'casual', price: 79000, brand: 'PATAGONIA',
    description: '보온성 높은 플리스 소재. 캠핑이나 일상에서 두루 활용 가능.',
    sizes: ['S','M','L','XL'],
    colors: [C.GRAY, C.GREEN, C.BURGUNDY, C.KHAKI],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_14.jpg',
  },
  {
    id: 'prod_15', name: '항공점퍼 (MA-1)', category: 'outer', warmth: 3,
    color: C.KHAKI.hex, style: 'street', price: 119000, brand: 'MUSINSA',
    description: '밀리터리 감성의 MA-1 항공점퍼. 스트릿 룩에 찰떡궁합.',
    sizes: ['S','M','L','XL'],
    colors: [C.KHAKI, C.BLACK, C.DARK_NAVY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_15.jpg',
  },

  // ── TOP ───────────────────────────────────────────────────
  {
    id: 'prod_4', name: '기모 맨투맨', category: 'top', warmth: 3,
    color: C.GRAY.hex, style: 'casual', price: 45000, brand: 'SPAO',
    description: '부드러운 기모 안감의 맨투맨. 겨울철 실내·외 모두 가볍게 입기 좋아요.',
    sizes: ['S','M','L','XL'],
    colors: [C.GRAY, C.BLACK, C.WHITE, C.DARK_NAVY, C.BURGUNDY, C.GREEN],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_4.jpg',
  },
  {
    id: 'prod_5', name: '니트 스웨터', category: 'top', warmth: 4,
    color: C.RED.hex, style: 'minimal', price: 59000, brand: 'H&M',
    description: '따뜻한 울 혼방 니트. 다양한 컬러가 있어 스타일링하기 편리합니다.',
    sizes: ['S','M','L'],
    colors: [C.RED, C.BEIGE, C.DARK_NAVY, C.GREEN, C.GRAY, C.WHITE],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_5.jpg',
  },
  {
    id: 'prod_6', name: '후드 집업', category: 'top', warmth: 3,
    color: C.BLUE.hex, style: 'sporty', price: 52000, brand: 'NIKE',
    description: '스포티한 후드 집업. 운동할 때나 캐주얼하게 입기 딱 좋습니다.',
    sizes: ['S','M','L','XL'],
    colors: [C.BLUE, C.BLACK, C.GRAY, C.RED, C.GREEN],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_6.jpg',
  },
  {
    id: 'prod_7', name: '긴팔 티셔츠', category: 'top', warmth: 2,
    color: C.WHITE.hex, style: 'minimal', price: 29000, brand: 'UNIQLO',
    description: '베이직 긴팔 라운드 티. 레이어링 아이템으로도 활용도 만점.',
    sizes: ['S','M','L','XL'],
    colors: [C.WHITE, C.BLACK, C.GRAY, C.DARK_NAVY, C.PINK, C.SKY_BLUE],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_7.jpg',
  },
  {
    id: 'prod_8', name: '반팔 티셔츠', category: 'top', warmth: 1,
    color: C.WHITE.hex, style: 'casual', price: 19000, brand: 'SPAO',
    description: '시원한 면 소재 반팔티. 여름 기본 아이템.',
    sizes: ['S','M','L','XL'],
    colors: [C.WHITE, C.BLACK, C.GRAY, C.PINK, C.SKY_BLUE, C.YELLOW],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_8.jpg',
  },
  {
    id: 'prod_16', name: '린넨 셔츠', category: 'top', warmth: 1,
    color: C.BEIGE.hex, style: 'casual', price: 39000, brand: 'UNIQLO',
    description: '통기성 좋은 린넨 소재 셔츠. 여름철 시원하게 입기 좋아요.',
    sizes: ['S','M','L','XL'],
    colors: [C.BEIGE, C.WHITE, C.SKY_BLUE, C.MINT, C.PINK],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_16.jpg',
  },
  {
    id: 'prod_17', name: '오버사이즈 후드티', category: 'top', warmth: 3,
    color: C.CHARCOAL.hex, style: 'street', price: 55000, brand: 'MUSINSA',
    description: '루즈하게 입기 좋은 오버사이즈 후드티. 스트릿 스타일 완성.',
    sizes: ['S','M','L','XL','2XL'],
    colors: [C.CHARCOAL, C.BLACK, C.WHITE, C.BEIGE, C.DARK_NAVY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_17.jpg',
  },
  {
    id: 'prod_18', name: '가디건', category: 'top', warmth: 3,
    color: C.BEIGE.hex, style: 'minimal', price: 49000, brand: 'H&M',
    description: '부드러운 니트 가디건. 봄·가을 레이어링 아이템으로 최적.',
    sizes: ['S','M','L'],
    colors: [C.BEIGE, C.GRAY, C.WHITE, C.PINK, C.GREEN, C.BURGUNDY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_18.jpg',
  },
  {
    id: 'prod_19', name: '스트라이프 셔츠', category: 'top', warmth: 2,
    color: C.DARK_NAVY.hex, style: 'formal', price: 45000, brand: 'ZARA',
    description: '네이비 스트라이프 셔츠. 캐주얼과 포멀 경계를 넘나드는 아이템.',
    sizes: ['S','M','L','XL'],
    colors: [C.DARK_NAVY, C.SKY_BLUE, C.WHITE],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_19.jpg',
  },
  {
    id: 'prod_20', name: '반팔 폴로셔츠', category: 'top', warmth: 1,
    color: C.WHITE.hex, style: 'formal', price: 49000, brand: 'LACOSTE',
    description: '클래식 폴로셔츠. 깔끔하고 단정한 캐주얼 룩을 완성해줍니다.',
    sizes: ['S','M','L','XL'],
    colors: [C.WHITE, C.DARK_NAVY, C.RED, C.GREEN, C.YELLOW],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_20.jpg',
  },

  // ── BOTTOM ────────────────────────────────────────────────
  {
    id: 'prod_9', name: '스키니 청바지', category: 'bottom', warmth: 2,
    color: C.DENIM.hex, style: 'street', price: 79000, brand: "LEVI'S",
    description: '슬림핏 데님 팬츠. 언제 어디서나 활용도 높은 기본 청바지.',
    sizes: ['28','30','32','34'],
    colors: [C.DENIM, C.BLACK, C.LIGHT_GRAY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_9.jpg',
  },
  {
    id: 'prod_10', name: '기모 스웨트팬츠', category: 'bottom', warmth: 3,
    color: C.GRAY.hex, style: 'sporty', price: 39000, brand: 'ADIDAS',
    description: '편안한 기모 트레이닝 팬츠. 실내외 모두 활용 가능한 편안한 핏.',
    sizes: ['S','M','L','XL'],
    colors: [C.GRAY, C.BLACK, C.DARK_NAVY, C.RED],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_10.jpg',
  },
  {
    id: 'prod_11', name: '슬랙스', category: 'bottom', warmth: 2,
    color: C.CHARCOAL.hex, style: 'formal', price: 69000, brand: 'ZARA',
    description: '정장용 슬림 슬랙스. 비즈니스 캐주얼부터 포멀 룩까지 완성.',
    sizes: ['28','30','32','34'],
    colors: [C.CHARCOAL, C.BLACK, C.DARK_NAVY, C.BEIGE, C.GRAY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_11.jpg',
  },
  {
    id: 'prod_12', name: '반바지', category: 'bottom', warmth: 1,
    color: C.BLUE.hex, style: 'casual', price: 35000, brand: 'H&M',
    description: '여름용 코튼 반바지. 시원하고 편안한 핏으로 더운 날에도 스타일리시하게.',
    sizes: ['S','M','L','XL'],
    colors: [C.BLUE, C.BLACK, C.BEIGE, C.KHAKI, C.WHITE],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_12.jpg',
  },
  {
    id: 'prod_21', name: '와이드 데님', category: 'bottom', warmth: 2,
    color: C.LIGHT_GRAY.hex, style: 'casual', price: 89000, brand: "LEVI'S",
    description: '여유로운 와이드 핏 데님. 오버사이즈 상의와 잘 어울려요.',
    sizes: ['28','30','32','34'],
    colors: [C.LIGHT_GRAY, C.DENIM, C.BLACK],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_21.jpg',
  },
  {
    id: 'prod_22', name: '카고 팬츠', category: 'bottom', warmth: 2,
    color: C.KHAKI.hex, style: 'street', price: 65000, brand: 'MUSINSA',
    description: '포켓 디테일의 카고 팬츠. 스트릿 룩의 핵심 아이템.',
    sizes: ['S','M','L','XL'],
    colors: [C.KHAKI, C.BLACK, C.BEIGE, C.GRAY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_22.jpg',
  },
  {
    id: 'prod_23', name: '린넨 와이드팬츠', category: 'bottom', warmth: 1,
    color: C.BEIGE.hex, style: 'minimal', price: 55000, brand: 'UNIQLO',
    description: '시원한 린넨 와이드팬츠. 여름에도 시원하고 세련된 실루엣.',
    sizes: ['S','M','L','XL'],
    colors: [C.BEIGE, C.WHITE, C.GRAY, C.MINT],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_23.jpg',
  },
  {
    id: 'prod_24', name: '미니스커트', category: 'bottom', warmth: 1,
    color: C.BLACK.hex, style: 'street', price: 39000, brand: 'ZARA',
    description: '캐주얼 데일리 미니스커트. 어느 상의와도 매칭이 잘 돼요.',
    sizes: ['XS','S','M','L'],
    colors: [C.BLACK, C.WHITE, C.DENIM, C.BURGUNDY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_24.jpg',
  },
  // ── 기존 샘플 옷장에서 쇼핑으로 이동 ─────────────────────
  {
    id: 'prod_25', name: '흰 티셔츠', category: 'top', warmth: 1,
    color: C.WHITE.hex, style: 'minimal', price: 19000, brand: 'UNIQLO',
    description: '깔끔한 기본 흰 티셔츠. 어떤 스타일에도 잘 어울리는 필수 아이템.',
    sizes: ['S','M','L','XL'],
    colors: [C.WHITE, C.LIGHT_GRAY, C.BLACK],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_7.jpg',
  },
  {
    id: 'prod_26', name: '검정 슬랙스', category: 'bottom', warmth: 2,
    color: C.BLACK.hex, style: 'formal', price: 59000, brand: 'ZARA',
    description: '단정하고 깔끔한 검정 슬랙스. 포멀과 캐주얼을 넘나드는 활용도.',
    sizes: ['28','30','32','34'],
    colors: [C.BLACK, C.CHARCOAL, C.DARK_NAVY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_11.jpg',
  },
  {
    id: 'prod_27', name: '울 코트', category: 'outer', warmth: 5,
    color: C.BEIGE.hex, style: 'formal', price: 199000, brand: 'H&M',
    description: '클래식한 울 혼방 코트. 겨울 필수 아우터.',
    sizes: ['S','M','L','XL'],
    colors: [C.BEIGE, C.CHARCOAL, C.BLACK, C.BURGUNDY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_1.jpg',
  },
  {
    id: 'prod_28', name: '트레이닝 팬츠', category: 'bottom', warmth: 3,
    color: C.CHARCOAL.hex, style: 'sporty', price: 39000, brand: 'NIKE',
    description: '편안한 트레이닝 팬츠. 운동부터 데일리까지 두루 활용 가능.',
    sizes: ['S','M','L','XL'],
    colors: [C.CHARCOAL, C.BLACK, C.DARK_NAVY, C.GRAY],
    inStock: true, isOwned: false, imageUrl: '/images/products/prod_10.jpg',
  },
];

// ── 헬퍼 함수 ────────────────────────────────────────────────
export const getProductsByCategory = (category: string): Product[] => {
  if (category === 'all') return mockProducts;
  return mockProducts.filter(p => p.category === category);
};

export const getProductById = (id: string): Product | undefined =>
  mockProducts.find(p => p.id === id);

export const getRecommendedProducts = (feelTemp: number, excludeIds: string[]): Product[] => {
  let targetWarmth: number;
  if (feelTemp < 5)       targetWarmth = 5;
  else if (feelTemp < 10) targetWarmth = 4;
  else if (feelTemp < 15) targetWarmth = 3;
  else if (feelTemp < 20) targetWarmth = 2;
  else                    targetWarmth = 1;

  return mockProducts
    .filter(p => !excludeIds.includes(p.id))
    .filter(p => Math.abs(p.warmth - targetWarmth) <= 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);
};
