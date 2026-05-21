import { WeatherData } from './weatherApi';

export interface UserPreference {
  coldSensitivity: number; // -2 (매우 추위를 탐) ~ 2 (매우 더위를 탐)
  activityLevel: 'low' | 'medium' | 'high';
  style: 'casual' | 'formal' | 'sporty';
}

export interface FeelTemperature {
  actual: number;
  perceived: number;
  adjustment: number;
}

// AI 모델 - 개인화된 체감 온도 예측
export function predictFeelTemperature(
  weather: WeatherData,
  userPref: UserPreference
): FeelTemperature {
  const { temperature, humidity, windSpeed } = weather;

  const humidityAdjustment = (humidity - 50) * 0.1;
  const windAdjustment = windSpeed * -0.3;
  const personalAdjustment = userPref.coldSensitivity * 2;
  const activityAdjustment =
    userPref.activityLevel === 'high' ? 3 :
    userPref.activityLevel === 'medium' ? 1 : 0;

  const totalAdjustment =
    humidityAdjustment + windAdjustment + personalAdjustment + activityAdjustment;

  return {
    actual: temperature,
    perceived: Math.round(temperature + totalAdjustment),
    adjustment: Math.round(totalAdjustment * 10) / 10,
  };
}

export interface ClothingItem {
  id: string;
  name: string;
  category: 'outer' | 'top' | 'bottom' | 'accessory';
  warmth: number; // 1 (매우 얇음) ~ 5 (매우 두꺼움)
  color: string;
  image?: string;
  isOwned: boolean;
  style: 'casual' | 'formal' | 'sporty' | 'street' | 'minimal';
}

export interface OutfitResult {
  items: ClothingItem[];
  colorReason: string;
}

// ─── 색상 조합 시스템 ──────────────────────────────────────

// 색상 그룹 (hex 기준)
const NEUTRAL = new Set(['#FFFFFF', '#1A1A1A', '#3D3D3D', '#8C8C8C', '#D4D4D4', '#D4B896']);
const EARTH   = new Set(['#7A7A52', '#7B4F2E', '#D4B896']);
const COOL    = new Set(['#1B2A4A', '#2980B9', '#74B9FF', '#5B7FA6']);
const WARM    = new Set(['#D63031', '#7D1935', '#E8A0BF', '#E17055', '#F6C90E']);
const NATURE  = new Set(['#27AE60', '#00B894', '#7A7A52']);

// 충돌 색상 쌍 (레드+핑크, 오렌지+퍼플 등)
const CLASH_PAIRS: [string, string][] = [
  ['#D63031', '#E8A0BF'],  // 레드 + 핑크
  ['#E17055', '#6C5CE7'],  // 오렌지 + 퍼플
  ['#D63031', '#E17055'],  // 레드 + 오렌지
  ['#F6C90E', '#E8A0BF'],  // 옐로우 + 핑크
  ['#D63031', '#6C5CE7'],  // 레드 + 퍼플
];

// hex → 한글 색상명 매핑
const COLOR_NAME: Record<string, string> = {
  '#FFFFFF': '화이트', '#1A1A1A': '블랙', '#3D3D3D': '차콜',
  '#8C8C8C': '그레이', '#D4D4D4': '라이트그레이', '#D4B896': '베이지',
  '#1B2A4A': '네이비', '#2980B9': '블루', '#74B9FF': '스카이블루',
  '#5B7FA6': '데님', '#7A7A52': '카키', '#7B4F2E': '브라운',
  '#D63031': '레드', '#7D1935': '버건디', '#E8A0BF': '핑크',
  '#27AE60': '그린', '#00B894': '민트', '#F6C90E': '옐로우',
  '#E17055': '오렌지', '#6C5CE7': '퍼플',
};

function isClash(h1: string, h2: string): boolean {
  return CLASH_PAIRS.some(([a, b]) => (a === h1 && b === h2) || (a === h2 && b === h1));
}

interface PairScore { score: number; tag: string; }

