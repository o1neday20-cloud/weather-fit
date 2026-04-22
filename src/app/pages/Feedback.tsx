import { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import { Logger } from '../utils/logger';
import { ThermometerSnowflake, Thermometer, ThermometerSun, Send, CheckCircle2 } from 'lucide-react';

export default function Feedback() {
  const [rating, setRating] = useState<'cold' | 'perfect' | 'hot' | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    Logger.log('page_view', { page: 'feedback' });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!rating) return;

    // 현재 추천받은 옷의 스타일 정보 가져오기
    const currentOutfitStr = localStorage.getItem('currentRecommendedOutfit');
    const outfitStyles: string[] = [];
    if (currentOutfitStr) {
      const currentOutfit = JSON.parse(currentOutfitStr);
      currentOutfit.forEach((item: any) => {
        if (item.style && !outfitStyles.includes(item.style)) {
          outfitStyles.push(item.style);
        }
      });
    }

    const feedbackData = {
      rating,
      timestamp: new Date().toISOString(),
      outfitStyles, // 추천받은 옷의 스타일 저장
    };

    // 피드백 저장
    const existingFeedback = localStorage.getItem('feedbackHistory');
    const feedbackHistory = existingFeedback ? JSON.parse(existingFeedback) : [];
    feedbackHistory.push(feedbackData);
    localStorage.setItem('feedbackHistory', JSON.stringify(feedbackHistory));

    // 로그 기록
    Logger.log('feedback_submitted', feedbackData);

    setSubmitted(true);
    setTimeout(() => {
      setRating(null);
      setSubmitted(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">피드백</h1>
          <p className="text-sm text-gray-600 mt-1">
            오늘 추천받은 옷차림은 어땠나요?
          </p>
        </div>

        {submitted ? (
          <div className="bg-green-50 rounded-xl p-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-green-900 mb-2">
              피드백 감사합니다!
            </h2>
            <p className="text-green-700">
              여러분의 피드백으로 AI가 더 똑똑해집니다 🎯
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 체감 평가 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">
                오늘 날씨, 어떻게 느껴지셨나요?
              </h2>
              
              <div className="grid grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setRating('cold')}
                  className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                    rating === 'cold'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <ThermometerSnowflake className={`w-12 h-12 ${
                    rating === 'cold' ? 'text-blue-500' : 'text-gray-400'
                  }`} />
                  <div className="text-center">
                    <div className="font-semibold text-gray-900">추웠어요</div>
                    <div className="text-xs text-gray-500 mt-1">더 따뜻하게</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRating('perfect')}
                  className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                    rating === 'perfect'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Thermometer className={`w-12 h-12 ${
                    rating === 'perfect' ? 'text-green-500' : 'text-gray-400'
                  }`} />
                  <div className="text-center">
                    <div className="font-semibold text-gray-900">딱 좋았어요</div>
                    <div className="text-xs text-gray-500 mt-1">완벽해요!</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRating('hot')}
                  className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                    rating === 'hot'
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <ThermometerSun className={`w-12 h-12 ${
                    rating === 'hot' ? 'text-red-500' : 'text-gray-400'
                  }`} />
                  <div className="text-center">
                    <div className="font-semibold text-gray-900">더웠어요</div>
                    <div className="text-xs text-gray-500 mt-1">더 시원하게</div>
                  </div>
                </button>
              </div>
            </div>

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={!rating}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
              피드백 전송
            </button>

            {/* 정보 */}
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                💡 <strong>왜 피드백이 중요한가요?</strong>
                <br />
                여러분의 피드백은 AI 모델을 재학습시켜 개인화된 추천의 정확도를 높입니다. 
                더 많은 피드백을 주실수록, 더 정확한 추천을 받을 수 있어요!
              </p>
            </div>
          </form>
        )}

        {/* 피드백 히스토리 */}
        <FeedbackHistory />
      </div>

      <Navigation />
    </div>
  );
}

function FeedbackHistory() {
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const feedbackHistory = localStorage.getItem('feedbackHistory');
    if (feedbackHistory) {
      setHistory(JSON.parse(feedbackHistory).reverse().slice(0, 5));
    }
  }, []);

  if (history.length === 0) return null;

  const ratingLabels = {
    cold: '추웠어요 ❄️',
    perfect: '딱 좋았어요 ✅',
    hot: '더웠어요 🔥',
  };

  return (
    <div className="mt-8">
      <h2 className="font-semibold text-gray-900 mb-4">최근 피드백</h2>
      <div className="space-y-3">
        {history.map((feedback, index) => (
          <div key={index} className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-gray-900">
                {ratingLabels[feedback.rating as keyof typeof ratingLabels]}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(feedback.timestamp).toLocaleDateString('ko-KR')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
