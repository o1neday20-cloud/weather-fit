export interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  location: string;
  date?: string;
}
export interface WeeklyForecast {
  date: string;
  dayOfWeek: string;
  temperature: { min: number; max: number };
  condition: string;
  humidity: number;
  windSpeed: number;
}
// ✅ API 키 설정
const KAKAO_REST_KEY = '8d1146aa96d57f22ee542237a42b8a5f';
const SERVICE_KEY = 'a63da1824b849facc68af62cff78ebd060ce4bc5592719ac271fefebbee8494f';
// ─────────────────────────────────────────────
// 1. 위치 관련
// ─────────────────────────────────────────────
// 서울 기본 좌표 — 위치 권한 없을 때 폴백
const SEOUL_COORDS = { lat: 37.5665, lon: 126.9780 };

// GPS로 현재 좌표 획득 — 권한 거부/미지원 시 서울로 폴백
export async function getCurrentCoords(): Promise<{ lat: number; lon: number; isDefault?: boolean }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve({ ...SEOUL_COORDS, isDefault: true }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ ...SEOUL_COORDS, isDefault: true }),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}
// 카카오 API로 지역명 → 좌표 변환
async function searchLocationCoords(query: string): Promise<{ name: string; lat: number; lon: number } | null> {
  try {
    const addrRes = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } });
    const addrData = await addrRes.json();
    if (addrData.documents?.length > 0) {
      const doc = addrData.documents[0];
      return { name: doc.address_name, lat: parseFloat(doc.y), lon: parseFloat(doc.x) };
    }
    const kwRes = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } });
    const kwData = await kwRes.json();
    if (kwData.documents?.length > 0) {
      const doc = kwData.documents[0];
      return { name: doc.place_name, lat: parseFloat(doc.y), lon: parseFloat(doc.x) };
    }
    return null;
  } catch (e) {
    console.error('카카오 검색 에러:', e);
    return null;
  }
}
// 카카오 API로 좌표 → 지역명 변환 (GPS 사용 시)
async function coordsToLocationName(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lon}&y=${lat}`, { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } });
    const data = await res.json();
    if (data.documents?.length > 0) {
      const doc = data.documents[0];
      return `${doc.region_1depth_name} ${doc.region_2depth_name}`;
    }
    return '내 위치';
  } catch {
    return '내 위치';
  }
}
// ─────────────────────────────────────────────
// 2. 기상청 격자 변환 (Lambert Conformal Conic)
// ─────────────────────────────────────────────
function convertToGrid(lat: number, lon: number): { x: number; y: number } {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136, DEGRAD = Math.PI / 180.0, re = RE / GRID, slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return { x: Math.floor(ra * Math.sin(theta) + XO + 0.5), y: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5) };
}
// ─────────────────────────────────────────────
// 3. 단기예보 base_date / base_time 계산
// ─────────────────────────────────────────────
function getShortBaseDateTime(): { baseDate: string; baseTime: string } {
  const now = new Date(), baseTimes = [2, 5, 8, 11, 14, 17, 20, 23], hour = now.getHours();
  let baseHour = baseTimes[0];
  for (const t of baseTimes) { if (hour >= t) baseHour = t; }
  const baseDate = new Date(now);
  if (hour < 2) { baseDate.setDate(baseDate.getDate() - 1); baseHour = 23; }
  const yyyy = baseDate.getFullYear(), mm = String(baseDate.getMonth() + 1).padStart(2, '0'), dd = String(baseDate.getDate()).padStart(2, '0');
  return { baseDate: `${yyyy}${mm}${dd}`, baseTime: `${String(baseHour).padStart(2, '0')}00` };
}
// ─────────────────────────────────────────────
// 4. 날씨 상태 텍스트 변환
// ─────────────────────────────────────────────
function parseCondition(sky: string, pty: string): string {
  if (pty && pty !== '0') {
    if (pty === '1') return '비';
    if (pty === '2') return '비/눈';
    if (pty === '3') return '눈';
    return '소나기';
  }
  return sky === '1' ? '맑음' : sky === '3' ? '구름많음' : '흐림';
}
// ─────────────────────────────────────────────
// 5. 현재 날씨 (단기예보)
// ─────────────────────────────────────────────
export async function getCurrentWeather(location?: string): Promise<WeatherData> {
  try {
    let lat: number, lon: number, locationName: string;
    if (location) {
      const result = await searchLocationCoords(location);
      if (!result) throw new Error('지역 검색 실패');
      lat = result.lat; lon = result.lon; locationName = result.name;
    } else {
      const coords = await getCurrentCoords();
      lat = coords.lat; lon = coords.lon;
      locationName = coords.isDefault ? '서울 기준 날씨' : await coordsToLocationName(lat, lon);
    }
    const grid = convertToGrid(lat, lon);
    const { baseDate, baseTime } = getShortBaseDateTime();
    const params = new URLSearchParams({ serviceKey: SERVICE_KEY, numOfRows: '100', pageNo: '1', dataType: 'JSON', base_date: baseDate, base_time: baseTime, nx: String(grid.x), ny: String(grid.y) });
    const res = await fetch(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    const items: any[] = json.response.body.items.item;
    const fcstTime = items[0]?.fcstTime;
    const current = items.filter((i) => i.fcstTime === fcstTime);
    const getVal = (cat: string) => current.find((i: any) => i.category === cat)?.fcstValue ?? '0';
    const weatherResult = { temperature: Number(getVal('TMP')), humidity: Number(getVal('REH')), windSpeed: Number(getVal('WSD')), condition: parseCondition(getVal('SKY'), getVal('PTY')), location: locationName, date: new Date().toISOString() };
    localStorage.setItem('lastWeather', JSON.stringify(weatherResult));
    return weatherResult;
  } catch (e) {
    console.error('현재 날씨 에러:', e);
    return { temperature: 20, humidity: 50, windSpeed: 2, condition: '맑음', location: location || '서울 기준 날씨' };
  }
}
// ─────────────────────────────────────────────
// 6. 단기예보 3일치 (오늘~모레)
// ─────────────────────────────────────────────
async function getShortForecast(lat: number, lon: number): Promise<WeeklyForecast[]> {
  const grid = convertToGrid(lat, lon), { baseDate, baseTime } = getShortBaseDateTime();
  const params = new URLSearchParams({ serviceKey: SERVICE_KEY, numOfRows: '1000', pageNo: '1', dataType: 'JSON', base_date: baseDate, base_time: baseTime, nx: String(grid.x), ny: String(grid.y) });
  const res = await fetch(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`);
  const json = await res.json();
  const items: any[] = json.response.body.items.item;
  const byDate: Record<string, any[]> = {};
  for (const item of items) { if (!byDate[item.fcstDate]) byDate[item.fcstDate] = []; byDate[item.fcstDate].push(item); }
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  return Object.entries(byDate).map(([date, dayItems]) => {
    const temps = dayItems.filter((i) => i.category === 'TMP').map((i) => Number(i.fcstValue));
    const sky = dayItems.find((i) => i.category === 'SKY' && i.fcstTime === '1200')?.fcstValue ?? '1';
    const pty = dayItems.find((i) => i.category === 'PTY' && i.fcstTime === '1200')?.fcstValue ?? '0';
    const reh = dayItems.find((i) => i.category === 'REH' && i.fcstTime === '1200')?.fcstValue ?? '50';
    const wsd = dayItems.find((i) => i.category === 'WSD' && i.fcstTime === '1200')?.fcstValue ?? '2';
    const d = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`);
    return { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, dayOfWeek: DAYS[d.getDay()], temperature: { min: temps.length > 0 ? Math.min(...temps) : 15, max: temps.length > 0 ? Math.max(...temps) : 25 }, condition: parseCondition(sky, pty), humidity: Number(reh), windSpeed: Number(wsd) };
  });
}
// ─────────────────────────────────────────────
// 7. 중기예보 (D+3 ~ D+7)
// ─────────────────────────────────────────────
function getMidRegIds(locationName: string): { landRegId: string; tempRegId: string } {
  const n = locationName;
  if (n.includes('강릉') || n.includes('속초') || n.includes('동해시') || n.includes('삼척') || n.includes('고성') || n.includes('양양')) return { landRegId: '11D20000', tempRegId: '11D20501' };
  if (n.includes('서울') || n.includes('인천') || n.includes('경기') || n.includes('수원') || n.includes('성남') || n.includes('고양') || n.includes('용인') || n.includes('부천') || n.includes('안산') || n.includes('화성') || n.includes('평택') || n.includes('의정부') || n.includes('시흥') || n.includes('파주') || n.includes('김포') || n.includes('광명') || n.includes('군포') || n.includes('하남') || n.includes('오산') || n.includes('이천') || n.includes('안성') || n.includes('의왕') || n.includes('양평') || n.includes('여주') || n.includes('동두천') || n.includes('과천') || n.includes('구리') || n.includes('남양주') || n.includes('안양') || n.includes('포천') || n.includes('가평') || n.includes('양주') || n.includes('연천')) return { landRegId: '11B00000', tempRegId: '11B10101' };
  if (n.includes('강원') || n.includes('춘천') || n.includes('원주') || n.includes('철원') || n.includes('화천') || n.includes('양구') || n.includes('인제') || n.includes('홍천') || n.includes('횡성') || n.includes('평창') || n.includes('정선') || n.includes('태백')) return { landRegId: '11D10000', tempRegId: '11D10301' };
  if (n.includes('충북') || n.includes('청주') || n.includes('충주') || n.includes('제천') || n.includes('보은') || n.includes('옥천') || n.includes('증평') || n.includes('진천') || n.includes('괴산') || n.includes('음성') || n.includes('단양')) return { landRegId: '11C10000', tempRegId: '11C10301' };
  if (n.includes('충남') || n.includes('대전') || n.includes('세종') || n.includes('천안') || n.includes('공주') || n.includes('보령') || n.includes('아산') || n.includes('서산') || n.includes('논산') || n.includes('계룡') || n.includes('당진') || n.includes('금산') || n.includes('부여') || n.includes('서천') || n.includes('청양') || n.includes('홍성') || n.includes('예산') || n.includes('태안')) return { landRegId: '11C20000', tempRegId: '11C20401' };
  if (n.includes('전북') || n.includes('전라북') || n.includes('전주') || n.includes('군산') || n.includes('익산') || n.includes('정읍') || n.includes('남원') || n.includes('김제') || n.includes('완주') || n.includes('진안') || n.includes('무주') || n.includes('장수') || n.includes('임실') || n.includes('순창') || n.includes('고창') || n.includes('부안')) return { landRegId: '11F10000', tempRegId: '11F10201' };
  if (n.includes('전남') || n.includes('전라남') || n.includes('광주') || n.includes('목포') || n.includes('여수') || n.includes('순천') || n.includes('나주') || n.includes('광양') || n.includes('담양') || n.includes('곡성') || n.includes('구례') || n.includes('고흥') || n.includes('보성') || n.includes('화순') || n.includes('장흥') || n.includes('강진') || n.includes('해남') || n.includes('영암') || n.includes('무안') || n.includes('함평') || n.includes('영광') || n.includes('장성') || n.includes('완도') || n.includes('진도') || n.includes('신안')) return { landRegId: '11F20000', tempRegId: '11F20401' };
  if (n.includes('경북') || n.includes('경상북') || n.includes('대구') || n.includes('포항') || n.includes('경주') || n.includes('김천') || n.includes('안동') || n.includes('구미') || n.includes('영주') || n.includes('영천') || n.includes('상주') || n.includes('문경') || n.includes('경산') || n.includes('의성') || n.includes('청송') || n.includes('영양') || n.includes('영덕') || n.includes('청도') || n.includes('고령') || n.includes('성주') || n.includes('칠곡') || n.includes('예천') || n.includes('봉화') || n.includes('울진') || n.includes('울릉')) return { landRegId: '11H10000', tempRegId: '11H10701' };
  if (n.includes('경남') || n.includes('경상남') || n.includes('부산') || n.includes('울산') || n.includes('창원') || n.includes('진주') || n.includes('통영') || n.includes('사천') || n.includes('김해') || n.includes('밀양') || n.includes('거제') || n.includes('양산') || n.includes('의령') || n.includes('함안') || n.includes('창녕') || n.includes('남해') || n.includes('하동') || n.includes('산청') || n.includes('함양') || n.includes('거창') || n.includes('합천')) return { landRegId: '11H20000', tempRegId: '11H20201' };
  if (n.includes('제주') || n.includes('서귀포')) return { landRegId: '11G00000', tempRegId: '11G00201' };
  return { landRegId: '11B00000', tempRegId: '11B10101' };
}
async function getMidForecast(locationName: string): Promise<WeeklyForecast[]> {
  try {
    const now = new Date(), { landRegId, tempRegId } = getMidRegIds(locationName), hour = now.getHours();
    const baseHour = hour < 18 ? '0600' : '1800', baseDate = new Date(now);
    if (hour < 6) baseDate.setDate(baseDate.getDate() - 1);
    const tmFc = `${baseDate.getFullYear()}${String(baseDate.getMonth() + 1).padStart(2, '0')}${String(baseDate.getDate()).padStart(2, '0')}${baseHour}`;
    const landParams = new URLSearchParams({ serviceKey: SERVICE_KEY, numOfRows: '10', pageNo: '1', dataType: 'JSON', regId: landRegId, tmFc });
    const tempParams = new URLSearchParams({ serviceKey: SERVICE_KEY, numOfRows: '10', pageNo: '1', dataType: 'JSON', regId: tempRegId, tmFc });
    const [landRes, tempRes] = await Promise.all([fetch(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?${landParams}`), fetch(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?${tempParams}`)]);
    const landJson = await landRes.json(), tempJson = await tempRes.json();
    const lItem = landJson.response.body.items.item[0], tItem = tempJson.response.body.items.item[0];
    const DAYS = ['일', '월', '화', '수', '목', '금', '토'], results: WeeklyForecast[] = [];
    for (let d = 3; d <= 7; d++) {
      const futureDate = new Date(now); futureDate.setDate(now.getDate() + d);
      results.push({ date: futureDate.toISOString().split('T')[0], dayOfWeek: DAYS[futureDate.getDay()], temperature: { min: Number(tItem?.[`taMin${d}`] ?? 15), max: Number(tItem?.[`taMax${d}`] ?? 25) }, condition: lItem?.[`wf${d}Am`] ?? lItem?.[`wf${d}`] ?? '맑음', humidity: 50, windSpeed: 2 });
    }
    return results;
  } catch (e) { console.error('중기예보 에러:', e); return []; }
}
// ─────────────────────────────────────────────
// 8. 주간 예보 통합 (단기 3일 + 중기 4~7일)
// ─────────────────────────────────────────────
export async function getWeeklyForecast(location?: string): Promise<WeeklyForecast[]> {
  try {
    let lat: number, lon: number, locationName: string;
    if (location) {
      const result = await searchLocationCoords(location);
      if (!result) throw new Error('지역 검색 실패');
      lat = result.lat; lon = result.lon; locationName = result.name;
    } else {
      const coords = await getCurrentCoords();
      lat = coords.lat; lon = coords.lon;
      locationName = coords.isDefault ? '서울 기준 날씨' : await coordsToLocationName(lat, lon);
    }
    const [shortFc, midFc] = await Promise.all([getShortForecast(lat, lon), getMidForecast(locationName)]);
    const shortDates = new Set(shortFc.map((f) => f.date));
    const merged = [...shortFc, ...midFc.filter((f) => !shortDates.has(f.date))];
    return merged.sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) { console.error('주간예보 에러:', e); return []; }
}
// ─────────────────────────────────────────────
// 9. 지역 검색 (카카오 행정구역 API 실시간 자동완성)
// ─────────────────────────────────────────────

// 빈 화면에 기본으로 보여줄 인기 지역 목록
const DEFAULT_LOCATIONS = [
  '서울특별시 강남구', '서울특별시 종로구', '서울특별시 마포구',
  '부산광역시 해운대구', '대구광역시 수성구', '인천광역시 연수구',
  '경기도 수원시', '경기도 성남시',
];

/**
 * 카카오 로컬 API - 행정구역 검색
 * 쿼리가 없으면 기본 목록 반환, 있으면 카카오 API로 실시간 검색
 * Weather.tsx에서 async/await로 호출해야 합니다:
 *   const results = await searchLocations(query);
 */
export async function searchLocations(query: string): Promise<string[]> {
  // 빈 쿼리면 기본 목록 반환
  if (!query || query.trim().length === 0) return DEFAULT_LOCATIONS;

  try {
    // 카카오 행정구역 검색 (region_type=H: 행정동, B: 법정동)
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=10`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    const data = await res.json();

    const results: string[] = [];

    if (data.documents?.length > 0) {
      for (const doc of data.documents) {
        // 도로명 주소보다 행정구역명 우선
        const addr = doc.address || doc.road_address;
        if (!addr) continue;

        // 시/도 + 구/군/시 조합으로 정제
        const parts = [
          addr.region_1depth_name,  // 시/도
          addr.region_2depth_name,  // 구/군
          addr.region_3depth_name,  // 동/읍/면 (있으면)
        ].filter(Boolean);

        const locationName = parts.slice(0, 2).join(' '); // 구 단위까지만
        if (locationName && !results.includes(locationName)) {
          results.push(locationName);
        }
      }
    }

    // 카카오 주소 검색 결과가 없으면 키워드 검색도 시도
    if (results.length === 0) {
      const kwRes = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query + ' 지역')}&size=10&category_group_code=`,
        { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
      );
      const kwData = await kwRes.json();

      if (kwData.documents?.length > 0) {
        for (const doc of kwData.documents) {
          const locationName = [doc.address_name?.split(' ').slice(0, 2).join(' ')]
            .filter(Boolean)[0];
          if (locationName && !results.includes(locationName)) {
            results.push(locationName);
          }
        }
      }
    }

    // 결과가 전혀 없으면 기본 목록에서 필터링해서라도 반환
    if (results.length === 0) {
      return DEFAULT_LOCATIONS.filter(loc => loc.includes(query));
    }

    return results.slice(0, 10);
  } catch (e) {
    console.error('지역 검색 에러:', e);
    // API 실패 시 기본 목록에서 필터링
    return DEFAULT_LOCATIONS.filter(loc => loc.includes(query));
  }
}