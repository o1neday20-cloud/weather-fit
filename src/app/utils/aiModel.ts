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
  
  // 습도에 따른 보정 (습도가 높으면 더 덥게 느껴짐)
  const humidityAdjustment = (humidity - 50) * 0.1;
  
  // 풍속에 따른 보정 (바람이 강하면 더 춥게 느껴짐)
  const windAdjustment = windSpeed * -0.3;
  
  // 개인 성향에 따른 보정
  const personalAdjustment = userPref.coldSensitivity * 2;
  
  // 활동량에 따른 보정
  const activityAdjustment = 
    userPref.activityLevel === 'high' ? 3 :
    userPref.activityLevel === 'medium' ? 1 : 0;
  
  const totalAdjustment = 
    humidityAdjustment + 
    windAdjustment + 
    personalAdjustment + 
    activityAdjustment;
  
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

// 사용자의 선호 스타일 분석
function getUserPreferredStyles(): { [key: string]: number } {
  const feedbackHistory = localStorage.getItem('feedbackHistory');
  if (!feedbackHistory) return {};

  const feedback = JSON.parse(feedbackHistory);
  const styleCount: { [key: string]: number } = {};

  // 'perfect' 평가를 받은 피드백에서 스타일 집계
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

// 체감 온도에 따른 옷차림 추천
export function recommendOutfit(
  feelTemp: number,
  wardrobe: ClothingItem[]
): ClothingItem[] {
  const recommendation: ClothingItem[] = [];

  // 온도 범위별 필요 보온도
  let requiredWarmth: number;
  if (feelTemp < 5) requiredWarmth = 14; // 매우 추움
  else if (feelTemp < 10) requiredWarmth = 12; // 추움
  else if (feelTemp < 15) requiredWarmth = 9; // 쌀쌀함
  else if (feelTemp < 20) requiredWarmth = 6; // 선선함
  else if (feelTemp < 25) requiredWarmth = 4; // 따뜻함
  else requiredWarmth = 2; // 더움

  // 카테고리별로 아이템 선택
  const ownedItems = wardrobe.filter(item => item.isOwned);

  // 사용자의 선호 스타일 가져오기
  const preferredStyles = getUserPreferredStyles();
  const sortedStyles = Object.entries(preferredStyles)
    .sort(([, a], [, b]) => b - a)
    .map(([style]) => style);

  // 스타일 선호도에 따라 아이템 정렬하는 함수
  const sortByStylePreference = (items: ClothingItem[]) => {
    return items.sort((a, b) => {
      const aIndex = sortedStyles.indexOf(a.style);
      const bIndex = sortedStyles.indexOf(b.style);
      const aScore = aIndex >= 0 ? sortedStyles.length - aIndex : 0;
      const bScore = bIndex >= 0 ? sortedStyles.length - bIndex : 0;
      return bScore - aScore;
    });
  };

  // 외투 선택
  const outers = ownedItems.filter(item => item.category === 'outer');
  if (feelTemp < 15 && outers.length > 0) {
    const suitableOuters = outers.filter(item => item.warmth >= 3);
    if (suitableOuters.length > 0) {
      const sorted = sortByStylePreference(suitableOuters);
      recommendation.push(sorted[0]);
    }
  }

  // 상의 선택
  const tops = ownedItems.filter(item => item.category === 'top');
  if (tops.length > 0) {
    const neededWarmth = Math.max(2, requiredWarmth - (recommendation.length > 0 ? recommendation[0].warmth : 0));
    const suitableTops = tops.filter(item => item.warmth >= neededWarmth / 2);
    const targetTops = suitableTops.length > 0 ? suitableTops : tops;
    const sorted = sortByStylePreference(targetTops);
    recommendation.push(sorted[0]);
  }

  // 하의 선택
  const bottoms = ownedItems.filter(item => item.category === 'bottom');
  if (bottoms.length > 0) {
    const sorted = sortByStylePreference(bottoms);
    recommendation.push(sorted[0]);
  }

  return recommendation;
}

// 추천 코디가 부족할 때 구매 제안
export function suggestPurchase(
  feelTemp: number,
  currentOutfit: ClothingItem[]
): ClothingItem[] {
  const suggestions: ClothingItem[] = [];

  // 외투가 없고 추운 날씨일 때
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

  // 상의가 없을 때
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
