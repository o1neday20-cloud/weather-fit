import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Navigation from '../components/Navigation';
import ClothingItem from '../components/ClothingItem';
import {
  getCurrentWeather,
  getWeeklyForecast,
  searchLocations,
  WeatherData,
  WeeklyForecast
} from '../utils/weatherApi';
import { predictFeelTemperature, recommendOutfit, ClothingItem as ClothingItemType, UserPreference } from '../utils/aiModel';
import { mockProducts } from '../utils/products';
import { Logger } from '../utils/logger';
import { wardrobeKey } from '../utils/storage';
import { MapPin, Search, Cloud, CloudRain, CloudSnow, CloudFog, Sun, ChevronRight } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.135/api';

// 로컬 products.ts 기준 imageUrl 조회 (DB image_url 오류 방지)
const LOCAL_IMAGE_MAP = new Map(mockProducts.map(p => [p.id, p.imageUrl]));

/** 날짜 문자열 → 잘 분산된 32-bit hash seed (FNV-1a) */
function hashDate(dateStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    h = Math.imul(h ^ dateStr.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

export default function Weather() {
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [weeklyForecast, setWeeklyForecast] = useState<WeeklyForecast[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDayOutfit, setSelectedDayOutfit] = useState<ClothingItemType[]>([]);
  // 날짜별 사전 생성 코디 (key: 날짜 문자열)
  const [weeklyOutfits, setWeeklyOutfits] = useState<Map<string, ClothingItemType[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    loadWeatherData();
    Logger.log('page_view', { page: 'weather' });
  }, []);

  const loadWeatherData = async (location?: string) => {
    setLoading(true);
    try {
      const [weather, forecast] = await Promise.all([
        getCurrentWeather(location),
        getWeeklyForecast(location),
      ]);

      setCurrentWeather(weather);
      setWeeklyForecast(forecast);

      // ── DB 상품 조회 (코디 추천용, 실패 시 mockProducts 폴백) ──
      let shopFallback: ClothingItemType[] = mockProducts.filter(
        p => (p.category || '').toLowerCase() !== 'accessory'
      );
      try {
        const res = await fetch(`${API_BASE}/products`);
        if (res.ok) {
          const rows = await res.json();
          const dbProducts = rows
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
              imageUrl: LOCAL_IMAGE_MAP.get(row.product_id ?? `prod_${row.id}`) || row.image_url || undefined,
            }));
          if (dbProducts.length > 0) shopFallback = dbProducts;
        }
      } catch { /* API 실패 시 mockProducts 사용 */ }

      // ── 사용자 설정 / 옷장 ──
      const userPrefString = localStorage.getItem('userPreference');
      const userPref: UserPreference = userPrefString
        ? JSON.parse(userPrefString)
        : { coldSensitivity: 0, activityLevel: 'medium', style: 'casual' };

      const wardrobeRaw: ClothingItemType[] = JSON.parse(localStorage.getItem(wardrobeKey()) || '[]');
      const wardrobe = wardrobeRaw.filter(
        (w: any) => (w.category || '').toLowerCase() !== 'accessory'
      );

      // ── 7일치 코디 사전 생성 (앞 날짜에서 쓴 아이템을 다음 날짜에서 제외) ──
      const excludedIds = new Set<string>();
      const outfitMap = new Map<string, ClothingItemType[]>();

      for (const day of forecast) {
        const dayWeather: WeatherData = {
          temperature: day.temperature.max,
          humidity:    day.humidity,
          windSpeed:   day.windSpeed,
          condition:   day.condition,
          location:    weather.location,
          date:        day.date,
        };
        const tempPrediction = predictFeelTemperature(dayWeather, userPref);
        const availWardrobe  = wardrobe.filter(w => !excludedIds.has(w.id));
        const availShop      = shopFallback.filter(p => !excludedIds.has(p.id));

        // 풀이 소진되면 전체 재사용 (7일 × 2~3벌 = 최대 21개 필요)
        const finalWardrobe = availWardrobe.length > 0 ? availWardrobe : wardrobe;
        const finalShop     = availShop.length > 0     ? availShop     : shopFallback;

        const result = recommendOutfit(
          tempPrediction.perceived,
          finalWardrobe,
          hashDate(day.date),
          finalShop,
        );
        result.items.forEach(item => excludedIds.add(item.id));
        outfitMap.set(day.date, result.items);
      }

      setWeeklyOutfits(outfitMap);

      // 첫 번째 날짜 자동 선택
      if (forecast.length > 0) {
        setSelectedDate(forecast[0].date);
        setSelectedDayOutfit(outfitMap.get(forecast[0].date) || []);
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }

    if (location) {
      localStorage.setItem('userLocation', location);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    setSearchLoading(true);
    try {
      const results = await searchLocations(query);
      setSearchResults(results);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleLocationSelect = (location: string) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    loadWeatherData(location);
  };

  const handleDateSelect = (forecast: WeeklyForecast) => {
    setSelectedDate(forecast.date);
    setSelectedDayOutfit(weeklyOutfits.get(forecast.date) || []);

    Logger.log('forecast_selected', {
      date:        forecast.date,
      temperature: forecast.temperature.max,
    });
  };

  const getWeatherIcon = (condition: string) => {
    if (condition.includes('비'))               return <CloudRain className="w-6 h-6 text-blue-500" />;
    if (condition.includes('눈'))               return <CloudSnow className="w-6 h-6 text-blue-300" />;
    if (condition.includes('흐림') || condition.includes('구름')) return <Cloud className="w-6 h-6 text-gray-400" />;
    if (condition.includes('안개'))             return <CloudFog className="w-6 h-6 text-gray-500" />;
    if (condition.includes('맑음'))             return <Sun className="w-6 h-6 text-yellow-500" />;
    return <Cloud className="w-6 h-6 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-16">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-500 text-sm">기상청 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">

        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">날씨 정보</h1>
          <p className="text-sm text-gray-600 mt-1">기상청 실시간 단기 및 중기 예보</p>
        </div>

        {/* 현재 위치 및 검색 */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">
                {currentWeather?.location || '위치 정보 없음'}
              </span>
            </div>
            <button
              onClick={() => {
                const next = !showSearch;
                setShowSearch(next);
                if (next) handleSearch('');
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium transition-colors"
            >
              <Search className="w-4 h-4" />
              지역 변경
            </button>
          </div>

          {showSearch && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="지역 입력 (예: 홍천, 강남구, 제주)"
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  autoFocus
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <div className="mt-2 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                {searchLoading ? (
                  <div className="px-4 py-3 text-sm text-gray-400 text-center">검색 중...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((location, index) => (
                    <button
                      key={index}
                      onClick={() => handleLocationSelect(location)}
                      className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b last:border-b-0 text-sm text-gray-700 flex items-center gap-2"
                    >
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {location}
                    </button>
                  ))
                ) : searchQuery.length > 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-400 text-center">검색 결과가 없습니다</div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* 현재 날씨 카드 */}
        {currentWeather && (
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl p-6 text-white mb-8 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Sun className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <div className="text-sm font-medium opacity-80 mb-2">현재 날씨</div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-6xl font-bold tracking-tighter">{currentWeather.temperature}</span>
                    <span className="text-2xl font-light">°C</span>
                  </div>
                  <div className="mt-2 text-lg font-medium">{currentWeather.condition}</div>
                </div>
                <div className="bg-white/20 p-3 rounded-full backdrop-blur-md">
                  {getWeatherIcon(currentWeather.condition)}
                </div>
              </div>
              <div className="flex gap-6 mt-6 pt-4 border-t border-white/20 text-sm">
                <div className="flex flex-col">
                  <span className="opacity-60 text-xs">습도</span>
                  <span className="font-semibold">{currentWeather.humidity}%</span>
                </div>
                <div className="flex flex-col">
                  <span className="opacity-60 text-xs">풍속</span>
                  <span className="font-semibold">{currentWeather.windSpeed}m/s</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 주간 예보 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">주간 예보</h2>
            <span className="text-xs text-gray-400 font-normal">*기상청 중기예보 기준</span>
          </div>

          <div className="space-y-3">
            {weeklyForecast.length > 0 ? (
              weeklyForecast.map((forecast, index) => (
                <button
                  key={forecast.date}
                  onClick={() => handleDateSelect(forecast)}
                  className={`w-full bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex items-center justify-between border ${
                    selectedDate === forecast.date ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[50px] border-r border-gray-100 pr-3">
                      <div className={`text-sm font-bold ${
                        forecast.dayOfWeek === '일' ? 'text-red-500' :
                        forecast.dayOfWeek === '토' ? 'text-blue-500' : 'text-gray-700'
                      }`}>
                        {index === 0 ? '오늘' : forecast.dayOfWeek}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(forecast.date).getMonth() + 1}.{new Date(forecast.date).getDate()}
                      </div>
                    </div>
                    {getWeatherIcon(forecast.condition)}
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-800">{forecast.condition}</div>
                      <div className="text-[11px] text-gray-400">습도 {forecast.humidity}%</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">최저 <span className="text-blue-500 font-medium">{forecast.temperature.min}°</span></div>
                      <div className="text-xs text-gray-400">최고 <span className="text-red-500 font-medium">{forecast.temperature.max}°</span></div>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${
                      selectedDate === forecast.date ? 'rotate-90 text-blue-500' : 'text-gray-300'
                    }`} />
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200">
                <p className="text-sm text-gray-400">주간 예보 정보를 불러올 수 없습니다.</p>
              </div>
            )}
          </div>
        </div>

        {/* 선택한 날짜의 추천 코디 */}
        {selectedDate && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-blue-50 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">
                {selectedDate === weeklyForecast[0]?.date
                  ? '오늘'
                  : `${new Date(selectedDate).getMonth() + 1}월 ${new Date(selectedDate).getDate()}일`} 추천 코디
              </h2>
              <div className="px-2 py-1 bg-blue-50 rounded text-[10px] text-blue-600 font-bold">AI RECOMMEND</div>
            </div>

            {selectedDayOutfit.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {selectedDayOutfit.map((item) => (
                  <ClothingItem key={item.id} item={item} showActions={false} />
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
                <p className="text-gray-500 text-sm mb-4">현재 옷장에 이 날씨에 적합한 옷이 없네요.</p>
                <Link
                  to="/wardrobe"
                  className="inline-flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition-colors"
                >
                  옷 등록하러 가기
                </Link>
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-50/50 rounded-lg flex gap-3">
              <span className="text-xl">💡</span>
              <p className="text-xs text-blue-800 leading-relaxed">
                기상청 예보 온도와 습도를 바탕으로 AI가 체감 온도를 계산했습니다.
                <span className="font-bold"> 일교차</span>를 고려하여 겉옷을 준비하는 것을 추천드려요!
              </p>
            </div>
          </div>
        )}
      </div>

      <Navigation />
    </div>
  );
}
