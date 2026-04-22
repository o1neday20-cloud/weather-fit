import { useEffect, useState } from 'react';
import Navigation from '../components/Navigation';
import ClothingItem from '../components/ClothingItem';
import { ClothingItem as ClothingItemType } from '../utils/aiModel';
import { Logger } from '../utils/logger';
import { Plus, Shirt } from 'lucide-react';

export default function Wardrobe() {
  const [wardrobe, setWardrobe] = useState<ClothingItemType[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadWardrobe();
    Logger.log('page_view', { page: 'wardrobe' });
  }, []);

  const loadWardrobe = () => {
    const wardrobeString = localStorage.getItem('wardrobe');
    if (wardrobeString) {
      const wardrobeData = JSON.parse(wardrobeString);
      // 기존 데이터에 style이 없는 경우 기본값 추가
      const migratedWardrobe = wardrobeData.map((item: ClothingItemType) => ({
        ...item,
        style: item.style || 'casual',
      }));
      setWardrobe(migratedWardrobe);
      localStorage.setItem('wardrobe', JSON.stringify(migratedWardrobe));
    } else {
      // 초기 샘플 데이터
      const sampleWardrobe: ClothingItemType[] = [
        {
          id: '1',
          name: '후드 티셔츠',
          category: 'top',
          warmth: 3,
          color: '#95A5A6',
          isOwned: true,
          style: 'casual',
        },
        {
          id: '2',
          name: '청바지',
          category: 'bottom',
          warmth: 2,
          color: '#34495E',
          isOwned: true,
          style: 'casual',
        },
        {
          id: '3',
          name: '가죽 자켓',
          category: 'outer',
          warmth: 4,
          color: '#2C3E50',
          isOwned: true,
          style: 'street',
        },
      ];
      setWardrobe(sampleWardrobe);
      localStorage.setItem('wardrobe', JSON.stringify(sampleWardrobe));
    }
  };

  const handleDelete = (id: string) => {
    const updated = wardrobe.filter(item => item.id !== id);
    setWardrobe(updated);
    localStorage.setItem('wardrobe', JSON.stringify(updated));
    Logger.log('item_deleted', { itemId: id });
  };

  const handleAdd = (newItem: Omit<ClothingItemType, 'id'>) => {
    const item: ClothingItemType = {
      ...newItem,
      id: Date.now().toString(),
    };
    const updated = [...wardrobe, item];
    setWardrobe(updated);
    localStorage.setItem('wardrobe', JSON.stringify(updated));
    Logger.log('item_added', { itemName: item.name, category: item.category });
    setShowAddModal(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">내 옷장</h1>
            <p className="text-sm text-gray-600 mt-1">총 {wardrobe.length}개의 옷</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            추가
          </button>
        </div>

        {/* 옷 목록 */}
        {wardrobe.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {wardrobe.map((item) => (
              <ClothingItem 
                key={item.id} 
                item={item}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <Shirt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">아직 등록된 옷이 없습니다</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              첫 번째 옷 추가하기
            </button>
          </div>
        )}
      </div>

      {/* 추가 모달 */}
      {showAddModal && (
        <AddItemModal 
          onClose={() => setShowAddModal(false)}
          onAdd={handleAdd}
        />
      )}

      <Navigation />
    </div>
  );
}

interface AddItemModalProps {
  onClose: () => void;
  onAdd: (item: Omit<ClothingItemType, 'id'>) => void;
}

function AddItemModal({ onClose, onAdd }: AddItemModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'top' as ClothingItemType['category'],
    warmth: 3,
    color: '#95A5A6',
    style: 'casual' as ClothingItemType['style'],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      ...formData,
      isOwned: true,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">새 옷 추가</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이름
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="예: 흰색 티셔츠"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              카테고리
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="top">상의</option>
              <option value="bottom">하의</option>
              <option value="outer">외투</option>
              <option value="accessory">악세서리</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              보온성 ({formData.warmth})
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={formData.warmth}
              onChange={(e) => setFormData({ ...formData, warmth: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>매우 얇음</span>
              <span>매우 두꺼움</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              스타일
            </label>
            <select
              value={formData.style}
              onChange={(e) => setFormData({ ...formData, style: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="casual">캐주얼</option>
              <option value="formal">포멀</option>
              <option value="sporty">스포티</option>
              <option value="street">스트릿</option>
              <option value="minimal">미니멀</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              색상
            </label>
            <div className="flex gap-2">
              {['#2C3E50', '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#95A5A6'].map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={`w-10 h-10 rounded-lg border-2 ${
                    formData.color === color ? 'border-blue-600' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
