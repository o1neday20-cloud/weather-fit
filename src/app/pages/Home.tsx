import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Navigation from '../components/Navigation';
import WeatherCard from '../components/WeatherCard';
import ClothingItem from '../components/ClothingItem';
import { getCurrentWeather, WeatherData } from '../utils/weatherApi';
import { predictFeelTemperature, recommendOutfit, ClothingItem as ClothingItemType, UserPreference } from '../utils/aiModel';
import { Logger } from '../utils/logger';
import { Sparkles, TrendingUp, Settings } from 'lucide-react';

export default function Home() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [feelTemp, setFeelTemp] = useState<number>(0);
  const [recommendedOutfit, setRecommendedOutfit] = useState<ClothingItemType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    Logger.log('page_view', { page: 'home' });
  }, []);

  const loadData = async () => {
    setLoading(true);

    // 날씨 데이터 가져오기 (위치 기반)
    const weatherData = await getCurrentWeather();
    setWeather(weatherData);

    // 사용자 설정 가져오기
    const userPrefString = localStorage.getItem('userPreference');
    const userPref: UserPreference = userPrefString
      ? JSON.parse(userPrefString)
      : { coldSensitivity: 0, activityLevel: 'medium', style: 'casual' };

    // 체감 온도 예측
    const tempPrediction = predictFeelTemperature(weatherData, userPref);
    setFeelTemp(tempPrediction.perceived);

    // 옷장 데이터 가져오기
    const wardrobeString = localStorage.getItem('wardrobe');
    const wardrobe: ClothingItemType[] = wardrobeString ? JSON.parse(wardrobeString) : [];

    // 코디 추천
    const outfit = recommendOutfit(tempPrediction.perceived, wardrobe);
    setRecommendedOutfit(outfit);

    // 현재 추천 코디 저장 (피드백용)
    localStorage.setItem('currentRecommendedOutfit', JSON.stringify(outfit));

    Logger.log('weather_check', {
      temperature: weatherData.temperature,
      feelTemperature: tempPrediction.perceived,
      adjustment: tempPrediction.adjustment,
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

        {/* 추천 코디 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              <h2 className="font-semibold text-gray-900">오늘의 추천 코디</h2>
            </div>
            <Link 
              to="/outfit"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              더보기
            </Link>
          </div>

          {recommendedOutfit.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {recommendedOutfit.map((item) => (
                <ClothingItem 
                  key={item.id} 
                  item={item}
                  showActions={false}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-8 text-center">
              <p className="text-gray-600 mb-4">옷장에 등록된 옷이 없습니다</p>
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
