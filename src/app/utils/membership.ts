/**
 * 멤버십 등급 관리 유틸
 * - 구매 시 누적 금액 갱신 → 등급 즉시 반영
 * - 4개월마다 누적 금액 기준으로 등급 재조정
 */

export type MembershipLevel = 'BASIC' | 'SILVER' | 'GOLD' | 'VIP';

// 등급 기준 (누적 구매 금액)
const THRESHOLDS: Record<MembershipLevel, number> = {
  BASIC:  0,
  SILVER: 100000,   // 10만원 이상
  GOLD:   300000,   // 30만원 이상
  VIP:    500000,   // 50만원 이상
};

function calcLevel(totalAmount: number): MembershipLevel {
  if (totalAmount >= THRESHOLDS.VIP)    return 'VIP';
  if (totalAmount >= THRESHOLDS.GOLD)   return 'GOLD';
  if (totalAmount >= THRESHOLDS.SILVER) return 'SILVER';
  return 'BASIC';
}

/** 구매 금액 누적 + 등급 업데이트 */
export function addPurchaseAmount(amount: number): MembershipLevel {
  const userId = localStorage.getItem('userId');
  if (!userId) return 'BASIC';

  const key = `membership_${userId}`;
  const data = JSON.parse(localStorage.getItem(key) || '{}');

  const now = new Date();
  // 4개월 주기 시작일 없으면 지금으로 설정
  if (!data.periodStart) {
    data.periodStart = now.toISOString();
  }

  // 4개월 경과 확인 → 경과했으면 기간 리셋
  const periodStart = new Date(data.periodStart);
  const monthsDiff = (now.getFullYear() - periodStart.getFullYear()) * 12
    + (now.getMonth() - periodStart.getMonth());

  if (monthsDiff >= 4) {
    // 4개월 지났으면 기간 리셋
    data.totalAmount = amount; // 이번 구매부터 새 기간 시작
    data.periodStart = now.toISOString();
  } else {
    data.totalAmount = (data.totalAmount || 0) + amount;
  }

  const newLevel = calcLevel(data.totalAmount);
  data.level = newLevel;
  data.lastUpdated = now.toISOString();

  localStorage.setItem(key, JSON.stringify(data));

  // userProfile에도 반영
  const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
  profile.membership_level = newLevel;
  profile.totalPurchaseAmount = data.totalAmount;
  localStorage.setItem('userProfile', JSON.stringify(profile));

  return newLevel;
}

/** 현재 멤버십 정보 조회 */
export function getMembershipInfo(): {
  level: MembershipLevel;
  totalAmount: number;
  nextLevel: MembershipLevel | null;
  nextThreshold: number | null;
  progressPct: number;
  daysUntilReset: number;
} {
  const userId = localStorage.getItem('userId');
  const key = `membership_${userId}`;
  const data = JSON.parse(localStorage.getItem(key) || '{}');

  const totalAmount = data.totalAmount || 0;
  const level = calcLevel(totalAmount);

  // 다음 등급
  const levels: MembershipLevel[] = ['BASIC', 'SILVER', 'GOLD', 'VIP'];
  const currentIdx = levels.indexOf(level);
  const nextLevel = currentIdx < levels.length - 1 ? levels[currentIdx + 1] : null;
  const nextThreshold = nextLevel ? THRESHOLDS[nextLevel] : null;

  // 진행률
  const currentThreshold = THRESHOLDS[level];
  const progressPct = nextThreshold
    ? Math.min(100, Math.round(((totalAmount - currentThreshold) / (nextThreshold - currentThreshold)) * 100))
    : 100;

  // 리셋까지 남은 일수
  const periodStart = data.periodStart ? new Date(data.periodStart) : new Date();
  const resetDate = new Date(periodStart);
  resetDate.setMonth(resetDate.getMonth() + 4);
  const daysUntilReset = Math.max(0, Math.ceil((resetDate.getTime() - Date.now()) / 86400000));

  return { level, totalAmount, nextLevel, nextThreshold, progressPct, daysUntilReset };
}
