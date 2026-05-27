import { useState } from 'react';
import { useNavigate } from 'react-router';

interface Prefs {
  preferred_style: string;
  activity_level: string;
  cold_sensitivity: number;
}

const STEPS = [
  {
    id: 'style',
    emoji: '👗',
    title: '선호하는 스타일은?',
    subtitle: '평소 즐겨 입는 스타일을 골라주세요',
    options: [
      { value: 'casual',  label: '캐주얼',  emoji: '😊', desc: '편하고 자연스럽게' },
      { value: 'minimal', label: '미니멀',  emoji: '🤍', desc: '깔끔하고 단정하게' },
      { value: 'street',  label: '스트릿',  emoji: '🧢', desc: '트렌디하고 개성있게' },
      { value: 'formal',  label: '포멀',    emoji: '👔', desc: '격식있고 단정하게' },
      { value: 'sporty',  label: '스포티',  emoji: '🏃', desc: '활동적이고 기능적으로' },
    ],
  },
  {
    id: 'activity',
    emoji: '⚡',
    title: '평소 활동량은?',
    subtitle: '하루 중 얼마나 활동하시나요?',
    options: [
      { value: 'low',    label: '적음',  emoji: '🛋️', desc: '주로 실내 생활, 대중교통 이용' },
      { value: 'medium', label: '보통',  emoji: '🚶', desc: '일반적인 일상 활동' },
      { value: 'high',   label: '많음',  emoji: '🏋️', desc: '운동을 즐기거나 야외 활동이 많음' },
    ],
  },
  {
    id: 'cold',
    emoji: '🌡️',
    title: '추위와 더위는?',
    subtitle: '같은 온도에서 남들보다...',
    options: [
      { value: -2, label: '많이 추위 탐',  emoji: '🥶', desc: '항상 다른 사람보다 춥게 느껴요' },
      { value: -1, label: '추위 탐',       emoji: '😰', desc: '조금 추위를 더 타는 편이에요' },
      { value:  0, label: '보통',          emoji: '😊', desc: '남들이랑 비슷하게 느껴요' },
      { value:  1, label: '더위 탐',       emoji: '😅', desc: '조금 더위를 더 타는 편이에요' },
      { value:  2, label: '많이 더위 탐',  emoji: '🥵', desc: '항상 다른 사람보다 덥게 느껴요' },
    ],
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>({
    preferred_style: '',
    activity_level: '',
    cold_sensitivity: 0,
  });
  const [selected, setSelected] = useState<string | number | null>(null);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleSelect = (value: string | number) => {
    setSelected(value);
  };

  const handleNext = () => {
    if (selected === null) return;

    const key = currentStep.id === 'style' ? 'preferred_style'
      : currentStep.id === 'activity' ? 'activity_level'
      : 'cold_sensitivity';

    const updated = { ...prefs, [key]: selected };
    setPrefs(updated);

    if (isLast) {
      // 저장 후 홈으로
      const userId = localStorage.getItem('userId');
      if (userId) {
        const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
        const newProfile = { ...profile, ...updated };
        localStorage.setItem('userProfile', JSON.stringify(newProfile));

        // 서버에도 반영 시도
        const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.135/api';
        fetch(`${API_BASE}/customers/${userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        }).catch(() => {});

        // 팀원 서버에 cold_sensitivity / preferred_style / activity_level 업데이트
        const partnerCustomerId = localStorage.getItem('partnerCustomerId');
        if (partnerCustomerId) {
          const coldValue = (updated.cold_sensitivity as number) + 3; // -2..2 → 1..5
          try {
            fetch(`http://210.104.76.135:8080/api/customers/${Number(partnerCustomerId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cold_sensitivity: coldValue,
                preferred_style: String(updated.preferred_style).toUpperCase(),
                activity_level: String(updated.activity_level).toUpperCase(),
              }),
              signal: AbortSignal.timeout(3000),
              keepalive: true,
            }).catch(() => {});
          } catch { /* 무시 */ }
        }
      }
      // userPreference도 함께 저장 (Outfit 페이지에서 사용)
      localStorage.setItem('userPreference', JSON.stringify({
        coldSensitivity: updated.cold_sensitivity,
        activityLevel: updated.activity_level,
        style: updated.preferred_style,
      }));
      navigate('/');
    } else {
      setStep(s => s + 1);
      setSelected(null);
    }
  };

  const handleSkip = () => {
    navigate('/');
  };

  const progressPct = ((step) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
      {/* 헤더 */}
      <div className="px-6 pt-10 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= step ? 'bg-blue-500' : 'bg-gray-200'
                } ${i === step ? 'w-8' : 'w-4'}`}
              />
            ))}
          </div>
          <button
            onClick={handleSkip}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            건너뛰기
          </button>
        </div>
        <p className="text-xs text-gray-400">{step + 1} / {STEPS.length}</p>
      </div>

      {/* 질문 */}
      <div className="flex-1 px-6 flex flex-col">
        <div className="mb-8 mt-4">
          <div className="text-5xl mb-4">{currentStep.emoji}</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{currentStep.title}</h1>
          <p className="text-gray-500 text-sm">{currentStep.subtitle}</p>
        </div>

        {/* 선택지 */}
        <div className="space-y-3 flex-1">
          {currentStep.options.map((opt) => {
            const isChosen = selected === opt.value;
            return (
              <button
                key={String(opt.value)}
                onClick={() => handleSelect(opt.value)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all duration-150 ${
                  isChosen
                    ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100'
                    : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30'
                }`}
              >
                <span className="text-2xl flex-shrink-0">{opt.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${isChosen ? 'text-blue-700' : 'text-gray-800'}`}>
                    {opt.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${isChosen ? 'text-blue-500' : 'text-gray-400'}`}>
                    {opt.desc}
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  isChosen ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                }`}>
                  {isChosen && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                      <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="px-6 pb-10 pt-6">
        <button
          onClick={handleNext}
          disabled={selected === null}
          className={`w-full py-4 rounded-2xl font-bold text-base transition-all duration-150 ${
            selected !== null
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isLast ? '완료 — 시작하기 🚀' : '다음'}
        </button>
      </div>
    </div>
  );
}
