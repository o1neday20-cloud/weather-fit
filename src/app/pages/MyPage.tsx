import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import Navigation from '../components/Navigation';
import { Logger } from '../utils/logger';
import { Heart, Star, LogOut, ChevronRight, User, Ticket, LogIn, ShoppingBag, Package } from 'lucide-react';
import { getMembershipInfo } from '../utils/membership';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.136:4000/api';

const MEMBERSHIP_INFO: Record<string, { label: string; color: string; nextAt: number | null; benefit: string }> = {
  BASIC:  { label: 'BASIC',  color: '#9CA3AF', nextAt: 100000,  benefit: '기본 서비스 이용' },
  SILVER: { label: 'SILVER', color: '#94A3B8', nextAt: 300000,  benefit: '5% 추가 할인' },
  GOLD:   { label: 'GOLD',   color: '#F59E0B', nextAt: 500000,  benefit: '10% 추가 할인 + 무료배송' },
  VIP:    { label: 'VIP',    color: '#8B5CF6', nextAt: null,     benefit: '20% 추가 할인 + VIP 전용 혜택' },
};

export default function MyPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [membershipLevel, setMembershipLevel] = useState<string>('BASIC');
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [prefs, setPrefs] = useState({
    cold_sensitivity: 0,
    activity_level: 'medium',
    preferred_style: 'casual',
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
        cold_sensitivity: p.cold_sensitivity ?? 0,
        activity_level: p.activity_level ?? 'medium',
        preferred_style: p.preferred_style ?? 'casual',
      });
      // membership_level — 서버 DB 우선, 실패 시 로컬 폴백
      fetch(`${API_BASE}/customers/${userId}`)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          if (data.membership_level) setMembershipLevel(data.membership_level);
        })
        .catch(() => {
          if (p.membership_level) setMembershipLevel(p.membership_level);
        });
    } else if (userId) {
      // userId는 있지만 profile 없음 (게스트 자동 ID)
      setIsLoggedIn(false);
    } else {
      setIsLoggedIn(false);
    }
    // 구매 내역 로드 (Checkout.tsx에서 저장)
    const history: any[] = JSON.parse(localStorage.getItem('purchaseHistory') || '[]');
    setPurchaseHistory(history.slice().reverse()); // 최신순
    Logger.log('page_view', { page: 'mypage' });
  }, []);

  const handleSavePrefs = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE}/customers/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      const updated = { ...profile, ...prefs };
      setProfile(updated);
      localStorage.setItem('userProfile', JSON.stringify(updated));
      setEditMode(false);
    } catch {
      alert('저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userProfile');
    localStorage.removeItem('userId');
    setProfile(null);
    setIsLoggedIn(false);
  };

  const coldLabels = ['많이 추위 탐', '추위 탐', '보통', '더위 탐', '많이 더위 탐'];

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
          const mem = getMembershipInfo();
          const COLORS: Record<string, string> = { BASIC:'#9CA3AF', SILVER:'#94A3B8', GOLD:'#F59E0B', VIP:'#8B5CF6' };
          const BENEFITS: Record<string, string> = { BASIC:'기본 서비스 이용', SILVER:'5% 추가 할인', GOLD:'10% 추가 할인 + 무료배송', VIP:'20% 추가 할인 + VIP 전용 혜택' };
          // 서버 DB membership_level 우선 사용
          const level = membershipLevel;
          const LEVELS = ['BASIC', 'SILVER', 'GOLD', 'VIP'];
          const THRESH: Record<string, number> = { BASIC: 0, SILVER: 100000, GOLD: 300000, VIP: 500000 };
          const currentIdx = LEVELS.indexOf(level);
          const nextLevel = currentIdx < LEVELS.length - 1 ? LEVELS[currentIdx + 1] : null;
          const nextThreshold = nextLevel ? THRESH[nextLevel] : null;
          const progressPct = nextThreshold
            ? Math.min(100, Math.round(((mem.totalAmount - THRESH[level]) / (nextThreshold - THRESH[level])) * 100))
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
              {/* 누적 구매금액 */}
              <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <ShoppingBag className="w-3.5 h-3.5" />
                이번 기간 누적 {mem.totalAmount.toLocaleString()}원 · 등급 리셋까지 {mem.daysUntilReset}일
              </div>
              {nextLevel && nextThreshold && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{nextLevel} 달성까지</span>
                    <span>{(nextThreshold - mem.totalAmount).toLocaleString()}원 남음</span>
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
            <Link to="/coupons" className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <Ticket className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-gray-800">내 쿠폰</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Link>
          )}
        </div>

        {/* 구매 내역 — 로그인된 경우만 */}
        {isLoggedIn && purchaseHistory.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-500" />
                <h3 className="font-semibold text-gray-900">구매 내역</h3>
              </div>
              <span className="text-xs text-gray-400">총 {purchaseHistory.length}건</span>
            </div>
            <div className="space-y-0 divide-y divide-gray-100">
              {(showAllPurchases ? purchaseHistory : purchaseHistory.slice(0, 5)).map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-3">
                  {/* 썸네일 */}
                  <div
                    className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden bg-gray-100"
                    style={{ backgroundColor: item.color || '#f3f4f6' }}
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg opacity-40">👕</div>
                    )}
                  </div>
                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                    <p className="text-xs text-gray-400">
                      {item.size && `${item.size} · `}
                      {item.quantity > 1 && `${item.quantity}개 · `}
                      {new Date(item.purchasedAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  {/* 금액 */}
                  <div className="text-sm font-bold text-gray-900 flex-shrink-0">
                    {item.price.toLocaleString()}원
                  </div>
                </div>
              ))}
            </div>
            {purchaseHistory.length > 5 && (
              <button
                onClick={() => setShowAllPurchases(v => !v)}
                className="mt-3 w-full text-xs text-blue-600 hover:text-blue-700 py-2 border border-blue-100 rounded-xl hover:bg-blue-50 transition-colors"
              >
                {showAllPurchases ? '접기' : `더보기 (${purchaseHistory.length - 5}건 더)`}
              </button>
            )}
          </div>
        )}

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
                  추위 민감도 — <span className="text-blue-600">{coldLabels[prefs.cold_sensitivity + 2]}</span>
                </label>
                {editMode ? (
                  <>
                    <input type="range" min="-2" max="2" value={prefs.cold_sensitivity}
                      onChange={e => setPrefs({...prefs, cold_sensitivity: parseInt(e.target.value)})}
                      className="w-full accent-blue-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      <span>많이 추위 탐</span><span>많이 더위 탐</span>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">{coldLabels[prefs.cold_sensitivity + 2]}</div>
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
            </div>
          </div>
        )}
      </div>
      <Navigation />
    </div>
  );
}