function scoreColorPair(h1: string, h2: string): PairScore {
  if (isClash(h1, h2))             return { score: -10, tag: 'clash' };
  if (NEUTRAL.has(h1) && NEUTRAL.has(h2)) return { score: 10, tag: 'neutral' };
  if (NEUTRAL.has(h1) !== NEUTRAL.has(h2)) return { score:  8, tag: 'point' };
  if (EARTH.has(h1)   && EARTH.has(h2))   return { score:  8, tag: 'earth' };
  if (COOL.has(h1)    && COOL.has(h2))    return { score:  7, tag: 'cool' };
  if (NATURE.has(h1)  && NATURE.has(h2))  return { score:  6, tag: 'nature' };
  if (h1 === h2)                           return { score:  6, tag: 'mono' };
  if (WARM.has(h1)    && WARM.has(h2))    return { score:  4, tag: 'warm' };
  return { score: 3, tag: '' };
}

function scoreOutfitColors(items: ClothingItem[]): number {
  if (items.length < 2) return 5;
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      total += scoreColorPair(items[i].color, items[j].color).score;
    }
  }
  return total;
}

function getColorReason(items: ClothingItem[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return `${COLOR_NAME[items[0].color] || ''} 컬러예요`.trim();

  // 모든 쌍 점수 계산
  const pairs: PairScore[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push(scoreColorPair(items[i].color, items[j].color));
    }
  }

  const totalScore = pairs.reduce((s, p) => s + p.score, 0);
  // 빈 tag 제거하고 가장 첫 번째 태그를 주 태그로 사용
  const tag = pairs.map(p => p.tag).find(t => t && t !== 'clash') || '';

  const names = items
    .map(i => COLOR_NAME[i.color])
    .filter(Boolean)
    .slice(0, 2)
    .join(' + ');

  if (totalScore < 0)  return `${names} 조합은 약간 튀는 포인트 스타일이에요`;
  if (tag === 'neutral') return `${names} 뉴트럴 조합으로 깔끔해요`;
  if (tag === 'point')   return `${names} 포인트 컬러 코디예요`;
  if (tag === 'earth')   return `${names} 어스톤 조합이에요`;
  if (tag === 'cool')    return `${names} 쿨톤 모노 조합이에요`;
  if (tag === 'mono')    return `${names} 모노톤 조합이에요`;
  if (tag === 'nature')  return `${names} 내추럴 조합이에요`;
  if (tag === 'warm')    return `${names} 웜톤 조합이에요`;
  return `${names} 조합이에요`;
}

// ─── 스타일 선호도 ──────────────────────────────────────────

function getUserPreferredStyles(): Record<string, number> {
  const feedbackHistory = localStorage.getItem('feedbackHistory');
  if (!feedbackHistory) return {};

  const feedback = JSON.parse(feedbackHistory);
  const styleCount: Record<string, number> = {};

  feedback
    .filter((f: any) => f.rating === 'perfect')
    .forEach((f: any) => {
      if (f.outfitStyles) {
        f.outfitStyles.forEach((style: string) => {
          styleCount[style] = (styleCount[style] || 0) + 1;
        });
      }
    });

  return styleCount;
}

// ─── 코디 추천 ──────────────────────────────────────────────

