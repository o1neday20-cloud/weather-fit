# 이미지 폴더 구조

public/
└── images/
    ├── products/      ← 쇼핑몰 상품 이미지
    │   ├── prod_1.jpg
    │   ├── prod_2.jpg
    │   └── ...
    └── wardrobe/      ← 옷장 아이템 이미지 (사용자가 직접 추가)

## 사용법

### 코드에서 참조할 때
```ts
imageUrl: '/images/products/prod_1.jpg'
```

### 규칙
- 파일명은 상품 ID와 맞춰주세요 (prod_1.jpg, prod_2.jpg ...)
- 권장 사이즈: 400x400px 이상, 정사각형
- 권장 포맷: .jpg 또는 .webp (용량 절약)
- public 폴더 안의 파일은 빌드 후 루트(/)에서 그대로 접근 가능
