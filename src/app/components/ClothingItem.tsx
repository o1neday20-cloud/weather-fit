import { ClothingItem as ClothingItemType } from '../utils/aiModel';
import { Trash2, ShoppingCart } from 'lucide-react';

interface ClothingItemProps {
  item: ClothingItemType;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}

export default function ClothingItem({ item, onDelete, showActions = true }: ClothingItemProps) {
  const categoryNames = {
    outer: '외투',
    top: '상의',
    bottom: '하의',
    accessory: '악세서리',
  };

  const styleNames = {
    casual: '캐주얼',
    formal: '포멀',
    sporty: '스포티',
    street: '스트릿',
    minimal: '미니멀',
  };

  const warmthLabels = ['매우 얇음', '얇음', '보통', '두꺼움', '매우 두꺼움'];
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div 
        className="h-40 flex items-center justify-center text-white text-4xl"
        style={{ backgroundColor: item.image ? 'transparent' : item.color }}
      >
        {item.image ? (
          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="opacity-50">👕</span>
        )}
      </div>
      
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{item.name}</h3>
            <p className="text-sm text-gray-500">
              {categoryNames[item.category]} · {styleNames[item.style]}
            </p>
          </div>
          {!item.isOwned && (
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
              구매필요
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-600">보온성:</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={`w-4 h-4 rounded-sm ${
                  level <= item.warmth ? 'bg-orange-400' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">{warmthLabels[item.warmth - 1]}</span>
        </div>
        
        {showActions && (
          <div className="flex gap-2">
            {item.isOwned ? (
              onDelete && (
                <button
                  onClick={() => onDelete(item.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm">삭제</span>
                </button>
              )
            ) : (
              <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <ShoppingCart className="w-4 h-4" />
                <span className="text-sm">구매하기</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
