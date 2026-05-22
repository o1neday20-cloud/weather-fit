/**
 * WeatherFit 백엔드 API v4
 * DB: 팀원 weatherfit DB (210.104.76.135:3306)
 * 설치: npm install express mysql2 cors dotenv multer bcryptjs kafkajs axios
 * 실행: node backend/server.js
 */
require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');
const { Kafka, logLevel } = require('kafkajs');
const axios = require('axios');

// ── ID 생성 헬퍼 ──────────────────────────────────────────────
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── product_id 변환 ────────────────────────────────────────────
// product 테이블 PK: product_id VARCHAR(20) (예: 'prod_1', 'prod_2')
// 프론트에서 숫자(1)로 보내면 'prod_1'로 복원, 이미 prod_N이면 그대로 반환
function toPartnerId(productId) {
  if (!productId) return null;
  const str = String(productId);
  if (str.startsWith('prod_')) return str;
  const numeric = parseInt(str.replace(/[^0-9]/g, ''), 10);
  if (numeric) return `prod_${numeric}`;
  return null;
}

// ── Fluentd 전송 ──────────────────────────────────────────────
const FLUENTD_URL = process.env.FLUENTD_URL || 'http://210.104.76.135:9880/weatherfit.log';

async function sendToFluentd(eventData) {
  try {
    await axios.post(
      FLUENTD_URL,
      { timestamp: new Date().toISOString(), ...eventData },
      { headers: { 'Content-Type': 'application/json' }, timeout: 3000 }
    );
    console.log(`[Fluentd] → ${eventData.event_type}`, JSON.stringify(eventData).slice(0, 80));
  } catch (e) {
    console.warn(`[Fluentd] 전송 실패 (${eventData.event_type}):`, e.message);
  }
}

// ── Kafka Producer 초기화 ──────────────────────────────────────
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:29092';
const kafka = new Kafka({
  clientId: 'weatherfit-api-server',
  brokers: [KAFKA_BROKER],
  logLevel: logLevel.WARN,
  retry: { retries: 3, initialRetryTime: 200 },
});
const producer = kafka.producer();
let kafkaReady = false;

(async () => {
  try {
    await producer.connect();
    kafkaReady = true;
    console.log('✅ Kafka Producer 연결 성공');
  } catch (e) {
    console.warn('⚠️  Kafka 미연결 — 직접 DB 저장 모드로 동작:', e.message);
  }
})();

async function sendToKafka(topic, data) {
  if (kafkaReady) {
    try {
      await producer.send({
        topic,
        messages: [{ value: JSON.stringify({ ...data, serverTimestamp: new Date().toISOString() }) }],
      });
      console.log(`[Kafka] → ${topic}`, JSON.stringify(data).slice(0, 80));
      return true;
    } catch (e) {
      console.warn(`[Kafka] 전송 실패 (${topic}) — DB 폴백:`, e.message);
    }
  }
  return false;
}

process.on('SIGTERM', async () => { if (kafkaReady) await producer.disconnect(); });
process.on('SIGINT',  async () => { if (kafkaReady) await producer.disconnect(); process.exit(0); });

