/**
 * WeatherFit 백엔드 API 연동 유틸리티 (ERD v2 기준)
 * VITE_API_URL 환경변수 없으면 localhost:4000 사용
 */
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API 오류 ${res.status}: ${path}`);
  return res.json();
}

// ── Product ──────────────────────────────────
export const fetchProducts    = (category = 'all') =>
  request<any[]>(`/products${category !== 'all' ? `?category=${category}` : ''}`);

export const fetchProductById = (id: string) =>
  request<any>(`/products/${id}`);

// ── Customer ─────────────────────────────────
export const fetchCustomer  = (id: string) => request<any>(`/customers/${id}`);
export const upsertCustomer = (data: {
  customer_id: string;
  cold_sensitivity?: number;
  activity_level?: string;
  preferred_style?: string;
}) => request('/customers', { method: 'POST', body: JSON.stringify(data) });

// ── Wardrobe ──────────────────────────────────
export const fetchWardrobe      = (customerId: string) =>
  request<any[]>(`/wardrobe/${customerId}`);

export const addWardrobeItem    = (data: {
  wardrobe_id: string; customer_id: string;
  category: string; style: string;
  color_id?: number; warmth: number;
}) => request('/wardrobe', { method: 'POST', body: JSON.stringify(data) });

export const deleteWardrobeItem = (wardrobeId: string) =>
  request(`/wardrobe/${wardrobeId}`, { method: 'DELETE' });

// ── Purchase ──────────────────────────────────
export const fetchCart = (customerId: string) =>
  request<any[]>(`/purchase/${customerId}/cart`);

export const addToCart = (data: {
  purchase_id: string; customer_id: string;
  product_id: string; size: string; price: number;
}) => request('/purchase', { method: 'POST', body: JSON.stringify(data) });

export const updatePurchaseStatus = (purchaseId: string, status: string) =>
  request(`/purchase/${purchaseId}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  });

// ── Feedback ──────────────────────────────────
export const saveFeedback = (data: {
  feedback_id: string; customer_id: string;
  actual_temp: number; feels_like_temp: number;
  humidity: number; wind_speed: number;
  weather_condition: string;
  recommended_outfit: string[];
  feedback: string;
  region_id?: number;
}) => request('/feedback', { method: 'POST', body: JSON.stringify(data) });

// ── Behavior Log ──────────────────────────────
export const logBehavior = (data: {
  customer_id?: string; action: string;
  page_url?: string; item_id?: string;
  duration?: number; scroll_depth?: number;
}) => request('/logs/behavior', { method: 'POST', body: JSON.stringify(data) });
