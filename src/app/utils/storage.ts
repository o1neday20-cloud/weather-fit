/**
 * 사용자별 스토리지 키 관리
 * - 로그인한 경우: wardrobe_{userId}, cart_{userId} 등
 * - 비로그인 게스트: wardrobe_guest, cart_guest 등
 */

export function getUserId(): string {
  return localStorage.getItem('userId') || 'guest';
}

export function wardrobeKey(): string {
  const userId = localStorage.getItem('userId');
  if (userId && !userId.startsWith('anon_')) return `wardrobe_${userId}`;
  return 'wardrobe_guest';
}

export function deletedWardrobeKey(): string {
  const userId = localStorage.getItem('userId');
  if (userId && !userId.startsWith('anon_')) return `deletedWardrobe_${userId}`;
  return 'deletedWardrobe_guest';
}

export function cartKey(): string {
  return `cart_${getUserId()}`;
}

export function addressHistoryKey(): string {
  return `addressHistory_${getUserId()}`;
}

export interface SavedAddress {
  id: string;
  name: string;
  phone: string;
  address: string;
  detailAddress: string;
  message: string;
  savedAt: string;
}

/** 최근 배송지 목록 불러오기 (최대 5개) */
export function loadAddressHistory(): SavedAddress[] {
  return JSON.parse(localStorage.getItem(addressHistoryKey()) || '[]');
}

/** 배송지 저장 (중복 주소 제거 후 최신을 맨 앞에) */
export function saveAddress(addr: Omit<SavedAddress, 'id' | 'savedAt'>): void {
  const history = loadAddressHistory();
  const newEntry: SavedAddress = {
    ...addr,
    id: Date.now().toString(),
    savedAt: new Date().toISOString(),
  };
  // 같은 주소+상세 중복 제거
  const deduped = history.filter(h =>
    !(h.address === addr.address && h.detailAddress === addr.detailAddress)
  );
  const next = [newEntry, ...deduped].slice(0, 5);
  localStorage.setItem(addressHistoryKey(), JSON.stringify(next));
}

/** 실제 로그인 여부 확인 (anon_, user_ ID는 비로그인으로 처리) */
export function isLoggedIn(): boolean {
  const userId = localStorage.getItem('userId');
  if (!userId) return false;
  if (userId.startsWith('anon_')) return false;
  return true;
}
