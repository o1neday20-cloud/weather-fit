import { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import { UserPreference } from '../utils/aiModel';
import { Logger } from '../utils/logger';
import { User, Save, Thermometer } from 'lucide-react';

export default function Settings() {
  const [preferences, setPreferences] = useState<UserPreference>({
    coldSensitivity: 0,
    activityLevel: 'medium',
    style: 'casual',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Logger.log('page_view', { page: 'settings' });
    
    // 저장된 설정 불러오기
    const savedPref = localStorage.getItem('userPreference');
    if (savedPref) {
      setPreferences(JSON.parse(savedPref));
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('userPreference', JSON.stringify(preferences));
    Logger.log('settings_updated', preferences);
    
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const sensitivityLabels = [
    '매우 추위를 탐',
    '추위를 탐',
    '보통',
    '더위를 탐',
    '매우 더위를 탐',
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">설정</h1>
          <p className="text-sm text-gray-600 mt-1">
            개인화된 추천을 위한 정보를 설정하세요
          </p>
        </div>

        {saved && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">
            ✅ 설정이 저장되었습니다!
          </div>
        )}

        {/* 체질 설정 */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Thermometer className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">체질 설정</h2>
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              추위/더위 민감도
            </label>
            <input
              type="range"
              min="-2"
              max="2"
              step="1"
              value={preferences.coldSensitivity}
              onChange={(e) => setPreferences({
                ...preferences,
                coldSensitivity: parseInt(e.target.value)
              })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>추위를 많이 탐</span>
              <span className="font-semibold text-blue-600">
                {sensitivityLabels[preferences.coldSensitivity + 2]}
              </span>
              <span>더위를 많이 탐</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              활동량
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPreferences({ ...preferences, activityLevel: level })}
                  className={`px-4 py-3 rounded-lg border-2 transition-all ${
                    preferences.activityLevel === level
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {level === 'low' ? '낮음' : level === 'medium' ? '보통' : '높음'}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              활동량이 높을수록 더 시원한 옷차림을 추천합니다
            </p>
          </div>
        </div>

        {/* 스타일 설정 */}
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">선호 스타일</h2>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            {(['casual', 'formal', 'sporty'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setPreferences({ ...preferences, style })}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  preferences.style === style
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {style === 'casual' ? '캐주얼' : style === 'formal' ? '포멀' : '스포티'}
              </button>
            ))}
          </div>
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          <Save className="w-5 h-5" />
          설정 저장
        </button>

        {/* 안내 */}
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            💡 <strong>개인화 AI 추천</strong>
            <br />
            설정하신 정보를 바탕으로 날씨 데이터와 함께 분석하여, 
            당신만을 위한 맞춤형 체감 온도와 옷차림을 추천해드립니다.
          </p>
        </div>
      </div>

      <Navigation />
    </div>
  );
}