// ── Express 앱 ────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// 옷장 이미지 폴더
const WARDROBE_IMG_DIR = path.resolve(__dirname, '../public/images/wardrobe');
if (!fs.existsSync(WARDROBE_IMG_DIR)) fs.mkdirSync(WARDROBE_IMG_DIR, { recursive: true });
app.use('/images', express.static(path.resolve(__dirname, '../public/images')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, WARDROBE_IMG_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `item_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype));
  },
});

app.post('/api/upload/wardrobe', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일 없음' });
  res.json({ success: true, imageUrl: `/images/wardrobe/${req.file.filename}` });
});

// ── DB 연결 (팀원 weatherfit DB) ──────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || '210.104.76.135',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '1234',
  database:           process.env.DB_NAME     || 'weatherfit',
  waitForConnections: true,
  connectionLimit:    10,
});

app.get('/health', (_, res) => res.json({ ok: true }));

// ================================================================
// AUTH
// customer 테이블:
//   customer_id VARCHAR(20) PK, name, email, phone, birth_date, gender,
//   join_date, membership_level, cold_sensitivity, activity_level, preferred_style,
//   marketing_consent, push_consent, email_consent, sms_consent,
//   join_channel, join_type, password_hash, last_login_date
// ================================================================

// 이메일 중복 확인  GET /api/auth/check-email?email=xxx
app.get('/api/auth/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: '이메일 필요' });
  try {
    const [rows] = await pool.execute('SELECT customer_id FROM customer WHERE email = ?', [email]);
    res.json({ exists: rows.length > 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: '확인 실패' }); }
});

// 회원가입  POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const {
    name, email, phone, birth_date, gender, password,
    marketing_consent, push_consent, email_consent, sms_consent,
  } = req.body;
  if (!email) return res.status(400).json({ error: '이메일 필요' });
  try {
    const [exist] = await pool.execute('SELECT customer_id FROM customer WHERE email = ?', [email]);
    if (exist.length > 0) return res.status(409).json({ error: '이미 가입된 이메일입니다' });

    const customerId   = genId('cust');
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    await pool.execute(
      `INSERT INTO customer
         (customer_id, name, email, phone, birth_date, gender,
          join_date, membership_level, cold_sensitivity, activity_level, preferred_style,
          marketing_consent, push_consent, email_consent, sms_consent,
          join_channel, join_type, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE, 'BASIC', 0, 'medium', 'casual',
               ?, ?, ?, ?, 'web', 'self', ?)`,
      [customerId, name || null, email, phone || null, birth_date || null, gender || 'N',
       marketing_consent ? 1 : 0, push_consent ? 1 : 0,
       email_consent ? 1 : 0, sms_consent ? 1 : 0,
       passwordHash]
    );

    const [rows] = await pool.execute('SELECT * FROM customer WHERE customer_id = ?', [customerId]);
    const { password_hash: _, ...safeCustomer } = rows[0];
    res.json({ success: true, customer: { ...safeCustomer, customer_id: customerId } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원가입 실패' });
  }
});

// 로그인  POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email) return res.status(400).json({ error: '이메일을 입력해주세요' });
  try {
    const [rows] = await pool.execute('SELECT * FROM customer WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    const customer = rows[0];

    // 비밀번호 검증 (password_hash 존재 시)
    if (customer.password_hash && password) {
      const valid = await bcrypt.compare(password, customer.password_hash);
      if (!valid) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    // last_login_date 업데이트
    await pool.execute(
      'UPDATE customer SET last_login_date = CURRENT_DATE WHERE customer_id = ?',
      [customer.customer_id]
    );

    const { password_hash: _, ...safeCustomer } = customer;
    res.json({ success: true, customer: { ...safeCustomer, customer_id: customer.customer_id } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '로그인 실패' });
  }
});

// ================================================================
// PRODUCT
// product 테이블:
//   product_id VARCHAR(20) PK, name, category, style, color_id,
//   warmth, price, brand, image_url, in_stock
// ================================================================
app.get('/api/products', async (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM product WHERE in_stock = 1';
    const params = [];
    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(category.toUpperCase());
    }
    sql += ' ORDER BY product_id';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '상품 조회 실패' }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const productId = toPartnerId(req.params.id);
    if (!productId) return res.status(404).json({ error: '상품 없음' });

    const [rows] = await pool.execute('SELECT * FROM product WHERE product_id = ?', [productId]);
    if (!rows.length) return res.status(404).json({ error: '상품 없음' });

    // VIEW 이벤트 → Fluentd
    const customerId = req.query.partnerCustomerId || req.query.customer_id || null;
    sendToFluentd({
      event_type: 'VIEW',
      customer_id: customerId,
      product_id:  productId,
      timestamp:   new Date().toISOString(),
    });

    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: '상품 조회 실패' }); }
});

// ================================================================
// CUSTOMER
// ================================================================
app.get('/api/customers/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM customer WHERE customer_id = ?', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: '고객 없음' });
    const { password_hash: _, ...safeCustomer } = rows[0];
    res.json({ ...safeCustomer, customer_id: rows[0].customer_id });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 조회 실패' }); }
});

app.post('/api/customers', async (req, res) => {
  const { customer_id, cold_sensitivity, activity_level, preferred_style } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'customer_id 필요' });
  try {
    const [exist] = await pool.execute(
      'SELECT customer_id FROM customer WHERE customer_id = ?', [customer_id]
    );
    if (exist.length > 0) {
      // 기존 고객 → 선호 정보만 업데이트
      await pool.execute(
        `UPDATE customer
         SET cold_sensitivity = ?, activity_level = ?, preferred_style = ?
         WHERE customer_id = ?`,
        [cold_sensitivity ?? 0,
         (activity_level  || 'medium').toLowerCase(),
         (preferred_style || 'casual').toLowerCase(),
         customer_id]
      );
    } else {
      // 신규 → 최소 정보로 INSERT
      await pool.execute(
        `INSERT INTO customer
           (customer_id, cold_sensitivity, activity_level, preferred_style,
            membership_level, join_date, join_channel, join_type)
         VALUES (?, ?, ?, ?, 'BASIC', CURRENT_DATE, 'web', 'self')`,
        [customer_id,
         cold_sensitivity ?? 0,
         (activity_level  || 'medium').toLowerCase(),
         (preferred_style || 'casual').toLowerCase()]
      );
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 생성/수정 실패' }); }
});

// 고객 정보 수정  PATCH /api/customers/:id
app.patch('/api/customers/:id', async (req, res) => {
  const allowed = ['name', 'phone', 'birth_date', 'gender',
                   'cold_sensitivity', 'activity_level', 'preferred_style', 'membership_level'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: '변경할 필드 없음' });
  try {
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values    = fields.map(f => req.body[f]);
    await pool.execute(
      `UPDATE customer SET ${setClause} WHERE customer_id = ?`,
      [...values, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '정보 수정 실패' }); }
});

// ================================================================
// COUPON
// coupon 테이블:
//   coupon_id VARCHAR(20) PK, name, type('FIXED'/'PERCENT'),
//   discount_value, min_order_amount, max_discount_amount,
//   valid_days, status('ACTIVE')
// customer_coupon 테이블:
//   customer_id, coupon_id, issued_at, expired_at, used_at, status
// ================================================================
app.get('/api/coupons/validate', async (req, res) => {
  try {
    const { code, orderAmt } = req.query;
    if (!code) return res.status(400).json({ error: '쿠폰 코드 필요' });
    const [rows] = await pool.execute(
      `SELECT * FROM coupon WHERE coupon_id = ? AND status = 'ACTIVE'`,
      [code.toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ error: '유효하지 않은 쿠폰 코드입니다' });
    const cpn = rows[0];
    const amt = parseInt(orderAmt) || 0;
    if (cpn.min_order_amount && amt < cpn.min_order_amount) {
      return res.status(400).json({
        error: `최소 주문금액 ${cpn.min_order_amount.toLocaleString()}원 이상`,
      });
    }
    const discountAmt = cpn.type === 'FIXED'
      ? cpn.discount_value
      : Math.min(
          Math.floor(amt * cpn.discount_value / 100),
          cpn.max_discount_amount || Infinity
        );
    res.json({ ...cpn, discountAmt });
  } catch (err) { res.status(200).json({ error: '쿠폰 기능 미지원' }); }
});

app.get('/api/coupons/my/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT cc.*, c.coupon_id, c.name, c.type, c.discount_value,
              c.min_order_amount, c.max_discount_amount, c.valid_days
       FROM customer_coupon cc
       JOIN coupon c ON cc.coupon_id = c.coupon_id
       WHERE cc.customer_id = ?
         AND (cc.used_at IS NULL OR cc.status = 'ISSUED')
         AND c.status = 'ACTIVE'
       ORDER BY cc.issued_at ASC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch { res.json([]); }
});

// ================================================================
// WISHLIST (찜)
// purchase 테이블 status='wishlist' 사용
// purchase_id VARCHAR(20), customer_id VARCHAR(20), product_id VARCHAR(20)
// purchase_date (not purchased_at)
// ================================================================
app.get('/api/wishlist/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pu.purchase_id, pu.customer_id, pu.product_id,
              pu.status, pu.purchase_date AS wished_at,
              p.name, p.brand, p.image_url, p.price
       FROM purchase pu
       JOIN product p ON pu.product_id = p.product_id
       WHERE pu.customer_id = ? AND pu.status = 'wishlist'
       ORDER BY pu.purchase_date DESC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 목록 조회 실패' }); }
});

app.post('/api/wishlist', async (req, res) => {
  const { customer_id, product_id } = req.body;
  const productId = toPartnerId(product_id);

  if (!customer_id || !productId) {
    return res.status(400).json({ error: 'customer_id 또는 product_id 누락' });
  }
  try {
    // 상품 존재 확인
    const [productCheck] = await pool.execute(
      'SELECT product_id, price FROM product WHERE product_id = ?', [productId]
    );
    if (!productCheck.length) {
      return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
    }

    // 중복 체크
    const [exist] = await pool.execute(
      `SELECT purchase_id FROM purchase
       WHERE customer_id = ? AND product_id = ? AND status = 'wishlist'`,
      [customer_id, productId]
    );
    if (exist.length > 0) return res.json({ success: true, duplicate: true });

    const purchaseId = genId('pur');
    await pool.execute(
      `INSERT INTO purchase (purchase_id, customer_id, product_id, status, price, purchase_date)
       VALUES (?, ?, ?, 'wishlist', 0, CURRENT_DATE)`,
      [purchaseId, customer_id, productId]
    );

    // WISHLIST 이벤트 → Fluentd
    sendToFluentd({
      event_type: 'WISHLIST',
      customer_id: customer_id,
      product_id:  productId,
      price:       productCheck[0].price ?? null,
      timestamp:   new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 추가 실패' }); }
});

app.delete('/api/wishlist/:customerId/:productId', async (req, res) => {
  try {
    const productId = toPartnerId(req.params.productId) || req.params.productId;
    await pool.execute(
      `DELETE FROM purchase WHERE customer_id = ? AND product_id = ? AND status = 'wishlist'`,
      [req.params.customerId, productId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 삭제 실패' }); }
});

// ================================================================
// WARDROBE
// wardrobe_item 테이블:
//   item_id VARCHAR(20) PK, customer_id VARCHAR(20),
//   category, style, color_id, warmth, registered_date
// ================================================================
app.get('/api/wardrobe/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM wardrobe_item WHERE customer_id = ? ORDER BY registered_date DESC',
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '옷장 조회 실패' }); }
});

app.post('/api/wardrobe', async (req, res) => {
  const { customer_id, category, style, color_id, warmth } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'customer_id 필요' });
  try {
    const itemId = genId('item');
    await pool.execute(
      `INSERT INTO wardrobe_item
         (item_id, customer_id, category, style, color_id, warmth, registered_date)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE)`,
      [itemId, customer_id,
       (category || 'TOP').toUpperCase(),
       (style    || 'CASUAL').toUpperCase(),
       color_id ?? null,
       warmth   ?? 1]
    );
    // WARDROBE 이벤트 → Fluentd
    sendToFluentd({
      event_type:  'WARDROBE',
      customer_id: customer_id,
      category:    (category || '').toUpperCase(),
      style:       (style    || '').toUpperCase(),
      color_id:    color_id ?? null,
      warmth,
      timestamp:   new Date().toISOString(),
    });
    res.json({ success: true, item_id: itemId });
  } catch (err) { console.error(err); res.status(500).json({ error: '아이템 추가 실패' }); }
});

app.delete('/api/wardrobe/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    // customer_id 또는 partnerCustomerId 둘 다 허용 (프론트 호환)
    const customerId = req.query.customer_id || req.query.partnerCustomerId || null;
    await pool.execute('DELETE FROM wardrobe_item WHERE item_id = ?', [itemId]);
    // WARDROBE_DELETE 이벤트 → Fluentd
    sendToFluentd({
      event_type:  'WARDROBE_DELETE',
      customer_id: customerId,
      item_id:     itemId,
      timestamp:   new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '아이템 삭제 실패' }); }
});

// ================================================================
// PURCHASE
// purchase 테이블:
//   purchase_id VARCHAR(20) PK, customer_id VARCHAR(20), product_id VARCHAR(20),
//   status, size, price, purchase_date (not purchased_at)
// ================================================================
app.get('/api/purchase/:customerId/cart', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pu.purchase_id, pu.customer_id, pu.product_id,
              pu.price, pu.size, pu.status, pu.purchase_date,
              p.name, p.brand, p.image_url, p.price AS list_price
       FROM purchase pu
       JOIN product p ON pu.product_id = p.product_id
       WHERE pu.customer_id = ? AND pu.status = 'cart'`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '장바구니 조회 실패' }); }
});

