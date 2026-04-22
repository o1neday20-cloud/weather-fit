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

const locations = [
  '서울시 강남구',
  '서울시 종로구',
  '부산시 해운대구',
  '대구시 중구',
  '인천시 남동구',
  '광주시 동구',
  '대전시 유성구',
  '울산시 남구',
  '세종시',
  '경기도 수원시',
];

// 현재 위치 가져오기
export async function getCurrentLocation(): Promise<string> {
  return new Promise((resolve) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          // 실제로는 좌표를 주소로 변환
          const savedLocation = localStorage.getItem('userLocation');
          resolve(savedLocation || '서울시 강남구');
        },
        () => {
          const savedLocation = localStorage.getItem('userLocation');
          resolve(savedLocation || '서울시 강남구');
        }
      );
    } else {
      const savedLocation = localStorage.getItem('userLocation');
      resolve(savedLocation || '서울시 강남구');
    }
  });
}

// Mock 날씨 API - 실제로는 기상청 API 연동
export async function getCurrentWeather(location?: string): Promise<WeatherData> {
  const currentLocation = location || await getCurrentLocation();

  return new Promise((resolve) => {
    setTimeout(() => {
      const conditions = ['맑음', '흐림', '비', '눈', '안개'];
      resolve({
        temperature: Math.floor(Math.random() * 30) - 5,
        humidity: Math.floor(Math.random() * 60) + 30,
        windSpeed: Math.floor(Math.random() * 10) + 1,
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        location: currentLocation,
      });
    }, 500);
  });
}

// 주간 날씨 예보
export async function getWeeklyForecast(location?: string): Promise<WeeklyForecast[]> {
  const currentLocation = location || await getCurrentLocation();

  return new Promise((resolve) => {
    setTimeout(() => {
      const conditions = ['맑음', '흐림', '비', '눈'];
      const forecast: WeeklyForecast[] = [];
      const today = new Date();
      const days = ['일', '월', '화', '수', '목', '금', '토'];

      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const baseTemp = Math.floor(Math.random() * 20) - 5;
        forecast.push({
          date: date.toISOString().split('T')[0],
          dayOfWeek: days[date.getDay()],
          temperature: {
            min: baseTemp,
            max: baseTemp + Math.floor(Math.random() * 10) + 5,
          },
          condition: conditions[Math.floor(Math.random() * conditions.length)],
          humidity: Math.floor(Math.random() * 60) + 30,
          windSpeed: Math.floor(Math.random() * 10) + 1,
        });
      }

      resolve(forecast);
    }, 500);
  });
}

// 지역 검색
export function searchLocations(query: string): string[] {
  if (!query) return locations;
  return locations.filter(loc =>
    loc.toLowerCase().includes(query.toLowerCase())
  );
}
