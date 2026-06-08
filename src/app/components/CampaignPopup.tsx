import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';

const API_BASE    = import.meta.env.VITE_API_URL     || 'http://localhost:4000/api';
const FLUENTD_URL = import.meta.env.VITE_FLUENTD_URL || 'http://210.104.76.135:9880';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 비로그인 UUID 취득 (없으면 생성)
export function getAnonymousId(): string {
  let id = localStorage.getItem('anonymous_id');
  if (!id) {
    id = generateUUID();
    localStorage.setItem('anonymous_id', id);
  }
  return id;
}

// 비로그인 방문 로그 → /api/logs/behavior (Fluentd 연결 오류 방지)
function sendAnonymousVisit(pageUrl: string) {
  const anonymousId = getAnonymousId();
  fetch(`${API_BASE}/logs/behavior`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type:   'page_view',
      customer_id:  null,
      page_url:     pageUrl,
      anonymous_id: anonymousId,
    }),
    keepalive: true,
  }).catch(() => {});
}

const today = () => new Date().toISOString().slice(0, 10);

interface PopupState {
  show:       boolean;
  message:    string;
  campaignId: string | null;
}

export default function CampaignPopup() {
  const [popup, setPopup] = useState<PopupState>({ show: false, message: '', campaignId: null });
  const navigate   = useNavigate();
  const location   = useLocation();

  const isLoggedIn = (): boolean => {
    const userId = localStorage.getItem('userId');
    return !!userId && !userId.startsWith('anon_');
  };

  useEffect(() => {
    const pageUrl = location.pathname;

    if (isLoggedIn()) {
      const customerId = localStorage.getItem('partnerCustomerId');
      if (!customerId) return;

      // 신규 캠페인 팝업: /api/campaign-popup (Node.js 경로, 오늘 날짜 기반 dismiss 지원)
      fetch(`${API_BASE}/campaign-popup?customerId=${customerId}`)
        .then(r => r.json())
        .then(data => {
          if (!data?.show || !data?.id) return;
          // 오늘 이미 "오늘 그만보기" 를 눌렀으면 스킵
          const dismissKey = `campaign_dismiss_${data.id}`;
          if (localStorage.getItem(dismissKey) === today()) return;
          setPopup({ show: true, message: data.message || '특별 혜택을 확인하세요!', campaignId: data.id });
        })
        .catch(() => {
          // 신규 API 실패 시 기존 popup-check 폴백
          fetch(`${API_BASE}/campaigns/popup-check/customer?customerId=${customerId}`)
            .then(r => r.json())
            .then(data => {
              if (!data?.showPopup) return;
              const cid = data.campaignId ? String(data.campaignId) : null;
              const sessionKey = cid ? `popup_closed_campaign_${cid}` : 'popup_closed_campaign_unknown';
              if (sessionStorage.getItem(sessionKey)) return;
              setPopup({ show: true, message: data.message || '특별 혜택을 확인하세요!', campaignId: cid });
            })
            .catch(() => {});
        });
    } else {
      // 비로그인 사용자: 방문 로그 전송
      sendAnonymousVisit(pageUrl);

      if (localStorage.getItem('popup_closed') === 'true') return;

      const anonymousId = getAnonymousId();
      fetch(`${API_BASE}/campaigns/popup-check?anonymousId=${anonymousId}`)
        .then(r => r.json())
        .then(data => {
          if (data?.showPopup) {
            setPopup({ show: true, message: data.message || '회원가입하고 특별 혜택을 받아보세요!', campaignId: null });
            fetch(`${API_BASE}/anonymous-users/${anonymousId}/popup-shown`, { method: 'PATCH' }).catch(() => {});
          }
        })
        .catch(() => {});
    }
  // pathname 변경(페이지 이동)마다 체크
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleClose = () => {
    if (isLoggedIn()) {
      const sessionKey = popup.campaignId
        ? `popup_closed_campaign_${popup.campaignId}`
        : 'popup_closed_campaign_unknown';
      sessionStorage.setItem(sessionKey, 'true');
    } else {
      localStorage.setItem('popup_closed', 'true');
    }
    setPopup({ show: false, message: '', campaignId: null });
  };

  // "오늘 그만보기" — 오늘 날짜를 localStorage에 저장해 당일 재노출 차단
  const handleDismissToday = () => {
    if (popup.campaignId) {
      localStorage.setItem(`campaign_dismiss_${popup.campaignId}`, today());
    }
    setPopup({ show: false, message: '', campaignId: null });
  };

  const handleSignup = () => {
    setPopup({ show: false, message: '', campaignId: null });
    navigate('/auth', { state: { mode: 'register' } });
  };

  if (!popup.show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="text-center">
          <div className="text-3xl mb-2">🎁</div>
          <h2 className="text-lg font-bold text-gray-900">특별 혜택 안내</h2>
          <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{popup.message}</p>
        </div>
        <div className="flex flex-col gap-2">
          {!isLoggedIn() && (
            <button
              onClick={handleSignup}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              회원가입하기
            </button>
          )}
          {isLoggedIn() && popup.campaignId && (
            <button
              onClick={handleDismissToday}
              className="w-full py-3 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-900 transition-colors"
            >
              오늘 그만보기
            </button>
          )}
          <button
            onClick={handleClose}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
