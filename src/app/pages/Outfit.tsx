import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Navigation from '../components/Navigation';
import ClothingItem from '../components/ClothingItem';
import { getCurrentWeather, WeatherData } from '../utils/weatherApi';
import { predictFeelTemperature, recommendOutfit, ClothingItem as ClothingItemType, UserPreference } from '../utils/aiModel';
import { getRecommendedProducts } from '../utils/products';
import { Logger } from '../utils/logger';
import { Sparkles, RefreshCw, ShoppingBag } from 'lucide-react';

export default function Outfit() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [feelTemp, setFeelTemp] = useState<number>(0);
  const [recommendedOutfit, setRecommendedOutfit] = useState<ClothingItemType[]>([]);
  const [purchaseSuggestions, setPurchaseSuggestions] = useState<ClothingItemType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecommendations();
    Logger.log('page_view', { page: 'outfit' });
  }, []);

  const loadRecommendations = async () => {
    setLoading(true);

    const weatherData = await getCurrentWeather();
    setWeather(weatherData);

    const userPrefString = localStorage.getItem('userPreference');
    const userPref: UserPreference = userPrefString
      ? JSON.parse(userPrefString)
      : { coldSensitivity: 0, activityLevel: 'medium', style: 'casual' };

    const tempPrediction = predictFeelTemperature(weatherData, userPref);
    setFeelTemp(tempPrediction.perceived);

    const wardrobeString = localStorage.getItem('wardrobe');
    const wardrobe: ClothingItemType[] = wardrobeString ? JSON.parse(wardrobeString) : [];

    const outfit = recommendOutfit(tempPrediction.perceived, wardrobe);
    setRecommendedOutfit(outfit);

    // 내 옷장에 있는 옷 ID 수집
    const ownedIds = wardrobe.map(item => item.id);

    // 쇼핑몰에서 추천 상품 가져오기
    const suggestions = getRecommendedProducts(tempPrediction.perceived, ownedIds);
    setPurchaseSuggestions(suggestions);

    Logger.log('outfit_generated', {
      feelTemperature: tempPrediction.perceived,
      outfitCount: outfit.length,
      suggestionsCount: suggestions.length,
      location: weatherData.location
    });

    setLoading(false);
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
            <p className="text-sm text-gray-600 mt-1">
              체감온도 {feelTemp}°C 기준
            </p>
          </div>
          <button
            onClick={loadRecommendations}
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

        {/* 추천 코디 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            내 옷장에서 선택한 코디
          </h2>
          
          {recommendedOutfit.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              {recommendedOutfit.map((item) => (
                <ClothingItem 
                  key={item.id} 
                  item={item}
                  showActions={false}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center mb-4">
              <p className="text-gray-600 mb-4">옷장에 적합한 옷이 없습니다</p>
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <ShoppingBag className="w-4 h-4" />
                쇼핑하러 가기
              </Link>
            </div>
          )}
        </div>

        {/* 쇼핑몰 추천 상품 */}
        {purchaseSuggestions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  오늘 날씨에 어울리는 추천 상품
                </h2>
              </div>
              <Link to="/shop" className="text-sm text-blue-600 hover:text-blue-700">
                더보기
              </Link>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {purchaseSuggestions.map((item) => (
                <Link key={item.id} to={`/product/${item.id}`}>
                  <ClothingItem 
                    item={item}
                    showActions={false}
                  />
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