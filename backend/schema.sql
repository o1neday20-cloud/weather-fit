-- ================================================================
-- WeatherFit 서버 1 DB (weather_fit)
-- 팀원 스키마 기준으로 맞춤
-- ================================================================

CREATE DATABASE IF NOT EXISTS weather_fit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE weather_fit;

-- ── region ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS region (
  region_id   INT          PRIMARY KEY AUTO_INCREMENT,
  city        VARCHAR(50)  NOT NULL,
  district    VARCHAR(50),
  full_name   VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO region (city, district, full_name) VALUES
  ('서울특별시', '강남구',  '서울특별시 강남구'),
  ('서울특별시', '종로구',  '서울특별시 종로구'),
  ('부산광역시', '해운대구','부산광역시 해운대구'),
  ('경기도',     '수원시',  '경기도 수원시'),
  ('강원도',     '춘천시',  '강원도 춘천시'),
  ('제주특별자치도', '제주시', '제주특별자치도 제주시')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- ── color_code ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS color_code (
  color_id     INT          PRIMARY KEY AUTO_INCREMENT,
  color_code   VARCHAR(20)  NOT NULL UNIQUE,
  display_name VARCHAR(30)  NOT NULL,
  hex_code     VARCHAR(10),
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO color_code (color_code, display_name, hex_code) VALUES
  ('WHITE',      '화이트',       '#FFFFFF'),
  ('BLACK',      '블랙',         '#1A1A1A'),
  ('DARK_NAVY',  '네이비',       '#1B2A4A'),
  ('CHARCOAL',   '차콜',         '#3D3D3D'),
  ('GRAY',       '그레이',       '#8C8C8C'),
  ('LIGHT_GRAY', '라이트그레이', '#D4D4D4'),
  ('BEIGE',      '베이지',       '#D4B896'),
  ('BROWN',      '브라운',       '#7B4F2E'),
  ('KHAKI',      '카키',         '#7A7A52'),
  ('RED',        '레드',         '#D63031'),
  ('BURGUNDY',   '버건디',       '#7D1935'),
  ('PINK',       '핑크',         '#E8A0BF'),
  ('BLUE',       '블루',         '#2980B9'),
  ('SKY_BLUE',   '스카이블루',   '#74B9FF'),
  ('DENIM',      '데님',         '#5B7FA6'),
  ('GREEN',      '그린',         '#27AE60'),
  ('MINT',       '민트',         '#00B894'),
  ('YELLOW',     '옐로우',       '#F6C90E'),
  ('ORANGE',     '오렌지',       '#E17055'),
  ('PURPLE',     '퍼플',         '#6C5CE7')
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- ── product ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product (
  product_id  VARCHAR(20)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(20)  NOT NULL,
  style       VARCHAR(20)  NOT NULL,
  color_id    INT,
  warmth      TINYINT      NOT NULL,
  price       INT          NOT NULL,
  brand       VARCHAR(50),
  image_url   VARCHAR(255),
  in_stock    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (color_id) REFERENCES color_code(color_id)
);

-- ── customer ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer (
  customer_id        VARCHAR(20)  PRIMARY KEY,
  name               VARCHAR(50)  NOT NULL,
  email              VARCHAR(100) NOT NULL UNIQUE,
  phone              VARCHAR(20),
  age                TINYINT      NOT NULL DEFAULT 0,
  gender             VARCHAR(10)  NOT NULL DEFAULT 'N',
  region_id          INT,
  join_date          DATE         NOT NULL,
  membership_level   VARCHAR(10)  NOT NULL DEFAULT 'BASIC',
  cold_sensitivity   TINYINT      NOT NULL DEFAULT 0,
  activity_level     VARCHAR(10)  NOT NULL DEFAULT 'medium',
  preferred_style    VARCHAR(20)  NOT NULL DEFAULT 'casual',
  marketing_consent  TINYINT(1)   NOT NULL DEFAULT 0,
  push_consent       TINYINT(1)   NOT NULL DEFAULT 0,
  email_consent      TINYINT(1)   NOT NULL DEFAULT 0,
  sms_consent        TINYINT(1)   NOT NULL DEFAULT 0,
  dm_consent         TINYINT(1)   NOT NULL DEFAULT 0,
  tm_consent         TINYINT(1)   NOT NULL DEFAULT 0,
  last_login_date    DATE,
  dormant_days       INT          NOT NULL DEFAULT 0,
  is_fraud           TINYINT(1)   NOT NULL DEFAULT 0,
  join_channel       VARCHAR(10)  NOT NULL DEFAULT 'web',
  join_type          VARCHAR(20)  NOT NULL DEFAULT 'self',
  password_hash      VARCHAR(255),
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (region_id) REFERENCES region(region_id)
);

-- ── temperature_feedback ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS temperature_feedback (
  feedback_id        VARCHAR(20)  PRIMARY KEY,
  customer_id        VARCHAR(20)  NOT NULL,
  region_id          INT,
  feedback_date      DATE         NOT NULL,
  actual_temp        DECIMAL(5,1) NOT NULL,
  feels_like_temp    DECIMAL(5,1) NOT NULL,
  humidity           DECIMAL(5,1),
  wind_speed         DECIMAL(5,1),
  weather_condition  VARCHAR(20)  NOT NULL,
  recommended_outfit JSON,
  feedback           VARCHAR(10)  NOT NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_id   (customer_id),
  INDEX idx_feedback_date (feedback_date),
  INDEX idx_feedback      (feedback),
  FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
  FOREIGN KEY (region_id)   REFERENCES region(region_id)
);

-- ── purchase ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase (
  purchase_id    VARCHAR(20)  PRIMARY KEY,
  customer_id    VARCHAR(20)  NOT NULL,
  product_id     VARCHAR(20)  NOT NULL,
  status         VARCHAR(20)  NOT NULL,
  size           VARCHAR(5),
  price          INT          NOT NULL,
  view_duration  INT,
  purchase_date  DATE         NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_id   (customer_id),
  INDEX idx_status        (status),
  INDEX idx_purchase_date (purchase_date),
  FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
  FOREIGN KEY (product_id)  REFERENCES product(product_id)
);

-- ── wardrobe_item ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wardrobe_item (
  item_id          VARCHAR(20)  PRIMARY KEY,
  customer_id      VARCHAR(20)  NOT NULL,
  category         VARCHAR(20)  NOT NULL,
  style            VARCHAR(20)  NOT NULL,
  color_id         INT,
  warmth           TINYINT      NOT NULL,
  registered_date  DATE         NOT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_id (customer_id),
  FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
  FOREIGN KEY (color_id)    REFERENCES color_code(color_id)
);

-- ── coupon ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupon (
  coupon_id           VARCHAR(20)  PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  description         TEXT,
  type                VARCHAR(10)  NOT NULL,
  discount_value      INT          NOT NULL,
  min_order_amount    INT          NOT NULL DEFAULT 0,
  max_discount_amount INT,
  valid_days          INT          NOT NULL,
  target_category     VARCHAR(20),
  campaign_id         VARCHAR(20),
  issued_count        INT          NOT NULL DEFAULT 0,
  used_count          INT          NOT NULL DEFAULT 0,
  status              VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── customer_coupon ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_coupon (
  id           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  customer_id  VARCHAR(20)  NOT NULL,
  coupon_id    VARCHAR(20)  NOT NULL,
  issued_at    DATE         NOT NULL,
  expired_at   DATE         NOT NULL,
  used_at      DATE,
  status       VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  order_id     VARCHAR(30),
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_id (customer_id),
  INDEX idx_coupon_id   (coupon_id),
  FOREIGN KEY (customer_id) REFERENCES customer(customer_id),
  FOREIGN KEY (coupon_id)   REFERENCES coupon(coupon_id)
);
