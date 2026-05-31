/**
 * 쿠폰 유틸리티
 * - localStorage 기반 쿠폰 관리 (서버 없을 때 폴백)
 * - 사용된 쿠폰 즉시 삭제
 * - 기간 만료된 쿠폰 자동 제거
 */

export interface CouponItem {
  coupon_id: string;
  code: string;
  name: string;
  discount_type: 'amount' | 'percent';
  discount_value: number;
  min_order_amt: number;
  max_discount?: number;
  valid_from: string;   // 'YYYY-MM-DD'
  valid_until: string;  // 'YYYY-MM-DD'
}

/** 기본 제공 쿠폰 카탈로그 (서버 없을 때 참조) */
export const COUPON_CATALOG: CouponItem[] = [
  { coupon_id: 'cpn_welcome',  code: 'WELCOME10',  name: '신규가입 10% 할인',       discount_type: 'percent', discount_value: 10,    min_order_amt: 30000, max_discount: 10000, valid_from: '2025-01-01', valid_until: '2027-12-31' },
  { coupon_id: 'cpn_3000off',  code: 'SAVE3000',   name: '3,000원 할인',            discount_type: 'amount',  discount_value: 3000,  min_order_amt: 20000,                      valid_from: '2025-01-01', valid_until: '2027-12-31' },
  { coupon_id: 'cpn_5000off',  code: 'SAVE5000',   name: '5,000원 할인',            discount_type: 'amount',  discount_value: 5000,  min_order_amt: 50000,                      valid_from: '2025-01-01', valid_until: '2027-12-31' },
  { coupon_id: 'cpn_10000off', code: 'SAVE10000',  name: '10,000원 할인',           discount_type: 'amount',  discount_value: 10000, min_order_amt: 80000,                      valid_from: '2025-01-01', valid_until: '2027-12-31' },
  { coupon_id: 'cpn_summer20', code: 'SUMMER20',   name: '여름맞이 20% 할인',       discount_type: 'percent', discount_value: 20,    min_order_amt: 50000, max_discount: 30000, valid_from: '2026-06-01', valid_until: '2026-08-31' },
  { coupon_id: 'cpn_vip15',    code: 'VIP15',      name: 'VIP 전용 15% 할인',       discount_type: 'percent', discount_value: 15,    min_order_amt: 0,     max_discount: 50000, valid_from: '2025-01-01', valid_until: '2027-12-31' },
  { coupon_id: 'cpn_first30',  code: 'FIRST30',    name: '첫 구매 30% 할인',        discount_type: 'percent', discount_value: 30,    min_order_amt: 0,     max_discount: 20000, valid_from: '2025-01-01', valid_until: '2027-12-31' },
  { coupon_id: 'cpn_loyal5',   code: 'LOYAL5',     name: '재구매 고객 5% 할인',     discount_type: 'percent', discount_value: 5,     min_order_amt: 10000, max_discount: 5000,  valid_from: '2025-01-01', valid_until: '2027-12-31' },
  { coupon_id: 'cpn_spring15', code: 'SPRING15',   name: '봄 시즌 15% 할인',        discount_type: 'percent', discount_value: 15,    min_order_amt: 40000, max_discount: 15000, valid_from: '2026-03-01', valid_until: '2026-05-31' },
  { coupon_id: 'cpn_fall10',   code: 'FALL10',     name: '가을 10% 할인',           discount_type: 'percent', discount_value: 10,    min_order_amt: 30000, max_discount: 10000, valid_from: '2026-09-01', valid_until: '2026-11-30' },
  { coupon_id: 'cpn_bday20',   code: 'BIRTHDAY20', name: '생일 축하 20% 할인',      discount_type: 'percent', discount_value: 20,    min_order_amt: 0,     max_discount: 30000, valid_from: '2025-01-01', valid_until: '2027-12-31' },
  { coupon_id: 'cpn_friend',   code: 'FRIEND2000', name: '친구 초대 2,000원 할인',  discount_type: 'amount',  discount_value: 2000,  min_order_amt: 0,                          valid_from: '2025-01-01', valid_until: '2027-12-31' },
];

const today = () => new Date().toISOString().slice(0, 10);

/** 쿠폰 유효 여부 */
export function isCouponValid(c: CouponItem): boolean {
  const t = today();
  return c.valid_from <= t && t <= c.valid_until;
}

/** 사용자 쿠폰 목록 불러오기 (만료된 것 자동 제거) */
export function loadMyCoupons(userId: string): CouponItem[] {
  const key = `coupons_${userId}`;
  const raw: CouponItem[] = JSON.parse(localStorage.getItem(key) || '[]');
  const valid = raw.filter(isCouponValid);
  // 만료된 쿠폰이 있으면 저장소도 정리
  if (valid.length !== raw.length) {
    localStorage.setItem(key, JSON.stringify(valid));
  }
  return valid;
}

/** 쿠폰 사용 처리 — 목록에서 즉시 제거 */
export function consumeCoupon(userId: string, couponId: string): void {
  const key = `coupons_${userId}`;
  const raw: CouponItem[] = JSON.parse(localStorage.getItem(key) || '[]');
  const next = raw.filter(c => c.coupon_id !== couponId);
  localStorage.setItem(key, JSON.stringify(next));
}

/** 쿠폰 지급 (중복 방지) */
export function grantCoupon(userId: string, couponId: string): void {
  const key = `coupons_${userId}`;
  const raw: CouponItem[] = JSON.parse(localStorage.getItem(key) || '[]');
  if (raw.some(c => c.coupon_id === couponId)) return;
  const catalog = COUPON_CATALOG.find(c => c.coupon_id === couponId);
  if (!catalog || !isCouponValid(catalog)) return;
  raw.push(catalog);
  localStorage.setItem(key, JSON.stringify(raw));
}

/** 할인액 계산 */
export function calcDiscount(coupon: CouponItem, orderAmt: number): number {
  if (coupon.min_order_amt && orderAmt < coupon.min_order_amt) return 0;
  let d = coupon.discount_type === 'amount'
    ? coupon.discount_value
    : Math.floor(orderAmt * coupon.discount_value / 100);
  if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
  return d;
}

/** 신규가입 쿠폰 묶음 지급 */
export function grantWelcomeCoupons(userId: string): void {
  ['cpn_welcome', 'cpn_first30', 'cpn_friend'].forEach(id => grantCoupon(userId, id));
}
