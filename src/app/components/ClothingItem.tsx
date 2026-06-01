import { ClothingItem as ClothingItemType } from '../utils/aiModel';
import { Trash2, ShoppingCart, Pencil } from 'lucide-react';
import { Link } from 'react-router';

interface ClothingItemProps {
  item: ClothingItemType;
  onDelete?: (id: string) => void;
  onEdit?: (item: ClothingItemType) => void;
  showActions?: boolean;
}

// 카테고리별 대표 Unsplash 이미지 (image/imageUrl 없을 때 폴백)
const FALLBACK_IMAGES: Record<string, string> = {
  outer: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=400&h=400&fit=crop',
  top:   'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=400&h=400&fit=crop',
  bottom:'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&h=400&fit=crop',
  accessory: 'https://images.unsplash.com/photo-1625591341337-13a8e3e7f358?w=400&h=400&fit=crop',
};

export default function ClothingItem({ item, onDelete, onEdit, showActions = true }: ClothingItemProps) {
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

  // image(ClothingItem), imageUrl(Product) 둘 다 지원
  const imgSrc =
    (item as any).imageUrl ||
    item.image ||
    FALLBACK_IMAGES[item.category] ||
    FALLBACK_IMAGES['top'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* 상품 이미지 */}
      <div className="h-40 overflow-hidden bg-gray-100 relative">
        <img
          src={imgSrc}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            // 이미지 로드 실패 시 색상 배경 + 이모지로 폴백
            const target = e.currentTarget;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent && !parent.querySelector('.fallback-emoji')) {
              parent.style.backgroundColor = item.color;
              const span = document.createElement('span');
              span.className = 'fallback-emoji absolute inset-0 flex items-center justify-center text-4xl opacity-50';
              span.textContent = '👕';
              parent.appendChild(span);
            }
          }}
        />
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{item.name}</h3>
            <p className="text-sm text-gray-500">
              {categoryNames[item.category]} · {styleNames[item.style]}
            </p>
          </div>
          {!item.isOwned && (
            <Link
              to={`/product/${item.id}`}
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full hover:bg-blue-200 transition-colors"
            >
              구매필요
            </Link>
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

        {/* 보유 색상 표시 */}
        {(item as any).colorVariants && (item as any).colorVariants.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-xs text-gray-500">보유 색상</span>
            <div className="flex gap-1 flex-wrap">
              {(item as any).colorVariants.map((cv: any, i: number) => (
                <div
                  key={i}
                  title={cv.name}
                  className="w-4 h-4 rounded-full border border-gray-300 shadow-sm"
                  style={{ backgroundColor: cv.hex }}
                />
              ))}
              {(item as any).colorVariants.length > 1 && (
                <span className="text-[10px] text-blue-500 font-medium self-center ml-0.5">
                  {(item as any).colorVariants.length}가지
                </span>
              )}
            </div>
          </div>
        )}

        {/* 버튼을 항상 맨 아래에 */}
        <div className="mt-auto">
        {showActions && (
          <div className="flex gap-2">
            {item.isOwned ? (
              <>
                {onEdit && (
                  <button
                    onClick={() => onEdit(item)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="text-sm">수정</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(item.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="text-sm">삭제</span>
                  </button>
                )}
              </>
            ) : (
              <Link
                to={`/product/${item.id}`}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <ShoppingCart className="w-4 h-4" />
                <span className="text-sm">구매하기</span>
              </Link>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
