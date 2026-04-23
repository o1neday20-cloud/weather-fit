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

const SHORT_TERM_KEY = 'a63da1824b849facc68af62cff78ebd060ce4bc5592719ac271fefebbee8494f';
const MID_TERM_KEY = 'a63da1824b849facc68af62cff78ebd060ce4bc5592719ac271fefebbee8494f';


// 1. 위치 정보 및 좌표 변환 로직
export async function getCurrentCoords(): Promise<{ lat: number, lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) reject(new Error("GPS 미지원"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error("위치 권한 거부"))
    );
  });
}

function convertToGrid(lat: number, lon: number) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID, slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
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

// 2. 현재 날씨 (단기예보 활용)
export async function getCurrentWeather(location?: string): Promise<WeatherData> {
  try {
    const coords = await getCurrentCoords();
    const grid = convertToGrid(coords.lat, coords.lon);
    const now = new Date();
    const baseDate = now.toISOString().split('T')[0].replace(/-/g, '');
    const hours = now.getHours();
    const baseTime = hours < 2 ? "2300" : `${String(Math.floor((hours - 2) / 3) * 3 + 2).padStart(2, '0')}00`;

    const url = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${SHORT_TERM_KEY}&numOfRows=100&pageNo=1&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${grid.x}&ny=${grid.y}`;

    const res = await fetch(url);
    const json = await res.json();
    const items = json.response.body.items.item;
    const getVal = (cat: string) => items.find((i: any) => i.category === cat).fcstValue;

    return {
      temperature: Number(getVal('TMP')),
      humidity: Number(getVal('REH')),
      windSpeed: Number(getVal('WSD')),
      condition: parseCondition(getVal('SKY'), getVal('PTY')),
      location: location || "내 주변",
      date: new Date().toISOString()
    };
  } catch (e) {
    return { temperature: 20, humidity: 50, windSpeed: 2, condition: '맑음', location: '서울' };
  }
}


// 3. 주간 예보 (단기 + 중기 병합)
export async function getWeeklyForecast(location: string = '서울'): Promise<WeeklyForecast[]> {
  try {
    const now = new Date();
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const forecast: WeeklyForecast[] = [];

    // 중기예보 지역 코드 설정
    const regId = location.includes('서울') || location.includes('경기') ? '11B00000' : '11H20000';
    const tempRegId = regId === '11B00000' ? '11B10101' : '11H20201';

    const baseDate = now.toISOString().split('T')[0].replace(/-/g, '');
    const baseTime = now.getHours() < 6 ? '1800' : '0600';
    const queryDate = now.getHours() < 6 ? String(Number(baseDate) - 1) : baseDate;

    // API 호출 (육상예보 + 기온예보)
    const landUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?serviceKey=${MID_TERM_KEY}&dataType=JSON&regId=${regId}&tmFc=${queryDate}${baseTime}`;
    const tempUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?serviceKey=${MID_TERM_KEY}&dataType=JSON&regId=${tempRegId}&tmFc=${queryDate}${baseTime}`;

    const [lRes, tRes] = await Promise.all([fetch(landUrl), fetch(tempUrl)]);
    const lData = await lRes.json();
    const tData = await tRes.json();

    const lItem = lData.response.body.items.item[0];
    const tItem = tData.response.body.items.item[0];

    for (let i = 3; i <= 10; i++) {
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + i);

      forecast.push({
        date: futureDate.toISOString().split('T')[0],
        dayOfWeek: days[futureDate.getDay()],
        temperature: {
          min: tItem[`taMin${i}`] || 15,
          max: tItem[`taMax${i}`] || 25
        },
        condition: lItem[`wf${i}Am`] || "맑음",
        humidity: 50,
        windSpeed: 2
      });
    }
    return forecast;
  } catch (error) {
    return [];
  }
}

function parseCondition(sky: string, pty: string) {
  if (pty !== "0") return "비/눈";
  return sky === "1" ? "맑음" : sky === "3" ? "구름많음" : "흐림";
}

// 지역 검색 (기존 로직 유지)
export function searchLocations(query: string): string[] {
  const locations = ['서울시 강남구', '부산시 해운대구', '대구시 중구'];
  return query ? locations.filter(loc => loc.includes(query)) : locations;
}