export function recommendOutfit(
  feelTemp: number,
  wardrobe: ClothingItem[],
  seed?: number,
  shopFallback: ClothingItem[] = []  // 옷장 부족 시 보완할 쇼핑 상품 목록
): OutfitResult {
  // 매번 다른 조합: seed 없으면 Date.now() 사용
  const s = seed ?? Date.now();

  // 옷장이 부족하면 쇼핑 상품으로 보완 (isOwned: false)
  const shopItems: ClothingItem[] = shopFallback.map(p => ({ ...p, isOwned: false }));

  // 카테고리별 후보 풀: 옷장 아이템 우선, 2개 미만이면 쇼핑 보완
  const getCandidates = (cat: string): ClothingItem[] => {
    const owned = wardrobe.filter(i => i.category === cat);
    if (owned.length >= 2) return owned;
    const shop = shopItems.filter(i => i.category === cat);
    return [...owned, ...shop];
  };

  // 시드 기반 셔플 (새로고침마다 다른 조합)
  const shuffleWithSeed = (arr: ClothingItem[]): ClothingItem[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.abs((s * (i + 1) * 2654435761) % (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // warmth 범위 필터 (범위 내 없으면 전체 반환으로 폴백)
  const filterWarmth = (items: ClothingItem[], min: number, max = 5): ClothingItem[] => {
    const filtered = items.filter(i => i.warmth >= min && i.warmth <= max);
    return filtered.length > 0 ? filtered : items;
  };

  // 스타일 선호도 점수
  const preferredStyles = getUserPreferredStyles();
  const sortedStyles = Object.entries(preferredStyles)
    .sort(([, a], [, b]) => b - a)
    .map(([style]) => style);
  const styleScore = (item: ClothingItem) => {
    const idx = sortedStyles.indexOf(item.style);
    return idx >= 0 ? sortedStyles.length - idx : 0;
  };

  // 카테고리별 상위 N개 후보 추출 (셔플 + 스타일 선호 반영)
  const pickCandidates = (
    cat: string, n: number, minW: number, maxW = 5
  ): ClothingItem[] => {
    const filtered = filterWarmth(getCandidates(cat), minW, maxW);
    return shuffleWithSeed(filtered)
      .sort((a, b) => styleScore(b) - styleScore(a))
      .slice(0, n);
  };

  // 날씨 조건
  const needOuter = feelTemp < 15;
  const outerMinW = feelTemp < 5 ? 5 : feelTemp < 10 ? 4 : 3;
  const topMinW   = needOuter ? 1 : (feelTemp < 10 ? 3 : feelTemp < 20 ? 2 : 1);
  const topMaxW   = needOuter ? 3 : 5;
  const botMinW   = feelTemp < 10 ? 2 : 1;

  const outerCands  = needOuter ? pickCandidates('outer',  3, outerMinW) : [];
  const topCands    = pickCandidates('top',    3, topMinW, topMaxW);
  const bottomCands = pickCandidates('bottom', 3, botMinW);

  // 후보 조합 중 색상 점수가 가장 높은 코디 선택
  const outerLoop  = needOuter && outerCands.length > 0 ? outerCands : [null];
  const topLoop    = topCands.length > 0 ? topCands : [null];
  const bottomLoop = bottomCands.length > 0 ? bottomCands : [null];

  let bestItems: ClothingItem[] = [];
  let bestScore = -Infinity;

  for (const outer of outerLoop) {
    for (const top of topLoop) {
      for (const bottom of bottomLoop) {
        const combo = [outer, top, bottom].filter(Boolean) as ClothingItem[];
        if (combo.length === 0) continue;
        const sc = scoreOutfitColors(combo);
        if (sc > bestScore) { bestScore = sc; bestItems = combo; }
      }
    }
  }

  // 아무것도 없으면 옷장/쇼핑 전체에서 fallback
  if (bestItems.length === 0) {
    const fallback = [...wardrobe, ...shopItems];
    const top = fallback.find(i => i.category === 'top');
    if (top) bestItems = [top];
  }

  return { items: bestItems, colorReason: getColorReason(bestItems) };
}

// ─── 구매 제안 ──────────────────────────────────────────────

export function suggestPurchase(
  feelTemp: number,
  currentOutfit: ClothingItem[]
): ClothingItem[] {
  const suggestions: ClothingItem[] = [];

  if (feelTemp < 15 && !currentOutfit.some(item => item.category === 'outer')) {
    suggestions.push({
      id: 'suggest_outer_1',
      name: '따뜻한 패딩 점퍼',
      category: 'outer',
      warmth: 5,
      color: '#2C3E50',
      isOwned: false,
      style: 'casual',
    });
  }

  if (!currentOutfit.some(item => item.category === 'top')) {
    suggestions.push({
      id: 'suggest_top_1',
      name: feelTemp < 15 ? '기모 맨투맨' : '반팔 티셔츠',
      category: 'top',
      warmth: feelTemp < 15 ? 3 : 1,
      color: '#ECF0F1',
      isOwned: false,
      style: 'casual',
    });
  }

  return suggestions;
}
