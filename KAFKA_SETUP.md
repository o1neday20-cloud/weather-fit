# WeatherFit — Kafka 파이프라인 구성 가이드

## 전체 아키텍처

```
┌─────────────┐    HTTP     ┌──────────────┐   토픽별 라우팅   ┌──────────────┐
│  사용자 앱   │ ──────────▶ │   Fluentd    │ ────────────────▶ │    Kafka     │
│ (React)     │  :24224     │  (수집/버퍼)  │                   │  (메시지큐)  │
└─────────────┘             └──────────────┘                   └──────┬───────┘
                                                                       │
┌─────────────┐    HTTP     ┌──────────────┐                   ┌──────▼───────┐
│  API 서버   │ ──────────▶ │    Kafka     │ ◀────────────────  │  Consumer   │
│ (Express)   │  Producer   │   Producer   │                   │  (Node.js)  │
└─────────────┘             └──────────────┘                   └──────┬───────┘
                                                                       │
                                                               ┌───────▼──────┐
                                                               │    MySQL     │
                                                               │   (저장소)   │
                                                               └──────────────┘
```

## Kafka 토픽 구성

| 토픽                  | 데이터          | DB 테이블              |
|-----------------------|-----------------|------------------------|
| weatherfit.behavior   | 사용자 행동 로그 | behavior_log           |
| weatherfit.purchase   | 구매/결제       | purchase               |
| weatherfit.feedback   | 온도 피드백     | temperature_feedback   |
| weatherfit.wardrobe   | 옷장 추가       | wardrobe_item          |
| weatherfit.wishlist   | 찜 추가/삭제    | purchase (wishlist)    |
| weatherfit.etc        | 기타 이벤트     | behavior_log           |

## 실행 방법

### 1. Docker 설치 확인
```bash
docker --version
docker compose version
```

### 2. Kafka 환경 시작 (docker-compose)
```bash
cd weather-fit-v2
docker compose up -d

# 상태 확인
docker compose ps
```

### 3. Kafka Consumer 실행 (별도 터미널)
```bash
cd kafka-consumer
npm install
node consumer.js
```

### 4. 백엔드 서버 실행
```bash
cd backend
npm install
node server.js
# → Kafka Producer 연결 성공 메시지 확인
```

### 5. 사용자 앱 실행
```bash
# .env에서 Fluentd 활성화
VITE_USE_FLUENTD=true

npm run dev
```

## 포트 정리

| 서비스          | 포트  | 용도                        |
|-----------------|-------|-----------------------------|
| API 서버        | 4000  | REST API                    |
| Kafka           | 29092 | 외부 접속 (앱 → Kafka)      |
| Kafka (내부)    | 9092  | 컨테이너 내부 통신           |
| Zookeeper       | 2181  | Kafka 코디네이터             |
| Fluentd HTTP    | 24224 | 로그 수집 엔드포인트         |
| Kafka UI        | 8080  | 토픽/메시지 모니터링         |
| 사용자 앱       | 5173  | React 앱                    |
| 관리자 페이지   | 5174  | Admin 대시보드               |

## Kafka UI 접속
http://localhost:8080
- 토픽별 메시지 수 확인
- Consumer Group lag 모니터링
- 실시간 메시지 조회

## Fluentd 없이 테스트
.env에서 VITE_USE_FLUENTD=false (기본값)로 두면
앱 → API 서버 → Kafka → Consumer → MySQL 경로로 동작합니다.

## 환경변수 (.env)
```
VITE_API_URL=http://localhost:4000/api
VITE_USE_FLUENTD=false          # true: Fluentd 직접 전송
VITE_FLUENTD_URL=http://localhost:24224
KAFKA_BROKER=localhost:29092
DB_PASSWORD=                    # MySQL 비밀번호
ADMIN_TOKEN=weatherfit-admin-2026
```
