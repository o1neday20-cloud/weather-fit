import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
import Navigation from '../components/Navigation';
import { Logger } from '../utils/logger';
import { Heart, Star, LogOut, ChevronRight, User, Ticket, LogIn, ShoppingBag, Package } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.135/api';

const MEMBERSHIP_INFO: Record<string, { label: string; color: string; nextAt: number | null; benefit: string }> = {
  BASIC:  { label: 'BASIC',  color: '#9CA3AF', nextAt: 200000,  benefit: '일반 등급 할인 쿠폰 증정' },
  SILVER: { label: 'SILVER', color: '#94A3B8', nextAt: 500000,  benefit: '실버 등급 할인 쿠폰 증정' },
  GOLD:   { label: 'GOLD',   color: '#F59E0B', nextAt: 1000000, benefit: '골드 등급 할인 쿠폰 증정' },
  VIP:    { label: 'VIP',    color: '#8B5CF6', nextAt: null,     benefit: 'VIP 등급 할인 쿠폰 증정' },
};

export default function MyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [membershipLevel, setMembershipLevel] = useState<string>('BASIC');
  const [membershipData, setMembershipData] = useState<{
    amount: number;
    amount_to_next: number;
    next_level: string | null;
    next_update: string;
  }>({ amount: 0, amount_to_next: 0, next_level: null, next_update: '' });
  const [couponCount, setCouponCount] = useState<number>(0);
  const [currentMonthData, setCurrentMonthData] = useState<{ currentMonthAmount: number; nextGrade: string }>({ currentMonthAmount: 0, nextGrade: '일반' });
  const [prefs, setPrefs] = useState({
    cold_sensitivity: 3,
    activity_level: 'medium',
    preferred_style: 'casual',
    marketing_consent: false,
    push_consent: false,
    email_consent: false,
    sms_consent: false,
  });

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    const stored = localStorage.getItem('userProfile');

    if (userId && stored) {
      // 로그인된 유저
      const p = JSON.parse(stored);
      setProfile(p);
      setIsLoggedIn(true);
      setPrefs({
        cold_sensitivity: p.cold_sensitivity ?? 3,
        activity_level: p.activity_level ?? 'medium',
        preferred_style: p.preferred_style ?? 'casual',
        marketing_consent: !!p.marketing_consent,
        push_consent: !!p.push_consent,
        email_consent: !!p.email_consent,
        sms_consent: !!p.sms_consent,
      });
      // membership_level + 구매금액 + prefs — 서버 DB 우선, 실패 시 로컬 폴백
      fetch(`${API_BASE}/customers/${userId}`)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          // 전월 구매금액 기반 등급 계산
          const amount = data.membership_amount ?? 0;
          const computedLevel = amount >= 1000000 ? 'VIP'
            : amount >= 500000 ? 'GOLD'
            : amount >= 200000 ? 'SILVER'
            : 'BASIC';
          setMembershipLevel(computedLevel);
          setMembershipData({
            amount,
            amount_to_next: Math.max(0, data.amount_to_next ?? 0),
            next_level:    data.next_level  ?? null,
            next_update:   data.next_update ?? '',
          });
          // DB에서 가져온 최신 prefs로 덮어쓰기 (cold_sensitivity 포함)
          setPrefs(prev => ({
            ...prev,
            cold_sensitivity: data.cold_sensitivity ?? prev.cold_sensitivity,
            activity_level:   data.activity_level   ?? prev.activity_level,
            preferred_style:  data.preferred_style  ?? prev.preferred_style,
            marketing_consent: data.marketing_consent != null ? !!data.marketing_consent : prev.marketing_consent,
            push_consent:      data.push_consent     != null ? !!data.push_consent       : prev.push_consent,
            email_consent:     data.email_consent    != null ? !!data.email_consent      : prev.email_consent,
            sms_consent:       data.sms_consent      != null ? !!data.sms_consent        : prev.sms_consent,
          }));
        })
        .catch(() => {});
      // 이번 달 구매금액 + 다음 달 예상 등급
      const partnerCid = localStorage.getItem('partnerCustomerId');
      if (partnerCid) {
        fetch(`${API_BASE}/membership/current-month?customerId=${partnerCid}`)
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(d => setCurrentMonthData({ currentMonthAmount: d.currentMonthAmount ?? 0, nextGrade: d.nextGrade ?? '일반' }))
          .catch(() => {});
      }
      // 쿠폰 수 로드
      fetch(`${API_BASE}/coupons/my/${userId}`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.ok ? r.json() : [])
        .then((coupons: any[]) => setCouponCount(Array.isArray(coupons) ? coupons.length : 0))
        .catch(() => {});
    } else if (userId) {
      // userId는 있지만 profile 없음 (게스트 자동 ID)
      setIsLoggedIn(false);
    } else {
      setIsLoggedIn(false);
    }
    Logger.log('page_view', { page: 'mypage' });
  }, [location.pathname]);

  const handleSavePrefs = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    setSaving(true);
    try {
      const patchRes = await fetch(`${API_BASE}/customers/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (!patchRes.ok) throw new Error('저장 실패');

      // 저장 후 서버에서 최신 값 재조회해 상태 동기화
      const freshRes = await fetch(`${API_BASE}/customers/${userId}`);
      if (freshRes.ok) {
        const data = await freshRes.json();
        const synced = {
          ...prefs,
          cold_sensitivity:  data.cold_sensitivity  ?? prefs.cold_sensitivity,
          activity_level:    data.activity_level    ?? prefs.activity_level,
          preferred_style:   data.preferred_style   ?? prefs.preferred_style,
          marketing_consent: data.marketing_consent != null ? !!data.marketing_consent : prefs.marketing_consent,
          push_consent:      data.push_consent      != null ? !!data.push_consent      : prefs.push_consent,
          email_consent:     data.email_consent     != null ? !!data.email_consent     : prefs.email_consent,
          sms_consent:       data.sms_consent       != null ? !!data.sms_consent       : prefs.sms_consent,
        };
        setPrefs(synced);
        const updated = { ...profile, ...synced };
        setProfile(updated);
        localStorage.setItem('userProfile', JSON.stringify(updated));
      } else {
        // 재조회 실패 시 프론트 상태 그대로 반영
        const updated = { ...profile, ...prefs };
        setProfile(updated);
        localStorage.setItem('userProfile', JSON.stringify(updated));
      }
      setEditMode(false);

      // 동의/선호 정보 변경 로그 전송
      Logger.sendCustomerUpdate({
        event_type:  'customer_update',
        customer_id: Number(localStorage.getItem('partnerCustomerId')),
        changed_fields: {
          coldSensitivity:  prefs.cold_sensitivity,
          activityLevel:    prefs.activity_level,
          preferredStyle:   prefs.preferred_style,
          marketingConsent: prefs.marketing_consent,
          pushConsent:      prefs.push_consent,
          emailConsent:     prefs.email_consent,
          smsConsent:       prefs.sms_consent,
        },
      }).catch(() => {});
    } catch {
      alert('저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    // 계정 식별 키
    const keysToRemove = [
      'userProfile', 'userId', 'partnerCustomerId', 'customerUid',
      // 피드백 / 날씨 캐시
      'feedbackHistory', 'lastWeather', 'currentRecommendedOutfit', 'appLogs',
      // 개인설정 / 온보딩
      'userPreference',
      // 팝업
      'popup_closed',
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 사용자별 패턴 키 전부 제거
    const patterns = [
      'wardrobe_', 'deletedWardrobe_', 'cart_', 'wishlist_', 'addressHistory_',
      'feedback_', 'temperature_', 'weather_',
    ];
    Object.keys(localStorage).forEach(k => {
      if (patterns.some(p => k.startsWith(p))) localStorage.removeItem(k);
    });

    // 세션 스토리지 팝업 키 제거
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('popup_closed_campaign_')) sessionStorage.removeItem(k);
    });

    setProfile(null);
    setIsLoggedIn(false);
  };

  const coldLabels = ['추위 많이 탐', '추위 탐', '보통', '더위 탐', '더위 많이 탐'];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-4">

        {/* 프로필 헤더 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {isLoggedIn && profile ? (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl flex-shrink-0">
                <User className="w-8 h-8 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900">{profile.name || '사용자'}</h2>
                <p className="text-sm text-gray-500 truncate">{profile.email || ''}</p>
                {profile.phone && <p className="text-sm text-gray-400">{profile.phone}</p>}
              </div>
              <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                <LogOut className="w-4 h-4" />
                로그아웃
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <User className="w-8 h-8 text-gray-300" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-700">로그인이 필요합니다</h2>
                <p className="text-sm text-gray-400">로그인하면 더 많은 기능을 사용할 수 있어요</p>
              </div>
              <button
                onClick={() => navigate('/auth')}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                로그인
              </button>
            </div>
          )}
        </div>

        {/* 멤버십 등급 — 로그인된 경우만 */}
        {isLoggedIn && profile && (() => {
          const COLORS: Record<string, string> = { BASIC:'#9CA3AF', SILVER:'#94A3B8', GOLD:'#F59E0B', VIP:'#8B5CF6' };
          const BENEFITS: Record<string, string> = { BASIC:'일반 등급 할인 쿠폰 증정', SILVER:'실버 등급 할인 쿠폰 증정', GOLD:'골드 등급 할인 쿠폰 증정', VIP:'VIP 등급 할인 쿠폰 증정' };
          // DB 기반 멤버십 데이터
          const level  = membershipLevel;
          const amount = membershipData.amount;
          const LEVELS = ['BASIC', 'SILVER', 'GOLD', 'VIP'];
          const THRESH: Record<string, number> = { BASIC: 0, SILVER: 200000, GOLD: 500000, VIP: 1000000 };
          // 등급 리셋까지 남은 일수 (next_update 기준)
          const daysUntilReset = membershipData.next_update
            ? Math.max(0, Math.round((new Date(membershipData.next_update).getTime() - Date.now()) / 86400000))
            : 0;

          // ── 이번 달 구매금액 기준 프로그레스 바 ─────────────
          const currentMonthAmt = currentMonthData.currentMonthAmount;
          // 이번 달 금액으로 현재 위치 등급 계산
          const thisMonthLevel = currentMonthAmt >= 1000000 ? 'VIP'
            : currentMonthAmt >= 500000 ? 'GOLD'
            : currentMonthAmt >= 200000 ? 'SILVER'
            : 'BASIC';
          const thisMonthIdx   = LEVELS.indexOf(thisMonthLevel);
          const nextLevel      = thisMonthIdx < LEVELS.length - 1 ? LEVELS[thisMonthIdx + 1] : null;
          const nextThreshold  = nextLevel ? THRESH[nextLevel] : null;
          const monthAmountToNext = nextThreshold ? Math.max(0, nextThreshold - currentMonthAmt) : 0;
          // 프로그레스바 (0~100, 이번 달 기준)
          const progressPct = nextThreshold
            ? Math.max(0, Math.min(100, Math.round(
                ((currentMonthAmt - THRESH[thisMonthLevel]) / (nextThreshold - THRESH[thisMonthLevel])) * 100
              )))
            : 100;
          return (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-yellow-400" />
                <h3 className="font-semibold text-gray-900">멤버십 등급</h3>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-4 py-1.5 rounded-full text-white text-sm font-bold" style={{ backgroundColor: COLORS[level] }}>
                  {level}
                </span>
                <span className="text-sm text-gray-600">{BENEFITS[level]}</span>
              </div>
              {/* 지난 달 구매금액 기반 현재 등급 정보 */}
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <ShoppingBag className="w-3.5 h-3.5" />
                지난 달 구매금액 {amount.toLocaleString()}원 · 등급 갱신까지 {daysUntilReset}일
              </div>
              {/* 이번 달 구매금액 + 다음 달 예상 등급 */}
              <div className="text-xs text-blue-500 mb-3 flex items-center gap-1">
                <ShoppingBag className="w-3.5 h-3.5" />
                이번 달 구매금액 {currentMonthAmt.toLocaleString()}원 · 다음 달 예상 등급: <span className="font-semibold">{currentMonthData.nextGrade}</span>
              </div>
              {/* 프로그레스 바 — 이번 달 구매금액 기준 */}
              {nextLevel && nextThreshold && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{nextLevel} 달성까지</span>
                    <span>{monthAmountToNext === 0 ? '달성!' : `${monthAmountToNext.toLocaleString()}원 남음`}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${progressPct}%`, backgroundColor: COLORS[nextLevel] }} />
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 빠른 메뉴 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <Link to="/wishlist" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 border-b">
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-red-400" />
              <span className="text-sm font-medium text-gray-800">찜 목록</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
          {isLoggedIn && (
            <Link to="/purchases" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 border-b">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-gray-800">구매 내역</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          )}
          {isLoggedIn && (
            <Link to="/coupons" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <Ticket className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-gray-800">내 쿠폰</span>
                {couponCount > 0 && (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-[11px] font-bold rounded-full">
                    {couponCount}장
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          )}
        </div>

        {/* 개인 설정 — 로그인된 경우만 */}
        {isLoggedIn && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">개인 설정</h3>
              {!editMode ? (
                <button onClick={() => setEditMode(true)} className="text-sm text-blue-600 font-medium hover:underline">수정</button>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => setEditMode(false)} className="text-sm text-gray-500 hover:underline">취소</button>
                  <button onClick={handleSavePrefs} disabled={saving} className="text-sm text-blue-600 font-semibold hover:underline disabled:opacity-50">
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-5">
              {/* 활동량 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">활동량</label>
                {editMode ? (
                  <div className="flex gap-2">
                    {[['low','낮음'],['medium','보통'],['high','높음']].map(([val, label]) => (
                      <button key={val} onClick={() => setPrefs({...prefs, activity_level: val})}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          prefs.activity_level === val ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}>{label}</button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                    {prefs.activity_level === 'low' ? '낮음' : prefs.activity_level === 'high' ? '높음' : '보통'}
                  </div>
                )}
              </div>

              {/* 추위 민감도 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  추위 민감도 — <span className="text-blue-600">{coldLabels[(prefs.cold_sensitivity ?? 3) - 1]}</span>
                </label>
                {editMode ? (
                  <>
                    <input type="range" min="1" max="5" value={prefs.cold_sensitivity}
                      onChange={e => setPrefs({...prefs, cold_sensitivity: parseInt(e.target.value)})}
                      className="w-full accent-blue-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>추위 많이 탐</span><span>더위 많이 탐</span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">{coldLabels[(prefs.cold_sensitivity ?? 3) - 1]}</div>
                )}
              </div>

              {/* 선호 스타일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">선호 스타일</label>
                {editMode ? (
                  <div className="grid grid-cols-5 gap-2">
                    {[['casual','캐주얼'],['formal','포멀'],['sporty','스포티'],['street','스트릿'],['minimal','미니멀']].map(([val, label]) => (
                      <button key={val} onClick={() => setPrefs({...prefs, preferred_style: val})}
                        className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                          prefs.preferred_style === val ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                        }`}>{label}</button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg capitalize">{prefs.preferred_style}</div>
                )}
              </div>

              {/* 수신 동의 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">수신 동의</label>
                <div className="space-y-3">
                  {([
                    ['marketing_consent', '마케팅 수신 동의'],
                    ['push_consent',      '푸시 알림 동의'],
                    ['email_consent',     '이메일 수신 동의'],
                    ['sms_consent',       'SMS 수신 동의'],
                  ] as [keyof typeof prefs, string][]).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{label}</span>
                      <button
                        type="button"
                        onClick={() => editMode && setPrefs({ ...prefs, [key]: !prefs[key] })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          prefs[key] ? 'bg-blue-600' : 'bg-gray-200'
                        } ${!editMode ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          prefs[key] ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Navigation />
    </div>
  );
}
