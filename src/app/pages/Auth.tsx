import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import { Logger } from '../utils/logger';
import { searchLocations } from '../utils/weatherApi';
import { getAnonymousId } from '../components/CampaignPopup';
import { MapPin, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://210.104.76.135/api';
const PARTNER_API = 'http://210.104.76.135:8080';

/** 팀원 서버 회원가입 연동 — 응답 숫자 customer_id를 partnerCustomerId로 저장 */
async function callPartnerSignup(regForm: any): Promise<void> {
  // M/F 레거시 값 + MALE/FEMALE 신규 값 모두 처리
  const genderMap: Record<string, string> = { M: 'MALE', F: 'FEMALE', MALE: 'MALE', FEMALE: 'FEMALE' };
  try {
    const res = await fetch(`${PARTNER_API}/api/customers/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: regForm.name,
        email: regForm.email,
        phone: regForm.phone.replace(/[-\s]/g, ''),
        birth_date: regForm.birth_date,
        gender: genderMap[regForm.gender] ?? 'MALE',
        preferred_style: 'CASUAL',
        activity_level: 'MEDIUM',
        cold_sensitivity: 0,
        marketing_consent: regForm.marketing_consent,
        push_consent: regForm.push_consent,
        email_consent: regForm.email_consent,
        sms_consent: regForm.sms_consent,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.customer_id != null) {
        localStorage.setItem('partnerCustomerId', String(data.customer_id));
      }
    }
  } catch {
    // 파트너 API 실패해도 메인 회원가입은 완료됨
  }
}

/** 로그인 시 비로그인 찜 목록을 로그인 계정으로 병합 */
function mergeGuestWishlist(userId: string) {
  const guestWishlist: any[] = JSON.parse(localStorage.getItem('wishlist') || '[]');
  if (guestWishlist.length === 0) return;

  // 로그인 계정 찜 목록 불러오기
  const userWishlistKey = `wishlist_${userId}`;
  const userWishlist: any[] = JSON.parse(localStorage.getItem(userWishlistKey) || '[]');

  // 중복 제거 후 병합
  guestWishlist.forEach(guestItem => {
    const alreadyExists = userWishlist.some(
      (u: any) => (u.product_id || u.id) === (guestItem.product_id || guestItem.id)
    );
    if (!alreadyExists) userWishlist.push(guestItem);
  });

  localStorage.setItem(userWishlistKey, JSON.stringify(userWishlist));
  localStorage.removeItem('wishlist'); // 비로그인 찜 목록 초기화
}

/** 로그인 시 비로그인 옷장을 로그인 계정으로 병합 */
function mergeGuestWardrobe(userId: string) {
  const guestWardrobe: any[] = JSON.parse(localStorage.getItem('wardrobe_guest') || '[]');
  if (guestWardrobe.length === 0) return;
  const userKey = `wardrobe_${userId}`;
  const userWardrobe: any[] = JSON.parse(localStorage.getItem(userKey) || '[]');
  guestWardrobe.forEach(item => {
    if (!userWardrobe.some((u: any) => u.id === item.id)) {
      userWardrobe.push(item);
    }
  });
  localStorage.setItem(userKey, JSON.stringify(userWardrobe));
  localStorage.removeItem('wardrobe_guest');
}

// ── 로컬 전용 회원가입/로그인 (서버 없을 때 폴백) ──────────────
function registerLocally(data: any) {
  const existing = JSON.parse(localStorage.getItem('localUsers') || '[]');
  if (existing.find((u: any) => u.email === data.email)) {
    throw new Error('이미 가입된 이메일입니다');
  }
  const userId = 'uid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const profile = {
    customer_id: userId, name: data.name, email: data.email,
    phone: data.phone, birth_date: data.birth_date, gender: data.gender,
    region_name: data.region_name || '',
    membership_level: 'BASIC', cold_sensitivity: 0,
    activity_level: 'medium', preferred_style: 'casual',
    agree_marketing: data.agree_marketing, agree_push: data.agree_push,
    agree_email: data.agree_email, agree_sms: data.agree_sms,
  };
  existing.push({ ...profile, password: data.password });
  localStorage.setItem('localUsers', JSON.stringify(existing));
  localStorage.setItem('userId', userId);
  localStorage.setItem('userProfile', JSON.stringify(profile));
  return profile;
}

function loginLocally(email: string, password: string) {
  const existing = JSON.parse(localStorage.getItem('localUsers') || '[]');
  const user = existing.find((u: any) => u.email === email);
  if (!user) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
  if (user.password !== password) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다');
  const { password: _pw, ...profile } = user;
  localStorage.setItem('userId', profile.customer_id);
  localStorage.setItem('userProfile', JSON.stringify(profile));
  return profile;
}

// ── 지역 자동완성 컴포넌트 ────────────────────────────────
function RegionAutocomplete({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [query, setQuery]         = useState(value);
  const [results, setResults]     = useState<string[]>([]);
  const [open, setOpen]           = useState(false);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    onChange('');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) { setResults([]); setOpen(false); return; }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const list = await searchLocations(val.trim());
        setResults(list.slice(0, 8));
        setOpen(list.length > 0);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
  };

  const handleSelect = (name: string) => {
    setQuery(name); onChange(name); setOpen(false); setResults([]);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text" value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => query && results.length > 0 && setOpen(true)}
          placeholder="강남, 수원, 해운대..."
          className={`w-full pl-8 pr-6 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-colors ${
            value ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
          }`}
        />
        {query && (
          <button type="button"
            onClick={() => { setQuery(''); onChange(''); setResults([]); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute z-[100] mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {searching ? (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">검색 중...</div>
          ) : results.length > 0 ? (
            <ul className="max-h-44 overflow-y-auto">
              {results.map((r, i) => (
                <li key={i}>
                  <button type="button" onClick={() => handleSelect(r)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    {r}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">결과 없음</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────
export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const redirectTo = (location.state as any)?.from || '/';
  const redirectMessage = (location.state as any)?.message || '';
  // URL 파라미터 tab=register 이면 회원가입 탭 기본 선택
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('tab') === 'register' ? 'register' : 'login'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // 이메일 중복 확인
  const [emailChecked, setEmailChecked]     = useState<boolean | null>(null); // null=미확인 true=사용가능 false=중복
  const [emailChecking, setEmailChecking]   = useState(false);

  const handleCheckEmail = async () => {
    if (!regForm.email || !/\S+@\S+\.\S+/.test(regForm.email)) {
      setEmailChecked(null);
      setError('올바른 이메일을 입력해주세요');
      return;
    }
    setEmailChecking(true);
    setError('');
    try {
      // 서버에서 확인
      const res = await fetch(`${API_BASE}/auth/check-email?email=${encodeURIComponent(regForm.email)}`, {
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        setEmailChecked(!data.exists);
        if (data.exists) setError('이미 사용중인 이메일입니다');
        setEmailChecking(false);
        return;
      }
    } catch {}
    // 로컬 확인 (서버 없을 때)
    const users = JSON.parse(localStorage.getItem('localUsers') || '[]');
    const exists = users.some((u: any) => u.email === regForm.email);
    setEmailChecked(!exists);
    if (exists) setError('이미 사용중인 이메일입니다');
    setEmailChecking(false);
  };

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [regForm, setRegForm]     = useState({
    name: '', email: '', password: '', passwordConfirm: '',
    phone: '', birth_date: '', gender: 'N', region_name: '',
    agree_terms: false, agree_privacy: false,
    marketing_consent: false, push_consent: false, email_consent: false, sms_consent: false,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm), signal: AbortSignal.timeout(4000),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      localStorage.setItem('userId', data.customer.customer_id);
      localStorage.setItem('userProfile', JSON.stringify(data.customer));
      // 팀원 DB의 bigint PK를 partnerCustomerId로 저장 (Fluentd 이벤트에서 customer_id로 사용)
      if (data.customer.id != null) {
        localStorage.setItem('partnerCustomerId', String(data.customer.id));
      }
      mergeGuestWishlist(data.customer.customer_id);
      mergeGuestWardrobe(data.customer.customer_id);
      await Logger.ensureCustomer();
      // 로그인 이벤트 → behavior_log (event_type: 'login' 소문자, customer_id: bigint)
      fetch(`${API_BASE}/logs/behavior`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: data.customer.id,
          event_type:  'login',
          page_url:    '/auth',
        }),
      }).catch(() => {});
      navigate(redirectTo);
    } catch {
      try {
        loginLocally(loginForm.email, loginForm.password);
        const uid = localStorage.getItem('userId') || '';
        mergeGuestWishlist(uid);
        mergeGuestWardrobe(uid);
        navigate(redirectTo);
      }
      catch (err: any) { setError(err.message || '로그인에 실패했습니다'); }
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!regForm.name.trim())       { setError('이름을 입력해주세요'); return; }
    if (!regForm.birth_date)        { setError('생년월일을 입력해주세요'); return; }
    if (!regForm.phone.trim())      { setError('전화번호를 입력해주세요'); return; }
    if (!/^010-\d{4}-\d{4}$/.test(regForm.phone)) { setError('올바른 전화번호를 입력해주세요'); return; }
    if (regForm.gender === 'N')     { setError('성별을 선택해주세요'); return; }
    if (regForm.password !== regForm.passwordConfirm) { setError('비밀번호가 일치하지 않습니다'); return; }
    if (!regForm.agree_terms || !regForm.agree_privacy) { setError('필수 약관에 동의해주세요'); return; }
    if (emailChecked !== true) { setError('이메일 중복 확인을 해주세요'); return; }
    setLoading(true);
    try {
      const anonymousId = getAnonymousId();
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...regForm, anonymous_id: anonymousId }), signal: AbortSignal.timeout(4000),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      localStorage.setItem('userId', data.customer.customer_id);
      localStorage.setItem('userProfile', JSON.stringify(data.customer));
      // 팀원 DB bigint PK → partnerCustomerId 저장 (wishlist/wardrobe API 인증에 사용)
      if (data.customer.id != null) {
        localStorage.setItem('partnerCustomerId', String(data.customer.id));
      }
      // 비로그인 → 회원 전환 기록 (converted + link)
      fetch(`${API_BASE}/anonymous-users/${anonymousId}/converted`, { method: 'PATCH' }).catch(() => {});
      if (data.customer.id != null) {
        fetch(`${API_BASE}/anonymous-users/${anonymousId}/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: data.customer.id }),
        }).catch(() => {});
      }
      mergeGuestWishlist(data.customer.customer_id);
      mergeGuestWardrobe(data.customer.customer_id);
      callPartnerSignup(regForm); // 팀원 서버 연동 (fire-and-forget)
      navigate('/onboarding');
    } catch {
      try {
        registerLocally(regForm);
        const uid = localStorage.getItem('userId') || '';
        mergeGuestWishlist(uid);
        mergeGuestWardrobe(uid);
        navigate('/onboarding');
      } catch (err: any) { setError(err.message || '회원가입에 실패했습니다'); }
    } finally { setLoading(false); }
  };

  const allAgree = regForm.agree_terms && regForm.agree_privacy &&
    regForm.agree_marketing && regForm.agree_push && regForm.agree_email && regForm.agree_sms;

  const handleAllAgree = (v: boolean) => setRegForm(f => ({
    ...f, agree_terms: v, agree_privacy: v, marketing_consent: v, push_consent: v, email_consent: v, sms_consent: v,
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-blue-600 px-6 py-8 text-center">
          <div className="text-4xl mb-2">🌤️</div>
          <h1 className="text-2xl font-bold text-white">WeatherFit</h1>
          <p className="text-blue-100 text-sm mt-1">날씨에 맞는 스타일 추천</p>
        </div>

        <div className="flex border-b">
          {(['login','register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mode === m ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
              }`}>
              {m === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>

        <div className="px-6 py-6">
          {redirectMessage && (
            <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
              <span>🔒</span> {redirectMessage}
            </div>
          )}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                <input type="email" required value={loginForm.email}
                  onChange={e => setLoginForm({...loginForm, email: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="example@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                <input type="password" required value={loginForm.password}
                  onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {loading ? '로그인 중...' : '로그인'}
              </button>
              <p className="text-center text-sm text-gray-500">
                계정이 없으신가요?{' '}
                <button type="button" onClick={() => setMode('register')} className="text-blue-600 font-medium hover:underline">회원가입</button>
              </p>
            </form>

          ) : (
            <form onSubmit={handleRegister} className="space-y-4 max-h-[60vh] overflow-y-auto p-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">기본 정보</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
                  <input type="text" value={regForm.name}
                    onChange={e => setRegForm({...regForm, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="홍길동" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">생년월일 <span className="text-red-500">*</span></label>
                  <input type="date" value={regForm.birth_date}
                    onChange={e => setRegForm({...regForm, birth_date: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일 *</label>
                <div className="flex gap-2">
                  <input type="email" required value={regForm.email}
                    onChange={e => { setRegForm({...regForm, email: e.target.value}); setEmailChecked(null); setEmailChecking(false); }}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                      emailChecked === true ? 'border-green-400 bg-green-50' :
                      emailChecked === false ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="example@email.com" />
                  <button type="button" onClick={handleCheckEmail} disabled={emailChecking || !regForm.email}
                    className="px-3 py-2 text-xs font-medium border rounded-lg whitespace-nowrap transition-colors disabled:opacity-50 bg-gray-50 border-gray-300 hover:bg-gray-100">
                    {emailChecking ? '확인중...' : '중복확인'}
                  </button>
                </div>
                {emailChecked === true && (
                  <p className="mt-1 text-xs text-green-600 flex items-center gap-1">✅ 사용 가능한 이메일입니다</p>
                )}
                {emailChecked === false && (
                  <p className="mt-1 text-xs text-red-500 flex items-center gap-1">❌ 이미 사용중인 이메일입니다</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">전화번호 <span className="text-red-500">*</span></label>
                <input type="tel" value={regForm.phone}
                  onChange={e => {
                    // 숫자만 추출 후 010-XXXX-XXXX 형식으로 하이픈 자동 추가
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    let formatted = digits;
                    if (digits.length > 7) formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
                    else if (digits.length > 3) formatted = digits.slice(0, 3) + '-' + digits.slice(3);
                    setRegForm({...regForm, phone: formatted});
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                    regForm.phone && !/^010-\d{4}-\d{4}$/.test(regForm.phone) ? 'border-red-400' : 'border-gray-300'
                  }`}
                  placeholder="010-0000-0000" />
                {regForm.phone && !/^010-\d{4}-\d{4}$/.test(regForm.phone) && (
                  <p className="mt-1 text-xs text-red-500">올바른 전화번호를 입력해주세요</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">성별 <span className="text-red-500">*</span></label>
                <select value={regForm.gender}
                  onChange={e => setRegForm({...regForm, gender: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                  <option value="N">선택해주세요</option>
                  <option value="MALE">남성</option>
                  <option value="FEMALE">여성</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">지역</label>
                <RegionAutocomplete
                  value={regForm.region_name}
                  onChange={name => setRegForm({...regForm, region_name: name})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 *</label>
                <input type="password" required minLength={8} value={regForm.password}
                  onChange={e => setRegForm({...regForm, password: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="8자 이상" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인 *</label>
                <input type="password" required value={regForm.passwordConfirm}
                  onChange={e => setRegForm({...regForm, passwordConfirm: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="비밀번호 재입력" />
              </div>

              <div className="border border-gray-200 rounded-xl p-4 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer pb-2 border-b border-gray-100">
                  <input type="checkbox" checked={allAgree} onChange={e => handleAllAgree(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-sm font-semibold text-gray-800">전체 동의</span>
                </label>
                {[
                  { key: 'agree_terms',     label: '이용약관 동의',         req: true },
                  { key: 'agree_privacy',   label: '개인정보처리방침 동의', req: true },
                  { key: 'marketing_consent', label: '마케팅 정보 수신 동의', req: false },
                  { key: 'push_consent',      label: '푸시 알림 동의',        req: false },
                  { key: 'email_consent',     label: '이메일 수신 동의',      req: false },
                  { key: 'sms_consent',       label: 'SMS 수신 동의',         req: false },
                ].map(({ key, label, req }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={(regForm as any)[key]}
                      onChange={e => setRegForm({...regForm, [key]: e.target.checked})}
                      className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm text-gray-700">
                      {label} <span className={req ? 'text-red-500' : 'text-gray-400'}>{req ? '(필수)' : '(선택)'}</span>
                    </span>
                  </label>
                ))}
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {loading ? '가입 중...' : '회원가입'}
              </button>
              <p className="text-center text-sm text-gray-500">
                이미 계정이 있으신가요?{' '}
                <button type="button" onClick={() => setMode('login')} className="text-blue-600 font-medium hover:underline">로그인</button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
