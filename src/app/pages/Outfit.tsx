import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Navigation from '../components/Navigation';
import ClothingItem from '../components/ClothingItem';
import { getCurrentWeather, WeatherData } from '../utils/weatherApi';
import { predictFeelTemperature, recommendOutfit, ClothingItem as ClothingItemType, UserPreference } from '../utils/aiModel';
import { Logger } from '../utils/logger';
import { wardrobeKey } from '../utils/storage';
import { Sparkles, RefreshCw, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';
import { mockProducts } from '../utils/products';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.135/api';

// 로컬 products.ts 기준 imageUrl 조회 (DB image_url 오류 방지)
const LOCAL_IMAGE_MAP = new Map(mockProducts.map(p => [p.id, p.imageUrl]));

interface OutfitSet {
  items: ClothingItemType[];
  colorReason: string;
  label: string;
  emoji: string;
}

/** API 상품 응답을 ClothingItemType 호환 형태로 변환 */
function mapApiProduct(row: any): ClothingItemType & { imageUrl?: string } {
  return {
    id:       row.product_id ?? `prod_${row.id}`,
    name:     row.name || row.product_name || '',
    category: (row.category || 'top').toLowerCase() as ClothingItemType['category'],
    warmth:   Number(row.warmth) || 1,
    color:    '#9CA3AF',
    style:    (row.style || 'casual').toLowerCase() as ClothingItemType['style'],
    isOwned:  false,
    // 로컬 이미지 우선 (DB image_url이 잘못된 경우 방지)
    imageUrl: LOCAL_IMAGE_MAP.get(row.product_id ?? `prod_${row.id}`) || row.image_url || undefined,
  };
}

/** 체감온도 기준 목표 보온성 범위 반환 */
function getWarmthRange(feelTemp: number): { min: number; max: number } {
  if (feelTemp >= 25) return { min: 1, max: 2 };
  if (feelTemp >= 15) return { min: 2, max: 3 };
  return { min: 4, max: 5 };
}

export default function Outfit() {
  const [weather, setWeather]                   = useState<WeatherData | null>(null);
  const [feelTemp, setFeelTemp]                 = useState<number>(0);
  const [outfitSets, setOutfitSets]             = useState<OutfitSet[]>([]);
  const [expandedIdx, setExpandedIdx]           = useState<number | null>(0); // 첫 번째 세트 기본 펼침
  const [purchaseSuggestions, setPurchaseSuggestions] = useState<(ClothingItemType & { imageUrl?: string })[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [dbProducts, setDbProducts]             = useState<(ClothingItemType & { imageUrl?: string })[]>([]);
  const [recommendSeed, setRecommendSeed]       = useState(Date.now());

  useEffect(() => {
    loadRecommendations(recommendSeed);
    Logger.log('page_view', { page: 'outfit' });
  }, []);

  const loadRecommendations = async (seed: number) => {
    setLoading(true);
    try {
      // DB 상품 목록 조회 (이미 캐시된 경우 재사용)
      let shopProducts = dbProducts;
      if (shopProducts.length === 0) {
        try {
          const res = await fetch(`${API_BASE}/products`);
          if (res.ok) {
            const rows = await res.json();
            shopProducts = rows.map(mapApiProduct);
            setDbProducts(shopProducts);
          }
        } catch {
          // API 실패 시 빈 배열 유지
        }
      }
      // 악세서리는 코디 추천에서 제외
      const shopFallback = shopProducts.filter(
        (p: any) => (p.category || '').toLowerCase() !== 'accessory'
      );

      // 날씨 API (3초 타임아웃 → 캐시 폴백)
      const cachedWeather = localStorage.getItem('lastWeather');
      const fallbackWeather: WeatherData = cachedWeather
        ? JSON.parse(cachedWeather)
        : { temperature: 20, humidity: 50, windSpeed: 2, condition: '맑음', location: '서울 기준 날씨' };

      let weatherData: WeatherData;
      try {
        weatherData = await Promise.race([
          getCurrentWeather(),
          new Promise<WeatherData>((_, reject) =>
            setTimeout(() => reject(new Error('weather_timeout')), 3000)
          ),
        ]);
      } catch {
        weatherData = fallbackWeather;
      }
      setWeather(weatherData);

      const userPrefString = localStorage.getItem('userPreference');
      const userPref: UserPreference = userPrefString
        ? JSON.parse(userPrefString)
        : { coldSensitivity: 0, activityLevel: 'medium', style: 'casual' };

      const tempPrediction = predictFeelTemperature(weatherData, userPref);
      setFeelTemp(tempPrediction.perceived);

      // 옷장 (악세서리 제외)
      const wardrobeString = localStorage.getItem(wardrobeKey());
      const wardrobeRaw: ClothingItemType[] = wardrobeString ? JSON.parse(wardrobeString) : [];
      const wardrobe: ClothingItemType[] = wardrobeRaw.filter(
        (w: any) => (w.category || '').toLowerCase() !== 'accessory'
      );

      // ── 3가지 코디 세트 생성 — 앞 세트에서 쓴 아이템을 다음 세트 후보에서 제외
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
      setExpandedIdx(0); // 새로고침 시 첫 번째 펼침

      // ── 추천 상품: 체감온도 기준 보온성 범위 필터 + 범위 내 정렬 ──
      const ownedIds = wardrobe.map(item => item.id);
      const { min: warmMin, max: warmMax } = getWarmthRange(tempPrediction.perceived);

      // 1차: 범위 내 상품 (보온성 차이 오름차순)
      const inRange = shopFallback
        .filter(p => !ownedIds.includes(p.id) && p.warmth >= warmMin && p.warmth <= warmMax)
        .sort((a, b) => Math.abs(a.warmth - (warmMin + warmMax) / 2) - Math.abs(b.warmth - (warmMin + warmMax) / 2));

      // 2차: 범위 밖 상품 (부족한 경우 보완, 보온성 거리 기준)
      const outRange = shopFallback
        .filter(p => !ownedIds.includes(p.id) && (p.warmth < warmMin || p.warmth > warmMax))
        .sort((a, b) => Math.abs(a.warmth - (warmMin + warmMax) / 2) - Math.abs(b.warmth - (warmMin + warmMax) / 2));

      const suggestions = [...inRange, ...outRange].slice(0, 6);
      setPurchaseSuggestions(suggestions);

      Logger.log('outfit_generated', {
        feelTemperature: tempPrediction.perceived,
        outfitCount: sets.reduce((n, s) => n + s.items.length, 0),
        suggestionsCount: suggestions.length,
        location: weatherData.location,
      });
    } catch (e) {
      console.error('[Outfit] 로딩 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSet = (idx: number) => {
    setExpandedIdx(prev => (prev === idx ? null : idx));
  };

  const handleRefresh = () => {
    const s = Date.now();
    setRecommendSeed(s);
    loadRecommendations(s);
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
            <h1 className="text-2xl font-bold text-gray-900">코디 추천</h1>
            <p className="text-sm text-gray-600 mt-1">체감온도 {feelTemp}°C 기준</p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
        </div>

        {/* AI 추천 설명 */}
        <div className="bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl p-4 mb-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-semibold">AI 추천 분석</h2>
          </div>
          <p className="text-sm opacity-90">
            오늘 기온은 {weather?.temperature}°C이지만, 습도와 풍속을 고려하면
            당신에게는 <span className="font-bold">{feelTemp}°C</span>로 느껴질 것입니다.
          </p>
        </div>

        {/* 3가지 코디 세트 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {outfitSets.some(s => s.items.some(i => i.isOwned))
              ? '내 옷장에서 선택한 코디'
              : '오늘 날씨에 맞는 추천 코디'}
          </h2>

          {outfitSets.length > 0 ? (
            <div className="space-y-3">
              {outfitSets.map((set, idx) => {
                const isOpen = expandedIdx === idx;
                const repItem = set.items.find((i: any) => i.imageUrl) as any;
                const repImage: string | undefined = repItem?.imageUrl;

                return (
                  <div key={idx} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                    {/* 카드 헤더 */}
                    <button
                      type="button"
                      onClick={() => toggleSet(idx)}
                      className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      {/* 대표 이미지 */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                        {repImage ? (
                          <img src={repImage} alt={set.label} className="w-full h-full object-cover" />
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

                      <div className="flex-shrink-0 text-gray-400">
                        {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </button>

                    {/* 펼쳐진 아이템 목록 */}
                    {isOpen && (
                      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                        {set.colorReason && (
                          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-purple-50 rounded-xl border border-purple-100">
                            <span className="text-purple-400 text-sm">✨</span>
                            <p className="text-sm text-purple-700 font-medium">{set.colorReason}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {set.items.map((item) => (
                            <ClothingItem key={item.id} item={item} showActions={false} />
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
            <div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
                <span className="text-amber-500">👗</span>
                <p className="text-sm text-amber-700">
                  옷장이 비어있어요. 오늘 날씨에 어울리는 쇼핑 상품을 추천해드릴게요!
                </p>
              </div>
              <Link
                to="/shop"
                className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
              >
                <ShoppingBag className="w-4 h-4" />
                쇼핑하러 가기
              </Link>
            </div>
          )}
        </div>

        {/* 오늘 날씨에 어울리는 추천 상품 */}
        {purchaseSuggestions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  오늘 날씨에 어울리는 추천 상품
                </h2>
              </div>
              <Link to="/shop" className="text-sm text-blue-600 hover:text-blue-700">더보기</Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {purchaseSuggestions.map((item) => (
                <Link key={item.id} to={`/product/${item.id}`}>
                  <ClothingItem item={item} showActions={false} />
                </Link>
              ))}
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mt-4">
              <p className="text-sm text-blue-900">
                💡 <strong>팁:</strong> 쇼핑몰에서 구매한 상품은 자동으로 내 옷장에 추가할 수 있어요!
              </p>
            </div>
          </div>
        )}

        {/* 온도별 가이드 */}
        <div className="mt-6 bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-3">온도별 옷차림 가이드</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">5°C 이하</span>
              <span className="text-gray-900">패딩, 두꺼운 코트, 목도리</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">5°C ~ 10°C</span>
              <span className="text-gray-900">코트, 가죽자켓, 니트</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">10°C ~ 15°C</span>
              <span className="text-gray-900">자켓, 후드, 긴팔</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">15°C ~ 20°C</span>
              <span className="text-gray-900">얇은 가디건, 맨투맨, 청바지</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-600">20°C 이상</span>
              <span className="text-gray-900">반팔, 반바지, 원피스</span>
            </div>
          </div>
        </div>

      </div>
      <Navigation />
    </div>
  );
}
