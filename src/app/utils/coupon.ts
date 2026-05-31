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

const today = () => new Date().toISOString().slice(0, 10);

export function isCouponValid(c: CouponItem): boolean {
  const t = today();
  return c.valid_from <= t && t <= c.valid_until;
}

export function calcDiscount(coupon: CouponItem, orderAmt: number): number {
  if (coupon.min_order_amt && orderAmt < coupon.min_order_amt) return 0;
  let d = coupon.discount_type === 'amount'
    ? coupon.discount_value
    : Math.floor(orderAmt * coupon.discount_value / 100);
  if (coupon.max_discount) d = Math.min(d, coupon.max_discount);
  return d;
}
