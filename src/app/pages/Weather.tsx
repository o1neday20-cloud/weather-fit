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
import { Logger } from '../utils/logger';
import { MapPin, Search, Cloud, CloudRain, CloudSnow, CloudFog, Sun, ChevronRight } from 'lucide-react';

export default function Weather() {
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [weeklyForecast, setWeeklyForecast] = useState<WeeklyForecast[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDayOutfit, setSelectedDayOutfit] = useState<ClothingItemType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWeatherData();
    Logger.log('page_view', { page: 'weather' });
  }, []);

  const loadWeatherData = async (location?: string) => {
    setLoading(true);
    const weather = await getCurrentWeather(location);
    const forecast = await getWeeklyForecast(location);
    setCurrentWeather(weather);
    setWeeklyForecast(forecast);
    setLoading(false);

    if (location) {
      localStorage.setItem('userLocation', location);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.length > 0) {
      const results = searchLocations(query);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handleLocationSelect = (location: string) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    loadWeatherData(location);
  };

  const handleDateSelect = async (forecast: WeeklyForecast) => {
    setSelectedDate(forecast.date);

    const userPrefString = localStorage.getItem('userPreference');
    const userPref: UserPreference = userPrefString
      ? JSON.parse(userPrefString)
      : { coldSensitivity: 0, activityLevel: 'medium', style: 'casual' };

    const weatherData: WeatherData = {
      temperature: forecast.temperature.max,
      humidity: forecast.humidity,
      windSpeed: forecast.windSpeed,
      condition: forecast.condition,
      location: currentWeather?.location || '',
      date: forecast.date,
    };

    const tempPrediction = predictFeelTemperature(weatherData, userPref);

    const wardrobeString = localStorage.getItem('wardrobe');
    const wardrobe: ClothingItemType[] = wardrobeString ? JSON.parse(wardrobeString) : [];

    const outfit = recommendOutfit(tempPrediction.perceived, wardrobe);
    setSelectedDayOutfit(outfit);

    Logger.log('forecast_selected', {
      date: forecast.date,
      temperature: forecast.temperature.max,
      feelTemperature: tempPrediction.perceived,
    });
  };

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case '맑음':
        return <Sun className="w-6 h-6 text-yellow-500" />;
      case '비':
        return <CloudRain className="w-6 h-6 text-blue-500" />;
      case '눈':
        return <CloudSnow className="w-6 h-6 text-blue-300" />;
      case '안개':
        return <CloudFog className="w-6 h-6 text-gray-500" />;
      default:
        return <Cloud className="w-6 h-6 text-gray-400" />;
    }
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">날씨 정보</h1>
          <p className="text-sm text-gray-600 mt-1">주간 날씨 예보 및 지역 검색</p>
        </div>

        {/* 현재 위치 및 검색 */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-900">
                {currentWeather?.location}
              </span>
            </div>
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm"
            >
              <Search className="w-4 h-4" />
              지역 변경
            </button>
          </div>

          {showSearch && (
            <div className="mt-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="지역을 검색하세요"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg">
                  {searchResults.map((location, index) => (
                    <button
                      key={index}
                      onClick={() => handleLocationSelect(location)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b last:border-b-0"
                    >
                      {location}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 현재 날씨 */}
        {currentWeather && (
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white mb-6 shadow-lg">
            <div className="text-sm opacity-90 mb-2">오늘</div>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-light">{currentWeather.temperature}</span>
                  <span className="text-3xl opacity-80">°C</span>
                </div>
                <div className="mt-2 text-sm opacity-90">{currentWeather.condition}</div>
              </div>
              {getWeatherIcon(currentWeather.condition)}
            </div>
            <div className="flex gap-6 mt-4 pt-4 border-t border-white/20 text-sm">
              <div>습도 {currentWeather.humidity}%</div>
              <div>풍속 {currentWeather.windSpeed}m/s</div>
            </div>
          </div>
        )}

        {/* 주간 예보 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">주간 예보</h2>
          <div className="space-y-3">
            {weeklyForecast.map((forecast, index) => (
              <button
                key={forecast.date}
                onClick={() => handleDateSelect(forecast)}
                className={`w-full bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all ${
                  selectedDate === forecast.date ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <div className="text-sm text-gray-500">
                        {index === 0 ? '오늘' : forecast.dayOfWeek}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(forecast.date).getMonth() + 1}/{new Date(forecast.date).getDate()}
                      </div>
                    </div>
                    {getWeatherIcon(forecast.condition)}
                    <div className="text-left">
                      <div className="text-sm text-gray-600">{forecast.condition}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        습도 {forecast.humidity}% · 풍속 {forecast.windSpeed}m/s
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm text-gray-500">
                        최저 <span className="font-semibold text-blue-600">{forecast.temperature.min}°</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        최고 <span className="font-semibold text-red-600">{forecast.temperature.max}°</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 선택한 날짜의 추천 코디 */}
        {selectedDate && (
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {selectedDate === weeklyForecast[0]?.date ? '오늘' : `${new Date(selectedDate).getMonth() + 1}월 ${new Date(selectedDate).getDate()}일`}의 추천 코디
            </h2>

            {selectedDayOutfit.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {selectedDayOutfit.map((item) => (
                  <ClothingItem key={item.id} item={item} showActions={false} />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-6 text-center">
                <p className="text-gray-600 mb-3">이 날씨에 맞는 옷이 옷장에 없습니다</p>
                <Link
                  to="/wardrobe"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  옷장 관리하기
                </Link>
              </div>
            )}

            <div className="mt-4 bg-white rounded-lg p-3">
              <p className="text-sm text-gray-600">
                💡 선택한 날짜의 최고 기온을 기준으로 코디를 추천합니다.
              </p>
            </div>
          </div>
        )}
      </div>

      <Navigation />
    </div>
  );
}
