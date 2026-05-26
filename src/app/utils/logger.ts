// ================================================================
// Logger v2 — Fluentd → Kafka → MySQL 파이프라인
//
// 흐름:
//   앱 이벤트 → sendToFluentd() → Fluentd(24224)
//             → Kafka 토픽 → Consumer → MySQL
//
// Fluentd 미연결 시: API 서버 직접 호출로 폴백
// ================================================================

const API_BASE      = import.meta.env.VITE_API_URL      || 'http://localhost:4000/api';
const FLUENTD_URL   = import.meta.env.VITE_FLUENTD_URL  || 'http://localhost:24224';
const USE_FLUENTD   = import.meta.env.VITE_USE_FLUENTD  === 'true';

export type ActionType =
  | 'page_view' | 'product_view' | 'add_to_cart' | 'purchase'
  | 'outfit_view' | 'feedback' | 'search' | 'wardrobe_add'
  | 'wishlist_add' | 'wishlist_remove' | 'coupon_apply';

export interface LogData {
  timestamp: string;
  userId: string;
  eventType: string;
  eventData: any;
  pageUrl: string;
}

// ── Fluentd 전송 ──────────────────────────────────────────────
// Fluentd HTTP input: POST http://localhost:24224/{tag}
// tag가 Kafka 토픽 이름이 됩니다 (fluent.conf의 <match> 참조)
async function sendToFluentd(tag: string, payload: object): Promise<boolean> {
  try {
    const res = await fetch(`${FLUENTD_URL}/${tag}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        clientTimestamp: new Date().toISOString(),
        pageUrl: window.location.href,
      }),
      signal: AbortSignal.timeout(3000),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── API 직접 전송 (Fluentd 폴백) ──────────────────────────────
async function sendToApi(endpoint: string, payload: object): Promise<void> {
  try {
    await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (e) {
    console.warn('[Logger] API 전송 실패 (무시됨):', e);
  }
}

// ── partnerCustomerId(bigint) 안전 취득 ──────────────────────
// Kafka Consumer가 Long.parseLong()으로 처리 → 반드시 숫자
// 비로그인(anon_) 또는 미설정이면 null 반환
function getPartnerCustId(): number | null {
  const raw    = localStorage.getItem('partnerCustomerId');
  const userId = localStorage.getItem('userId');
  // anon_ 사용자 or 미로그인이면 null
  if (!raw || userId?.startsWith('anon_')) return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

// ── item_id 숫자 변환: 'prod_N' → N ──────────────────────────
// behavior_log.item_id 컬럼이 bigint → 숫자로만 전송
function toItemId(id?: string | number | null): number | null {
  if (id == null) return null;
  const n = Number(String(id).replace(/^prod_/i, ''));
  return isNaN(n) || n === 0 ? null : n;
}

// ── 파이프라인 선택 전송 ──────────────────────────────────────
// 항상 API(/logs/behavior)로 전송 → DB 저장 + Kafka 포워딩 보장
// VITE_USE_FLUENTD=true 이면 Fluentd에도 추가 전송 (Kafka 직접 파이프라인)
// Fluentd 성공 여부와 무관하게 API는 항상 호출됨
async function sendBehavior(payload: {
  customer_id:  number | null;
  action:       ActionType;
  page_url:     string;
  item_id?:     number | null;   // bigint 숫자만 (DB behavior_log.item_id 타입 일치)
  duration?:    number;          // 초 단위
  scroll_depth?: number;         // 0~100 정수
}) {
  // 1) API 서버 항상 전송 (DB 직접 저장 + 서버 Kafka 포워딩)
  await sendToApi('/logs/behavior', payload);

  // 2) Fluentd 추가 전송 (Kafka 직접 파이프라인 — 실패해도 무시)
  if (USE_FLUENTD) {
    sendToFluentd('weatherfit.behavior', payload); // fire-and-forget
  }
}

function toActionType(eventType: string): ActionType {
  const map: Record<string, ActionType> = {
    page_view:          'page_view',
    product_view:       'product_view',
    add_to_cart:        'add_to_cart',
    purchase_completed: 'purchase',
    outfit_generated:   'outfit_view',
    forecast_selected:  'outfit_view',
    feedback_submitted: 'feedback',
    search:             'search',
    item_added:         'wardrobe_add',
    wishlist_add:       'wishlist_add',
    wishlist_remove:    'wishlist_remove',
  };
  return map[eventType] ?? 'page_view';
}

export class Logger {
  private static logs: LogData[] = [];

  static log(eventType: string, eventData: any) {
    const userId = this.getUserId();
    const logEntry: LogData = {
      timestamp: new Date().toISOString(),
      userId, eventType, eventData,
      pageUrl: window.location.href,
    };

    // 1) localStorage 저장
    this.logs.push(logEntry);
    this.saveLogs();

    // 2) 파이프라인으로 전송 (Fluentd or API)
    const rawDuration   = eventData?.duration    ?? eventData?.duration_sec;
    const rawScroll     = eventData?.scrollDepth ?? eventData?.scroll_depth;
    sendBehavior({
      customer_id:  getPartnerCustId(),                         // partnerCustomerId(bigint), anon_→null
      action:       toActionType(eventType),
      page_url:     window.location.href,
      item_id:      toItemId(eventData?.productId ?? eventData?.itemId), // 'prod_N'→N 숫자 변환
      duration:     rawDuration  != null ? Math.round(rawDuration)  : undefined, // 초, 정수
      scroll_depth: rawScroll    != null ? Math.round(rawScroll)    : undefined, // 0~100 정수
    });
  }

  // ── 구매 완료 전송 ─────────────────────────────────────────
  static async logPurchase(items: Array<{
    productId: string; productName: string;
    size: string; quantity: number; price: number;
  }>, couponId?: string, discountAmt?: number) {
    const userId = this.getUserId();
    const partnerCustomerId = localStorage.getItem('partnerCustomerId');
    for (const item of items) {
      const purchaseId = `pur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payload = {
        purchase_id: purchaseId, customer_id: userId,
        product_id: item.productId, status: 'paid',
        size: item.size, price: item.price * item.quantity,
        coupon_id: couponId ?? null, discount_amt: discountAmt ?? 0,
        partnerCustomerId: partnerCustomerId ? Number(partnerCustomerId) : null,
      };

      // Fluentd → Kafka weatherfit.purchase
      if (USE_FLUENTD) {
        const ok = await sendToFluentd('weatherfit.purchase', payload);
        if (ok) continue;
      }
      // 폴백: API 직접
      await sendToApi('/purchase', payload);
    }
  }

  // ── 피드백 전송 ────────────────────────────────────────────
  static async logFeedback(data: {
    actualTemp: number; feelsLikeTemp: number;
    humidity: number; windSpeed: number;
    weatherCondition: string; recommendedOutfit: string[];
    feedback: string; regionId?: number;
  }) {
    const userId = this.getUserId();
    const partnerCustomerId = localStorage.getItem('partnerCustomerId');
    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      feedback_id: feedbackId, customer_id: userId,
      region_id: data.regionId ?? null,
      actual_temp: data.actualTemp, feels_like_temp: data.feelsLikeTemp,
      humidity: data.humidity, wind_speed: data.windSpeed,
      weather_condition: data.weatherCondition,
      recommended_outfit: data.recommendedOutfit,
      feedback: data.feedback,
      partnerCustomerId: partnerCustomerId ? Number(partnerCustomerId) : null,
    };

    // Fluentd → Kafka weatherfit.feedback
    if (USE_FLUENTD) {
      const ok = await sendToFluentd('weatherfit.feedback', payload);
      if (ok) return;
    }
    await sendToApi('/feedback', payload);
  }

  // ── 찜 이벤트 전송 ─────────────────────────────────────────
  static async logWishlist(productId: string, action: 'add' | 'remove') {
    const custId    = getPartnerCustId();
    const numItemId = toItemId(productId); // 'prod_N' → N
    const payload   = { customer_id: custId, product_id: numItemId, action };

    if (USE_FLUENTD) {
      const ok = await sendToFluentd('weatherfit.wishlist', payload);
      if (ok) return;
    }
    // wishlist는 별도 API가 처리하므로 behavior_log에만 기록
    await sendToApi('/logs/behavior', {
      customer_id: custId,
      action:      action === 'add' ? 'wishlist_add' : 'wishlist_remove',
      page_url:    window.location.href,
      item_id:     numItemId, // 숫자 bigint
    });
  }

  // ── 옷장 추가 전송 ─────────────────────────────────────────
  static async logWardrobeAdd(item: {
    wardrobeId: string; category: string;
    style: string; colorId?: number; warmth: number;
  }) {
    const custId = getPartnerCustId();
    const payload = {
      wardrobe_id: item.wardrobeId, customer_id: custId,
      category: item.category, style: item.style,
      color_id: item.colorId ?? null, warmth: item.warmth,
    };

    if (USE_FLUENTD) {
      const ok = await sendToFluentd('weatherfit.wardrobe', payload);
      if (ok) return;
    }
    await sendToApi('/wardrobe', payload);
  }

  // ── customer 자동 등록 ─────────────────────────────────────
  static async ensureCustomer() {
    const userId = this.getUserId();
    const userPref = JSON.parse(localStorage.getItem('userPreference') || '{}');
    try {
      await fetch(`${API_BASE}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id:      userId,
          cold_sensitivity: userPref.coldSensitivity ?? 0,
          activity_level:   userPref.activityLevel   ?? 'medium',
          preferred_style:  userPref.style           ?? 'casual',
        }),
      });
    } catch (e) {
      console.warn('[Logger] customer 등록 실패:', e);
    }
  }

  static getUserId(): string {
    // 로그인한 경우만 실제 userId 반환
    const userId = localStorage.getItem('userId');
    if (userId && !userId.startsWith('anon_') && !userId.startsWith('user_')) {
      return userId;
    }
    // 비로그인 — anonId로만 로깅, userId에는 절대 저장 안 함
    let anonId = localStorage.getItem('anonId');
    if (!anonId) {
      anonId = 'anon_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('anonId', anonId);
    }
    return anonId;
  }

  // 실제 로그인 여부 확인 (장바구니 등 기능 제어용)
  static isLoggedIn(): boolean {
    const userId = localStorage.getItem('userId');
    if (!userId) return false;
    if (userId.startsWith('anon_')) return false;
    return true;
  }

  static saveLogs() { localStorage.setItem('appLogs', JSON.stringify(this.logs)); }
  static getLogs(): LogData[] {
    const stored = localStorage.getItem('appLogs');
    if (stored) this.logs = JSON.parse(stored);
    return this.logs;
  }
  static clearLogs() { this.logs = []; localStorage.removeItem('appLogs'); }
  static exportLogs(): string { return JSON.stringify(this.logs, null, 2); }
}
