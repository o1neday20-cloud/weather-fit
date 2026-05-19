import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import Navigation from '../components/Navigation';
import { Ticket, ArrowLeft, Tag, Copy, Check, Clock } from 'lucide-react';
import { loadMyCoupons, CouponItem, isCouponValid } from '../utils/coupon';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';

const today = () => new Date().toISOString().slice(0, 10);

function daysLeft(until: string): number {
  const d = Math.ceil((new Date(until).getTime() - Date.now()) / 86400000);
  return d;
}

export default function Coupons() {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [copied, setCopied]     = useState('');

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (!userId) { navigate('/auth'); return; }
    fetchCoupons(userId);
  }, [navigate]);

  const fetchCoupons = async (userId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/coupons/my/${userId}`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) { setCoupons(await res.json()); setLoading(false); return; }
    } catch {}
    // 로컬 폴백 — 만료 자동 정리
    setCoupons(loadMyCoupons(userId));
    setLoading(false);
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const discountText = (c: CouponItem) =>
    c.discount_type === 'amount'
      ? `${c.discount_value.toLocaleString()}원 할인`
      : `${c.discount_value}% 할인${c.max_discount ? ` (최대 ${c.max_discount.toLocaleString()}원)` : ''}`;

  const urgencyColor = (until: string) => {
    const d = daysLeft(until);
    if (d <= 3)  return 'text-red-500';
    if (d <= 7)  return 'text-orange-500';
    if (d <= 30) return 'text-yellow-600';
    return 'text-gray-400';
  };

  const urgencyText = (until: string) => {
    const d = daysLeft(until);
    if (d === 0) return '오늘 만료';
    if (d <= 30) return `${d}일 남음`;
    return `~ ${new Date(until).toLocaleDateString('ko-KR')} 까지`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">내 쿠폰</h1>
          {coupons.length > 0 && (
            <span className="ml-auto text-sm text-gray-500">{coupons.length}장 보유</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Ticket className="w-16 h-16 text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-500 mb-2">보유한 쿠폰이 없습니다</h3>
            <p className="text-sm text-gray-400">이벤트나 혜택을 통해 쿠폰을 받아보세요</p>
          </div>
        ) : (
          <div className="space-y-3">
            {coupons.map(c => {
              const days = daysLeft(c.valid_until);
              const isUrgent = days <= 7;

              return (
                <div key={c.coupon_id}
                  className={`bg-white rounded-xl shadow-sm overflow-hidden border ${isUrgent ? 'border-red-100' : 'border-transparent'}`}>
                  <div className="flex">
                    {/* 왼쪽 — 할인액 배지 */}
                    <div className={`w-24 flex-shrink-0 flex items-center justify-center p-3 ${isUrgent ? 'bg-red-500' : 'bg-blue-600'}`}>
                      <div className="text-center text-white">
                        <Tag className="w-5 h-5 mx-auto mb-1 opacity-75" />
                        <div className="text-lg font-bold leading-tight">
                          {c.discount_type === 'amount'
                            ? `${(c.discount_value / 1000).toFixed(0)}K`
                            : `${c.discount_value}%`}
                        </div>
                        <div className="text-[10px] opacity-75">
                          {c.discount_type === 'amount' ? '원 할인' : '할인'}
                        </div>
                      </div>
                    </div>

                    {/* 오른쪽 — 상세 */}
                    <div className="flex-1 p-4 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 text-sm leading-tight">{c.name}</h3>
                        {isUrgent && (
                          <span className="flex-shrink-0 px-2 py-0.5 bg-red-50 text-red-500 text-[10px] font-bold rounded-full">
                            곧 만료
                          </span>
                        )}
                      </div>

                      <p className={`text-xs font-medium mb-1 ${isUrgent ? 'text-red-500' : 'text-blue-500'}`}>
                        {discountText(c)}
                      </p>

                      {c.min_order_amt > 0 && (
                        <p className="text-xs text-gray-400 mb-1">
                          {c.min_order_amt.toLocaleString()}원 이상 구매 시
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <div className={`flex items-center gap-1 text-xs ${urgencyColor(c.valid_until)}`}>
                          <Clock className="w-3 h-3" />
                          {urgencyText(c.valid_until)}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <code className="text-[11px] bg-gray-100 px-1.5 py-0.5 rounded font-mono text-gray-600">
                            {c.code}
                          </code>
                          <button
                            onClick={() => handleCopy(c.code)}
                            className={`p-1 rounded transition-colors ${
                              copied === c.code ? 'text-green-500' : 'text-gray-400 hover:text-blue-500'
                            }`}
                          >
                            {copied === c.code
                              ? <Check className="w-3.5 h-3.5" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 만료 프로그레스 바 */}
                  {days <= 30 && (
                    <div className="h-1 bg-gray-100">
                      <div
                        className={`h-full transition-all ${isUrgent ? 'bg-red-400' : 'bg-yellow-400'}`}
                        style={{ width: `${Math.max(5, (days / 30) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Navigation />
    </div>
  );
}