app.post('/api/purchase', async (req, res) => {
  const { customer_id, product_id, size, price, status } = req.body;
  const productId     = toPartnerId(product_id);
  const currentStatus = status || 'cart';

  if (!productId) {
    return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
  }
  try {
    // 상품 존재 확인
    const [productCheck] = await pool.execute(
      'SELECT product_id FROM product WHERE product_id = ?', [productId]
    );
    if (!productCheck.length) {
      return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
    }

    if (currentStatus === 'paid') {
      // 구매 완료 → Kafka 전송 시도 후 DB 저장
      const sent = await sendToKafka('weatherfit.purchase', {
        customer_id, product_id: productId, status: 'paid', size: size || null, price,
      });
      if (!sent) {
        const purchaseId = genId('pur');
        await pool.execute(
          `INSERT INTO purchase (purchase_id, customer_id, product_id, price, size, status, purchase_date)
           VALUES (?, ?, ?, ?, ?, 'paid', CURRENT_DATE)`,
          [purchaseId, customer_id, productId, price, size || null]
        );
      }
      // PURCHASE 이벤트 → Fluentd
      sendToFluentd({
        event_type:  'PURCHASE',
        customer_id: customer_id,
        product_id:  productId,
        size:        size || null,
        price,
        timestamp:   new Date().toISOString(),
      });
    } else {
      // 장바구니 → 중복 체크 후 INSERT
      if (currentStatus === 'cart') {
        const [existing] = await pool.execute(
          `SELECT purchase_id FROM purchase
           WHERE customer_id = ? AND product_id = ? AND size = ? AND status = 'cart'`,
          [customer_id, productId, size]
        );
        if (existing.length > 0) return res.json({ success: true, duplicate: true });
      }
      const purchaseId = genId('pur');
      await pool.execute(
        `INSERT INTO purchase (purchase_id, customer_id, product_id, price, size, status, purchase_date)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE)`,
        [purchaseId, customer_id, productId, price || 0, size || null, currentStatus]
      );
      // CART 이벤트 → Fluentd
      sendToFluentd({
        event_type:  'CART',
        customer_id: customer_id,
        product_id:  productId,
        size:        size || null,
        price,
        timestamp:   new Date().toISOString(),
      });
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 처리 실패' }); }
});

app.patch('/api/purchase/:purchaseId/status', async (req, res) => {
  const { status } = req.body;
  try {
    await pool.execute(
      'UPDATE purchase SET status = ? WHERE purchase_id = ?',
      [status, req.params.purchaseId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '상태 변경 실패' }); }
});

// ================================================================
// TEMPERATURE FEEDBACK
// temperature_feedback 테이블:
//   feedback_id VARCHAR(20) PK, customer_id VARCHAR(20),
//   feedback_date, actual_temp, feels_like_temp,
//   humidity, wind_speed, weather_condition, feedback
// ================================================================
app.post('/api/feedback', async (req, res) => {
  const {
    customer_id, actual_temp, feels_like_temp,
    humidity, wind_speed, weather_condition, feedback,
  } = req.body;

  // feedback 유효성 검사
  const VALID_FEEDBACK = ['너무추움', '춥다', '적당', '덥다', '너무더움'];
  const safeFeedback = VALID_FEEDBACK.includes(feedback) ? feedback : '적당';

  // 한글 → 영어 (Fluentd 전용)
  const FEEDBACK_EN_MAP = {
    '너무추움': 'COLD', '춥다': 'COLD', '추움': 'COLD',
    '적당':     'PERFECT', '딱좋음': 'PERFECT',
    '덥다':     'HOT',  '더움': 'HOT', '너무더움': 'HOT',
  };
  const feedbackEn = FEEDBACK_EN_MAP[safeFeedback] || 'PERFECT';

  // 날씨 조건 → 영어 코드
  const WEATHER_CODE_MAP = {
    '맑음': 'CLEAR', '흐림': 'CLOUDY', '구름많음': 'PARTLY_CLOUDY',
    '비': 'RAIN', '눈': 'SNOW', '안개': 'FOG',
  };
  const mappedCondition = WEATHER_CODE_MAP[weather_condition] || weather_condition;

  try {
    const feedbackId = genId('fb');
    await pool.execute(
      `INSERT INTO temperature_feedback
         (feedback_id, customer_id, feedback_date,
          actual_temp, feels_like_temp, humidity, wind_speed, weather_condition, feedback)
       VALUES (?, ?, CURRENT_DATE, ?, ?, ?, ?, ?, ?)`,
      [feedbackId, customer_id || null, actual_temp, feels_like_temp,
       humidity, wind_speed, weather_condition, safeFeedback]
    );

    // FEEDBACK 이벤트 → Fluentd
    sendToFluentd({
      event_type:        'FEEDBACK',
      customer_id:       customer_id || null,
      actual_temp,
      feels_like_temp,
      humidity,
      wind_speed,
      weather_condition: mappedCondition,
      feedback:          feedbackEn,
      feedback_date:     new Date().toISOString().split('T')[0],
      timestamp:         new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '피드백 저장 실패' }); }
});

// ================================================================
// BEHAVIOR LOG
// behavior_log 테이블:
//   customer_id VARCHAR(20), event_type (action 컬럼 없음),
//   page_url, item_id, duration, scroll_depth
// ================================================================
app.post('/api/logs/behavior', async (req, res) => {
  const { customer_id, action, event_type, page_url, item_id, duration, scroll_depth } = req.body;
  // action과 event_type 둘 다 수용 → event_type 컬럼에 저장
  const evtType = event_type || action || null;
  try {
    const sent = await sendToKafka('weatherfit.behavior', {
      customer_id: customer_id ?? null, event_type: evtType,
      page_url: page_url ?? null, item_id: item_id ?? null,
      duration: duration ?? null, scroll_depth: scroll_depth ?? null,
    });
    if (!sent) {
      try {
        await pool.execute(
          `INSERT INTO behavior_log
             (customer_id, event_type, page_url, item_id, duration, scroll_depth)
           VALUES (?,?,?,?,?,?)`,
          [customer_id ?? null, evtType, page_url ?? null,
           item_id ?? null, duration ?? null, scroll_depth ?? null]
        );
      } catch { /* behavior_log 테이블 없으면 무시 */ }
    }
    res.json({ success: true, via: sent ? 'kafka' : 'direct' });
  } catch (err) { console.error(err); res.status(500).json({ error: '로그 저장 실패' }); }
});

app.post('/api/logs/success', async (req, res) => {
  try {
    const { topic, partition_no, offset_value, data_type, raw_data, customer_id, consumer_group } = req.body;
    await pool.execute(
      `INSERT INTO process_success_log
         (topic, partition_no, offset_value, data_type, raw_data, customer_id, consumer_group)
       VALUES (?,?,?,?,?,?,?)`,
      [topic, partition_no, offset_value, data_type, JSON.stringify(raw_data), customer_id ?? null, consumer_group]
    );
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

app.post('/api/logs/fail', async (req, res) => {
  try {
    const {
      topic, partition_no, offset_value, raw_data,
      fail_reason, fail_type, customer_id, retry_count, consumer_group,
    } = req.body;
    await pool.execute(
      `INSERT INTO process_fail_log
         (topic, partition_no, offset_value, raw_data,
          fail_reason, fail_type, customer_id, retry_count, consumer_group)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [topic, partition_no, offset_value, JSON.stringify(raw_data),
       fail_reason, fail_type, customer_id ?? null, retry_count ?? 0, consumer_group]
    );
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

// ================================================================
// REGION
// ================================================================
app.get('/api/regions', async (req, res) => {
  try {
    const { city } = req.query;
    let sql = 'SELECT * FROM region';
    const params = [];
    if (city) { sql += ' WHERE city = ?'; params.push(city); }
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch { res.json([]); }
});

app.listen(4000, () => console.log('✅ WeatherFit API v4 실행 중: http://localhost:4000'));

// ================================================================
// ADMIN API
// ================================================================
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'weatherfit-admin-2026';
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '관리자 인증 필요' });
  next();
}

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [[customers]] = await pool.execute('SELECT COUNT(*) as cnt FROM customer');
    const [[purchases]] = await pool.execute("SELECT COUNT(*) as cnt FROM purchase WHERE status='paid'");
    const [[wishlist]]  = await pool.execute("SELECT COUNT(*) as cnt FROM purchase WHERE status='wishlist'");
    const [[feedbacks]] = await pool.execute('SELECT COUNT(*) as cnt FROM temperature_feedback');
    const [[revenue]]   = await pool.execute("SELECT COALESCE(SUM(price),0) as total FROM purchase WHERE status='paid'");
    res.json({
      totalCustomers: customers.cnt,
      totalPurchases: purchases.cnt,
      totalWishlist:  wishlist.cnt,
      totalFeedbacks: feedbacks.cnt,
      totalRevenue:   revenue.total,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: '통계 조회 실패' }); }
});

app.get('/api/admin/revenue', adminAuth, async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const groupBy = period === 'yearly'  ? "DATE_FORMAT(purchase_date,'%Y')"
                  : period === 'monthly' ? "DATE_FORMAT(purchase_date,'%Y-%m')"
                  : period === 'weekly'  ? "YEARWEEK(purchase_date,1)"
                  :                        "DATE_FORMAT(purchase_date,'%Y-%m-%d')";
    const [rows] = await pool.execute(
      `SELECT ${groupBy} as label, SUM(price) as revenue, COUNT(*) as count
       FROM purchase WHERE status='paid'
       GROUP BY label ORDER BY label DESC LIMIT 30`
    );
    res.json(rows.reverse());
  } catch (err) { console.error(err); res.status(500).json({ error: '매출 조회 실패' }); }
});

app.get('/api/admin/customers', adminAuth, async (req, res) => {
  try {
    const { search = '', gender, membership } = req.query;
    let sql = 'SELECT * FROM customer WHERE 1=1';
    const params = [];
    if (search)     { sql += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (gender)     { sql += ' AND gender = ?'; params.push(gender); }
    if (membership) { sql += ' AND membership_level = ?'; params.push(membership); }
    sql += ' ORDER BY join_date DESC';
    const [rows] = await pool.execute(sql, params);
    // password_hash 제거 후 반환
    res.json(rows.map(r => { const { password_hash: _, ...safe } = r; return safe; }));
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 조회 실패' }); }
});

app.get('/api/admin/customers/:id', adminAuth, async (req, res) => {
  try {
    const [[customerRow]] = await pool.execute(
      'SELECT * FROM customer WHERE customer_id = ?', [req.params.id]
    );
    if (!customerRow) return res.status(404).json({ error: '고객 없음' });

    const [purchases] = await pool.execute(
      `SELECT pu.*, p.name AS product_name, p.brand, p.image_url
       FROM purchase pu
       LEFT JOIN product p ON pu.product_id = p.product_id
       WHERE pu.customer_id = ? ORDER BY pu.purchase_date DESC`,
      [customerRow.customer_id]
    );
    const [feedbacks] = await pool.execute(
      `SELECT * FROM temperature_feedback
       WHERE customer_id = ? ORDER BY feedback_date DESC LIMIT 20`,
      [customerRow.customer_id]
    );
    const [wardrobe] = await pool.execute(
      'SELECT * FROM wardrobe_item WHERE customer_id = ?',
      [customerRow.customer_id]
    );

    const { password_hash: _, ...safeCustomer } = customerRow;
    res.json({ customer: safeCustomer, purchases, feedbacks, wardrobe });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 상세 조회 실패' }); }
});

app.patch('/api/admin/customers/:id/membership', adminAuth, async (req, res) => {
  const { membership_level } = req.body;
  try {
    await pool.execute(
      'UPDATE customer SET membership_level = ? WHERE customer_id = ?',
      [membership_level, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '등급 변경 실패' }); }
});

// 쿠폰 관련 admin
app.get('/api/admin/coupons', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM coupon ORDER BY coupon_id DESC');
    res.json(rows);
  } catch { res.json([]); }
});

app.post('/api/admin/coupons', adminAuth, async (req, res) => {
  try {
    const { name, type, discount_value, min_order_amount, max_discount_amount, valid_days } = req.body;
    const couponId = genId('cpn');
    await pool.execute(
      `INSERT INTO coupon
         (coupon_id, name, type, discount_value,
          min_order_amount, max_discount_amount, valid_days, status)
       VALUES (?,?,?,?,?,?,?,'ACTIVE')`,
      [couponId, name, type || 'FIXED', discount_value,
       min_order_amount || 0, max_discount_amount || null, valid_days || 30]
    );
    res.json({ success: true, coupon_id: couponId });
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 생성 실패' }); }
});

app.get('/api/admin/logs/behavior', adminAuth, async (req, res) => {
  try {
    const { customer_id, event_type, action, limit = 100 } = req.query;
    const evtType = event_type || action || null;
    let sql = 'SELECT * FROM behavior_log WHERE 1=1';
    const params = [];
    if (customer_id) { sql += ' AND customer_id = ?'; params.push(customer_id); }
    if (evtType)     { sql += ' AND event_type = ?';  params.push(evtType); }
    sql += ` ORDER BY id DESC LIMIT ${parseInt(limit)}`;
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch { res.json([]); }
});

app.get('/api/admin/feedback/stats', adminAuth, async (req, res) => {
  try {
    const [byType] = await pool.execute(
      'SELECT feedback, COUNT(*) as count FROM temperature_feedback GROUP BY feedback'
    );
    const [avgTemp] = await pool.execute(
      `SELECT feedback,
              AVG(actual_temp)    as avg_temp,
              AVG(feels_like_temp) as avg_feels
       FROM temperature_feedback GROUP BY feedback`
    );
    res.json({ byType, avgTemp });
  } catch (err) { console.error(err); res.status(500).json({ error: '피드백 통계 실패' }); }
});

app.get('/api/admin/purchase/stats', adminAuth, async (req, res) => {
  try {
    const [byStatus] = await pool.execute(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(price),0) as revenue
       FROM purchase GROUP BY status`
    );
    const [topProducts] = await pool.execute(
      `SELECT p.name, p.brand, p.category, COUNT(*) as count, SUM(pu.price) as revenue
       FROM purchase pu
       JOIN product p ON pu.product_id = p.product_id
       WHERE pu.status = 'paid'
       GROUP BY pu.product_id ORDER BY count DESC LIMIT 10`
    );
    res.json({ byStatus, topProducts });
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 통계 실패' }); }
});

app.get('/api/admin/stats/styles', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT preferred_style, activity_level, cold_sensitivity, COUNT(*) as count
       FROM customer
       GROUP BY preferred_style, activity_level, cold_sensitivity`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '스타일 통계 실패' }); }
});
