import { Cloud, Droplets, Wind, MapPin, ChevronRight } from 'lucide-react';
import { WeatherData } from '../utils/weatherApi';
import { Link } from 'react-router';

interface WeatherCardProps {
  weather: WeatherData;
  feelTemp?: number;
  clickable?: boolean;
}

export default function WeatherCard({ weather, feelTemp, clickable = true }: WeatherCardProps) {
  const content = (
    <>
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-4 h-4" />
        <span className="text-sm opacity-90">{weather.location}</span>
        {clickable && <ChevronRight className="w-4 h-4 ml-auto opacity-80" />}
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-light">{weather.temperature}</span>
            <span className="text-3xl opacity-80">°C</span>
          </div>
          {feelTemp !== undefined && (
            <div className="mt-2 text-sm opacity-90">
              체감온도: <span className="font-semibold">{feelTemp}°C</span>
            </div>
          )}
        </div>

        <div className="text-right">
          <Cloud className="w-12 h-12 mb-2 ml-auto" />
          <span className="text-sm">{weather.condition}</span>
        </div>
      </div>

      <div className="flex gap-6 pt-4 border-t border-white/20">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 opacity-80" />
          <span className="text-sm">습도 {weather.humidity}%</span>
        </div>
        <div className="flex items-center gap-2">
          <Wind className="w-4 h-4 opacity-80" />
          <span className="text-sm">풍속 {weather.windSpeed}m/s</span>
        </div>
      </div>
    </>
  );

  if (clickable) {
    return (
      <Link to="/weather" className="block bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition-shadow">
        {content}
      </Link>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
      {content}
    </div>
  );
}
