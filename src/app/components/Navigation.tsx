import { Link, useLocation } from 'react-router';
import { Home, Shirt, Sparkles, ShoppingBag, MessageSquare, Settings } from 'lucide-react';

export default function Navigation() {
  const location = useLocation();
  
  const navItems = [
    { path: '/', icon: Home, label: '홈' },
    { path: '/shop', icon: ShoppingBag, label: '쇼핑' },
    { path: '/outfit', icon: Sparkles, label: '코디' },
    { path: '/wardrobe', icon: Shirt, label: '옷장' },
    { path: '/feedback', icon: MessageSquare, label: '피드백' },
    { path: '/settings', icon: Settings, label: '설정' },
  ];
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                  isActive 
                    ? 'text-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}