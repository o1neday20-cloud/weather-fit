import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Navigation from '../components/Navigation';
import WeatherCard from '../components/WeatherCard';
import ClothingItem from '../components/ClothingItem';
import { getCurrentWeather, WeatherData } from '../utils/weatherApi';
import { predictFeelTemperature, recommendOutfit, ClothingItem as ClothingItemType, UserPreference } from '../utils/aiModel';
import { Logger } from '../utils/logger';
import { wardrobeKey } from '../utils/storage';
import { Sparkles, TrendingUp, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { mockProducts } from '../utils/products';

// 로컬 products.ts 기준 imageUrl 조회 (DB image_url 오류 방지)
const LOCAL_IMAGE_MAP = new Map(mockProducts.map(p => [p.id, p.imageUrl]));

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.135/api';

interface OutfitSet {
  items: ClothingItemType[];
  colorReason: string;
  label: string;       // 캐주얼 / 포멀 / 스포티
  emoji: string;
}

export default function Home() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [feelTemp, setFeelTemp] = useState<number>(0);
  const [outfitSets, setOutfitSets] = useState<OutfitSet[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    Logger.log('page_view', { page: 'home' });
  }, []);

  const loadData = async () => {
    setLoading(true);

    // DB 상품 목록 조회 (코디 추천용 shopFallback)
    let shopFallback: (ClothingItemType & { imageUrl?: string })[] = [];
    try {
      const res = await fetch(`${API_BASE}/products`);
      if (res.ok) {
        const rows = await res.json();
        shopFallback = rows
          .filter((row: any) => (row.category || '').toLowerCase() !== 'accessory')
          .filter((row: any) => LOCAL_IMAGE_MAP.has(row.product_id ?? `prod_${row.id}`))
          .map((row: any) => ({
            id:       row.product_id ?? `prod_${row.id}`,
            name:     row.name || row.product_name || '',
            category: (row.category || 'top').toLowerCase() as ClothingItemType['category'],
            warmth:   Number(row.warmth) || 1,
            color:    '#9CA3AF',
            style:    (row.style || 'casual').toLowerCase() as ClothingItemType['style'],
            isOwned:  false,
            // 로컬 이미지 우선 (DB image_url이 잘못된 경우 방지)
          imageUrl: LOCAL_IMAGE_MAP.get(row.product_id ?? `prod_${row.id}`) || row.image_url || undefined,
          }));
      }
    } catch { /* API 실패 시 빈 배열 유지 */ }

    // 날씨 데이터 가져오기
    const weatherData = await getCurrentWeather();
    setWeather(weatherData);

    // 사용자 설정
    const userPrefString = localStorage.getItem('userPreference');
    const userPref: UserPreference = userPrefString
      ? JSON.parse(userPrefString)
      : { coldSensitivity: 0, activityLevel: 'medium', style: 'casual' };

    // 체감 온도 예측
    const tempPrediction = predictFeelTemperature(weatherData, userPref);
    setFeelTemp(tempPrediction.perceived);

    // 옷장 데이터 (악세서리 제외)
    const wardrobeString = localStorage.getItem(wardrobeKey());
    const wardrobeRaw: ClothingItemType[] = wardrobeString ? JSON.parse(wardrobeString) : [];
    const wardrobe = wardrobeRaw.filter(
      (w: any) => (w.category || '').toLowerCase() !== 'accessory'
    );

    // 3가지 코디 세트 생성 — 앞 세트에서 쓴 아이템을 다음 세트 후보에서 제외
    const seed = Date.now();
    const STYLE_META = [
      { label: '캐주얼', emoji: '👕' },
      { label: '포멀',   emoji: '👔' },
      { label: '스포티', emoji: '🏃' },
    ];
    const excludedIds = new Set<string>();
    const sets: OutfitSet[] = STYLE_META.map(({ label, emoji }, i) => {
      const availShop     = shopFallback.filter(p => !excludedIds.has(p.id));
      const availWardrobe = wardrobe.filter(w => !excludedIds.has(w.id));
      const result = recommendOutfit(
        tempPrediction.perceived, availWardrobe, seed + i * 99991, availShop
      );
      result.items.forEach(item => excludedIds.add(item.id));
      return { ...result, label, emoji };
    });
    setOutfitSets(sets);

    // 첫 번째 코디를 피드백용으로 저장
    if (sets.length > 0) {
      localStorage.setItem('currentRecommendedOutfit', JSON.stringify(sets[0].items));
    }

    Logger.log('weather_check', {
      temperature: weatherData.temperature,
      feelTemperature: tempPrediction.perceived,
      adjustment: tempPrediction.adjustment,
      location: weatherData.location,
    });

    setLoading(false);
  };

  const toggleSet = (idx: number) => {
    setExpandedIdx(prev => (prev === idx ? null : idx));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-16">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">오늘의 옷차림</h1>
            <p className="text-sm text-gray-600 mt-1">AI 기반 개인화 추천</p>
          </div>
          <Link to="/settings">
            <Settings className="w-6 h-6 text-gray-600 hover:text-gray-900" />
          </Link>
        </div>

        {/* 날씨 카드 */}
        {weather && (
          <div className="mb-6">
            <WeatherCard weather={weather} feelTemp={feelTemp} />
          </div>
        )}

        {/* 체감 온도 분석 */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">AI 체감 온도 분석</h2>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            실제 기온 <span className="font-semibold text-gray-900">{weather?.temperature}°C</span>이지만,
            당신의 체질과 환경을 고려하면 <span className="font-semibold text-blue-600">{feelTemp}°C</span>로 느껴질 것입니다.
          </p>
          <div className="text-xs text-gray-500">
            습도 {weather?.humidity}%, 풍속 {weather?.windSpeed}m/s 반영
          </div>
        </div>

        {/* 오늘의 추천 코디 — 3 세트 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              <h2 className="font-semibold text-gray-900">오늘의 추천 코디</h2>
            </div>
            <Link to="/outfit" className="text-sm text-blue-600 hover:text-blue-700">
              더보기
            </Link>
          </div>

          {outfitSets.length > 0 ? (
            <div className="space-y-3">
              {outfitSets.map((set, idx) => {
                const isOpen = expandedIdx === idx;
                // 대표 이미지: imageUrl이 있는 첫 번째 아이템 사용
                const repItem = set.items.find((i: any) => i.imageUrl) as any;
                const repImage: string | undefined = repItem?.imageUrl;

                return (
                  <div
                    key={idx}
                    className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100"
                  >
                    {/* 카드 헤더 — 클릭으로 펼치기/접기 */}
                    <button
                      type="button"
                      onClick={() => toggleSet(idx)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      {/* 대표 이미지 */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {repImage ? (
                          <img
                            src={repImage}
                            alt={set.label}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">
                            {set.emoji}
                          </div>
                        )}
                      </div>

                      {/* 코디 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-white bg-blue-500 rounded-full px-2 py-0.5">
                            코디 {idx + 1}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">
                            {set.emoji} {set.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{set.colorReason}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {set.items.length}가지 아이템
                          {set.items.some((i: any) => !i.isOwned) && (
                            <span className="ml-1 text-orange-400">· 쇼핑 추천 포함</span>
                          )}
                        </p>
                      </div>

                      {/* 펼치기 아이콘 */}
                      <div className="flex-shrink-0 text-gray-400">
                        {isOpen
                          ? <ChevronUp className="w-5 h-5" />
                          : <ChevronDown className="w-5 h-5" />
                        }
                      </div>
                    </button>

                    {/* 펼쳐진 아이템 목록 */}
                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {set.items.map((item) => (
                            <ClothingItem
                              key={item.id}
                              item={item}
                              showActions={false}
                            />
                          ))}
                        </div>
                        {set.items.some((i: any) => !i.isOwned) && (
                          <p className="text-xs text-orange-500 mt-3 text-center">
                            🛍️ 주황색 아이템은 옷장에 없어 쇼핑몰에서 추천된 상품이에요
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-600 mb-4">추천할 상품을 불러오는 중...</p>
              <Link
                to="/wardrobe"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Sparkles className="w-4 h-4" />
                옷장 관리하기
              </Link>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link
            to="/feedback"
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-center"
          >
            <div className="text-3xl mb-2">💬</div>
            <div className="font-medium text-gray-900">피드백 남기기</div>
            <div className="text-xs text-gray-500 mt-1">추천 정확도 향상</div>
          </Link>

          <Link
            to="/wardrobe"
            className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow text-center"
          >
            <div className="text-3xl mb-2">👔</div>
            <div className="font-medium text-gray-900">옷장 관리</div>
            <div className="text-xs text-gray-500 mt-1">내 옷 등록하기</div>
          </Link>
        </div>
      </div>

      <Navigation />
    </div>
  );
}
