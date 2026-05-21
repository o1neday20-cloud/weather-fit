/**
 * WeatherFit 백엔드 API v3
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

// ── product_id 매핑 (내부 prod_N → 팀원 DB 숫자 ID) ────────────
const PRODUCT_ID_MAP = {
  'prod_1': 26, 'prod_2': 27, 'prod_3': 28, 'prod_4': 29,
  'prod_5': 30, 'prod_6': 31, 'prod_7': 32, 'prod_8': 33,
  'prod_9': 34, 'prod_10': 35, 'prod_11': 36, 'prod_12': 37,
  'prod_13': 38, 'prod_14': 39, 'prod_15': 40, 'prod_16': 41,
  'prod_17': 42, 'prod_18': 43, 'prod_19': 44, 'prod_20': 45,
  'prod_21': 46, 'prod_22': 47, 'prod_23': 48, 'prod_24': 49,
  'prod_25': 50, 'prod_26': 51, 'prod_27': 52, 'prod_28': 53,
};

/**
 * 프론트의 product_id (prod_N 또는 숫자 N)를 팀원 DB bigint ID로 변환.
 * 1. prod_N → 매핑 테이블
 * 2. 숫자 N → prod_N 복원 후 매핑 테이블
 * 3. 없으면 null
 */
function toPartnerId(productId) {
  if (!productId) return null;
  const str = String(productId);
  if (PRODUCT_ID_MAP[str] !== undefined) return PRODUCT_ID_MAP[str];
  const numeric = parseInt(str.replace(/[^0-9]/g, ''), 10);
  if (numeric) {
    const key = `prod_${numeric}`;
    if (PRODUCT_ID_MAP[key] !== undefined) return PRODUCT_ID_MAP[key];
  }
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
// AUTH — 회원가입 / 로그인
// 팀원 DB customer 스키마:
//   id(bigint PK auto), uid(varchar50), name, email, phone,
//   gender, birth_date, cold_sensitivity, activity_level,
//   preferred_style, membership_level
// ================================================================

// 이메일 중복 확인  GET /api/auth/check-email?email=xxx
app.get('/api/auth/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: '이메일 필요' });
  try {
    const [rows] = await pool.execute('SELECT id FROM customer WHERE email = ?', [email]);
    res.json({ exists: rows.length > 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: '확인 실패' }); }
});

// 회원가입  POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, birth_date, gender } = req.body;
  if (!email) return res.status(400).json({ error: '이메일 필요' });
  try {
    const [exist] = await pool.execute('SELECT id FROM customer WHERE email = ?', [email]);
    if (exist.length > 0) return res.status(409).json({ error: '이미 가입된 이메일입니다' });

    // uid: 내부 식별자 (uid_xxx) → customer.uid 컬럼에 저장
    const uid = 'uid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    await pool.execute(
      `INSERT INTO customer (uid, name, email, phone, birth_date, gender, membership_level)
       VALUES (?, ?, ?, ?, ?, ?, 'BASIC')`,
      [uid, name || null, email, phone || null, birth_date || null, gender || 'N']
    );

    const [rows] = await pool.execute('SELECT * FROM customer WHERE uid = ?', [uid]);
    const customer = rows[0];
    // customer_id 필드를 uid 값으로 반환 (프론트 localStorage 호환)
    res.json({ success: true, customer: { ...customer, customer_id: uid } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원가입 실패' });
  }
});

// 로그인  POST /api/auth/login
// 팀원 DB에 password_hash 없음 → 이메일 기반 조회 (로컬 폴백이 비밀번호 검증 담당)
app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '이메일을 입력해주세요' });
  try {
    const [rows] = await pool.execute('SELECT * FROM customer WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    const customer = rows[0];
    res.json({ success: true, customer: { ...customer, customer_id: customer.uid } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '로그인 실패' });
  }
});

// ================================================================
// PRODUCT
// 팀원 DB: id(bigint), product_name, category, price,
//          style, color_id, warmth, brand, image_url, in_stock
// ================================================================
app.get('/api/products', async (req, res) => {
  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM product WHERE in_stock = 1';
    const params = [];
    if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category.toUpperCase()); }
    sql += ' ORDER BY id';
    const [rows] = await pool.execute(sql, params);
    // product_name → name 으로 alias (프론트 호환)
    res.json(rows.map(p => ({ ...p, name: p.product_name, product_id: `prod_${p.id}` })));
  } catch (err) { console.error(err); res.status(500).json({ error: '상품 조회 실패' }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const partnerId = toPartnerId(req.params.id);
    if (!partnerId) return res.status(404).json({ error: '상품 없음' });
    const [rows] = await pool.execute('SELECT * FROM product WHERE id = ?', [partnerId]);
    if (!rows.length) return res.status(404).json({ error: '상품 없음' });
    // VIEW 이벤트 → Fluentd
    const viewPartnerId = req.query.partnerCustomerId ? Number(req.query.partnerCustomerId) : null;
    sendToFluentd({
      event_type: 'VIEW',
      customer_id: viewPartnerId,
      product_id: partnerId,
      timestamp: new Date().toISOString(),
    });
    const p = rows[0];
    res.json({ ...p, name: p.product_name, product_id: `prod_${p.id}` });
  } catch (err) { console.error(err); res.status(500).json({ error: '상품 조회 실패' }); }
});

// ================================================================
// CUSTOMER
// ================================================================
app.get('/api/customers/:id', async (req, res) => {
  try {
    // id는 uid_xxx(문자) 또는 bigint 숫자
    let rows;
    if (String(req.params.id).startsWith('uid_')) {
      [rows] = await pool.execute('SELECT * FROM customer WHERE uid = ?', [req.params.id]);
    } else {
      [rows] = await pool.execute('SELECT * FROM customer WHERE id = ?', [req.params.id]);
    }
    if (!rows.length) return res.status(404).json({ error: '고객 없음' });
    const customer = rows[0];
    res.json({ ...customer, customer_id: customer.uid });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 조회 실패' }); }
});

app.post('/api/customers', async (req, res) => {
  const { customer_id, cold_sensitivity, activity_level, preferred_style } = req.body;
  try {
    // uid 기준 UPSERT
    await pool.execute(
      `INSERT INTO customer (uid, cold_sensitivity, activity_level, preferred_style, membership_level)
       VALUES (?, ?, ?, ?, 'BASIC')
       ON DUPLICATE KEY UPDATE
         cold_sensitivity = VALUES(cold_sensitivity),
         activity_level   = VALUES(activity_level),
         preferred_style  = VALUES(preferred_style)`,
      [customer_id, cold_sensitivity ?? 0,
       (activity_level || 'MEDIUM').toUpperCase(),
       (preferred_style || 'CASUAL').toUpperCase()]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 생성 실패' }); }
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
    // uid 기준 또는 id 기준으로 업데이트
    if (String(req.params.id).startsWith('uid_')) {
      await pool.execute(`UPDATE customer SET ${setClause} WHERE uid = ?`, [...values, req.params.id]);
    } else {
      await pool.execute(`UPDATE customer SET ${setClause} WHERE id = ?`, [...values, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '정보 수정 실패' }); }
});

// ================================================================
// COUPON (팀원 DB에 해당 테이블 없으면 빈 응답)
// ================================================================
app.get('/api/coupons/validate', async (req, res) => {
  try {
    const { code, orderAmt } = req.query;
    if (!code) return res.status(400).json({ error: '쿠폰 코드 필요' });
    const [rows] = await pool.execute(
      `SELECT * FROM coupon WHERE code = ? AND is_active = 1
       AND valid_from <= CURRENT_DATE AND valid_until >= CURRENT_DATE`,
      [code.toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ error: '유효하지 않은 쿠폰 코드입니다' });
    const cpn = rows[0];
    const amt = parseInt(orderAmt) || 0;
    if (cpn.min_order_amt && amt < cpn.min_order_amt) {
      return res.status(400).json({ error: `최소 주문금액 ${cpn.min_order_amt.toLocaleString()}원 이상` });
    }
    let discountAmt = cpn.discount_type === 'amount'
      ? cpn.discount_value
      : Math.min(Math.floor(amt * cpn.discount_value / 100), cpn.max_discount || Infinity);
    res.json({ ...cpn, discountAmt });
  } catch (err) { res.status(200).json({ error: '쿠폰 기능 미지원' }); }
});

app.get('/api/coupons/my/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT cc.*, c.code, c.name, c.discount_type, c.discount_value,
              c.min_order_amt, c.max_discount, c.valid_from, c.valid_until
       FROM customer_coupon cc JOIN coupon c ON cc.coupon_id = c.coupon_id
       WHERE cc.customer_id = ? AND cc.used_at IS NULL
         AND c.is_active = 1 AND c.valid_until >= CURRENT_DATE
       ORDER BY c.valid_until ASC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch { res.json([]); }
});

// ================================================================
// WISHLIST (찜)
// 팀원 DB purchase 테이블 사용: status='wishlist'
// customer_id = partnerCustomerId (bigint)
// product_id  = toPartnerId() (bigint)
// ================================================================
app.get('/api/wishlist/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pu.id as purchase_id, pu.customer_id, pu.product_id,
              pu.status, pu.purchased_at as wished_at,
              p.product_name as name, p.brand, p.image_url, p.price
       FROM purchase pu
       JOIN product p ON pu.product_id = p.id
       WHERE pu.customer_id = ? AND pu.status = 'wishlist'
       ORDER BY pu.purchased_at DESC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 목록 조회 실패' }); }
});

app.post('/api/wishlist', async (req, res) => {
  const { customer_id, product_id, partnerCustomerId } = req.body;
  const partnerCustId    = partnerCustomerId ? Number(partnerCustomerId) : null;
  const partnerProductId = toPartnerId(product_id);

  if (!partnerCustId || !partnerProductId) {
    return res.status(400).json({ error: 'customer_id 또는 product_id 변환 실패' });
  }
  try {
    // 상품 존재 여부 + price 조회
    const [productCheck] = await pool.execute(
      'SELECT id, price FROM product WHERE id = ?', [partnerProductId]
    );
    if (!productCheck.length) {
      return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
    }
    const productPrice = productCheck[0].price ?? null;

    // 중복 체크
    const [exist] = await pool.execute(
      `SELECT id FROM purchase WHERE customer_id = ? AND product_id = ? AND status = 'wishlist'`,
      [partnerCustId, partnerProductId]
    );
    if (exist.length > 0) return res.json({ success: true, duplicate: true });

    // INSERT (id auto_increment)
    await pool.execute(
      `INSERT INTO purchase (customer_id, product_id, price, size, status, purchased_at)
       VALUES (?, ?, 0, NULL, 'wishlist', NOW())`,
      [partnerCustId, partnerProductId]
    );

    // WISHLIST 이벤트 → Fluentd
    sendToFluentd({
      event_type: 'WISHLIST',
      customer_id: partnerCustId,
      product_id:  partnerProductId,
      price:       productPrice,
      timestamp:   new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 추가 실패' }); }
});

app.delete('/api/wishlist/:customerId/:productId', async (req, res) => {
  try {
    const partnerProductId = toPartnerId(req.params.productId) || req.params.productId;
    await pool.execute(
      `DELETE FROM purchase WHERE customer_id = ? AND product_id = ? AND status = 'wishlist'`,
      [req.params.customerId, partnerProductId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 삭제 실패' }); }
});

// ================================================================
// WARDROBE
// 팀원 DB: id(bigint PK auto), customer_id(bigint), category,
//          style, color_id, warmth
// customer_id = partnerCustomerId (bigint)
// ================================================================
app.get('/api/wardrobe/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM wardrobe_item WHERE customer_id = ? ORDER BY id DESC',
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '옷장 조회 실패' }); }
});

app.post('/api/wardrobe', async (req, res) => {
  const { customer_id, wardrobe_id, category, style, color_id, warmth, partnerCustomerId } = req.body;
  const partnerCustId = partnerCustomerId ? Number(partnerCustomerId) : null;
  if (!partnerCustId) return res.status(400).json({ error: 'partnerCustomerId 필요' });
  try {
    await pool.execute(
      `INSERT INTO wardrobe_item (customer_id, category, style, color_id, warmth)
       VALUES (?, ?, ?, ?, ?)`,
      [partnerCustId,
       (category || 'TOP').toUpperCase(),
       (style || 'CASUAL').toUpperCase(),
       color_id ?? null,
       warmth ?? 1]
    );
    // WARDROBE 이벤트 → Fluentd
    sendToFluentd({
      event_type:  'WARDROBE',
      customer_id: partnerCustId,
      category:    (category || '').toUpperCase(),
      style:       (style || '').toUpperCase(),
      color_id:    color_id ?? null,
      warmth,
      timestamp:   new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '아이템 추가 실패' }); }
});

app.delete('/api/wardrobe/:wardrobeId', async (req, res) => {
  try {
    const { wardrobeId } = req.params;
    const partnerCustomerId = req.query.partnerCustomerId;
    await pool.execute('DELETE FROM wardrobe_item WHERE id = ?', [wardrobeId]);
    // WARDROBE_DELETE 이벤트 → Fluentd
    sendToFluentd({
      event_type:  'WARDROBE_DELETE',
      customer_id: partnerCustomerId ? Number(partnerCustomerId) : null,
      item_id:     wardrobeId,
      timestamp:   new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '아이템 삭제 실패' }); }
});

// ================================================================
// PURCHASE
// 팀원 DB: id(bigint PK auto), customer_id(bigint), product_id(bigint),
//          price, size, status, purchased_at
// customer_id = partnerCustomerId (bigint)
// product_id  = toPartnerId() (bigint)
// ================================================================
app.get('/api/purchase/:customerId/cart', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pu.id as purchase_id, pu.customer_id, pu.product_id,
              pu.price, pu.size, pu.status, pu.purchased_at,
              p.product_name as name, p.brand, p.image_url, p.price AS list_price
       FROM purchase pu JOIN product p ON pu.product_id = p.id
       WHERE pu.customer_id = ? AND pu.status = 'cart'`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '장바구니 조회 실패' }); }
});

app.post('/api/purchase', async (req, res) => {
  const { customer_id, product_id, size, price, status, coupon_id, discount_amt, partnerCustomerId } = req.body;
  const partnerCustId    = partnerCustomerId ? Number(partnerCustomerId) : null;
  const partnerProductId = toPartnerId(product_id);

  if (!partnerProductId) {
    return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
  }
  try {
    // 상품 존재 여부 확인
    const [productCheck] = await pool.execute(
      'SELECT id FROM product WHERE id = ?', [partnerProductId]
    );
    if (!productCheck.length) {
      return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
    }

    if ((status || 'cart') === 'paid') {
      // 구매 완료 → Kafka 전송 시도 후 DB 저장
      const sent = await sendToKafka('weatherfit.purchase', {
        customer_id: partnerCustId, product_id: partnerProductId,
        status: 'paid', size: size || null, price,
      });
      if (!sent) {
        await pool.execute(
          `INSERT INTO purchase (customer_id, product_id, price, size, status, purchased_at)
           VALUES (?, ?, ?, ?, 'paid', NOW())`,
          [partnerCustId, partnerProductId, price, size || null]
        );
      }
      // PURCHASE 이벤트 → Fluentd
      sendToFluentd({
        event_type:   'PURCHASE',
        customer_id:  partnerCustId,
        product_id:   partnerProductId,
        size:         size || null,
        price,
        timestamp:    new Date().toISOString(),
      });
    } else {
      // 장바구니 → 중복 체크 후 INSERT
      if ((status || 'cart') === 'cart') {
        const [existing] = await pool.execute(
          `SELECT id FROM purchase WHERE customer_id = ? AND product_id = ? AND size = ? AND status = 'cart'`,
          [partnerCustId, partnerProductId, size]
        );
        if (existing.length > 0) return res.json({ success: true, duplicate: true });
      }
      await pool.execute(
        `INSERT INTO purchase (customer_id, product_id, price, size, status, purchased_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [partnerCustId, partnerProductId, price || 0, size || null, status || 'cart']
      );
      // CART 이벤트 → Fluentd
      sendToFluentd({
        event_type:  'CART',
        customer_id: partnerCustId,
        product_id:  partnerProductId,
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
    await pool.execute('UPDATE purchase SET status = ? WHERE id = ?', [status, req.params.purchaseId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '상태 변경 실패' }); }
});

// ================================================================
// TEMPERATURE FEEDBACK
// 팀원 DB: id(bigint PK auto), customer_id(bigint), feedback,
//          temperature, feels_like_temp, humidity, wind_speed,
//          weather_condition, feedback_date
// ================================================================
app.post('/api/feedback', async (req, res) => {
  const { customer_id, actual_temp, feels_like_temp, humidity,
          wind_speed, weather_condition, feedback, partnerCustomerId } = req.body;

  const partnerCustId = partnerCustomerId ? Number(partnerCustomerId) : null;

  // feedback 유효성 검사
  const VALID_FEEDBACK = ['너무추움', '춥다', '적당', '덥다', '너무더움'];
  const safeFeedback = VALID_FEEDBACK.includes(feedback) ? feedback : '적당';

  // 한글 → 영어 변환 (Fluentd 전용)
  const FEEDBACK_EN_MAP = {
    '너무추움': 'COLD', '춥다': 'COLD', '추움': 'COLD',
    '적당':     'PERFECT', '딱좋음': 'PERFECT',
    '덥다':     'HOT', '더움': 'HOT', '너무더움': 'HOT',
  };
  const feedbackEn = FEEDBACK_EN_MAP[safeFeedback] || 'PERFECT';

  // 날씨 조건 → 영어 코드
  const WEATHER_CODE_MAP = {
    '맑음': 'CLEAR', '흐림': 'CLOUDY', '구름많음': 'PARTLY_CLOUDY',
    '비': 'RAIN', '눈': 'SNOW', '안개': 'FOG',
  };
  const mappedCondition = WEATHER_CODE_MAP[weather_condition] || weather_condition;

  try {
    // 팀원 DB: actual_temp → temperature 컬럼
    await pool.execute(
      `INSERT INTO temperature_feedback
         (customer_id, feedback, temperature, feels_like_temp,
          humidity, wind_speed, weather_condition, feedback_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)`,
      [partnerCustId, safeFeedback, actual_temp, feels_like_temp,
       humidity, wind_speed, weather_condition]
    );

    // FEEDBACK 이벤트 → Fluentd
    sendToFluentd({
      event_type:       'FEEDBACK',
      customer_id:      partnerCustId,
      actual_temp,
      feels_like_temp,
      humidity,
      wind_speed,
      weather_condition: mappedCondition,
      feedback:         feedbackEn,
      feedback_date:    new Date().toISOString().split('T')[0],
      timestamp:        new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '피드백 저장 실패' }); }
});

// ================================================================
// BEHAVIOR LOG (팀원 DB에 테이블 없으면 Kafka만 전송)
// ================================================================
app.post('/api/logs/behavior', async (req, res) => {
  const { customer_id, action, page_url, item_id, duration, scroll_depth } = req.body;
  try {
    const sent = await sendToKafka('weatherfit.behavior', {
      customer_id: customer_id ?? null, action, page_url: page_url ?? null,
      item_id: item_id ?? null, duration: duration ?? null, scroll_depth: scroll_depth ?? null,
    });
    if (!sent) {
      try {
        await pool.execute(
          `INSERT INTO behavior_log (customer_id, action, page_url, item_id, duration, scroll_depth)
           VALUES (?,?,?,?,?,?)`,
          [customer_id ?? null, action, page_url ?? null, item_id ?? null, duration ?? null, scroll_depth ?? null]
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
      `INSERT INTO process_success_log (topic, partition_no, offset_value, data_type, raw_data, customer_id, consumer_group)
       VALUES (?,?,?,?,?,?,?)`,
      [topic, partition_no, offset_value, data_type, JSON.stringify(raw_data), customer_id ?? null, consumer_group]
    );
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

app.post('/api/logs/fail', async (req, res) => {
  try {
    const { topic, partition_no, offset_value, raw_data, fail_reason, fail_type, customer_id, retry_count, consumer_group } = req.body;
    await pool.execute(
      `INSERT INTO process_fail_log (topic, partition_no, offset_value, raw_data, fail_reason, fail_type, customer_id, retry_count, consumer_group)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [topic, partition_no, offset_value, JSON.stringify(raw_data), fail_reason, fail_type, customer_id ?? null, retry_count ?? 0, consumer_group]
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

app.listen(4000, () => console.log('✅ WeatherFit API v3 실행 중: http://localhost:4000'));

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
    const groupBy = period === 'yearly'  ? "DATE_FORMAT(purchased_at,'%Y')"
                  : period === 'monthly' ? "DATE_FORMAT(purchased_at,'%Y-%m')"
                  : period === 'weekly'  ? "YEARWEEK(purchased_at,1)"
                  :                        "DATE_FORMAT(purchased_at,'%Y-%m-%d')";
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
    sql += ' ORDER BY id DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows.map(r => ({ ...r, customer_id: r.uid })));
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 조회 실패' }); }
});

app.get('/api/admin/customers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [[customer]] = await pool.execute('SELECT * FROM customer WHERE uid = ? OR id = ?', [id, id]);
    if (!customer) return res.status(404).json({ error: '고객 없음' });

    const [purchases] = await pool.execute(
      `SELECT pu.*, p.product_name as product_name, p.brand, p.image_url
       FROM purchase pu LEFT JOIN product p ON pu.product_id = p.id
       WHERE pu.customer_id = ? ORDER BY pu.purchased_at DESC`, [customer.id]
    );
    const [feedbacks] = await pool.execute(
      'SELECT * FROM temperature_feedback WHERE customer_id = ? ORDER BY feedback_date DESC LIMIT 20', [customer.id]
    );
    const [wardrobe] = await pool.execute(
      'SELECT * FROM wardrobe_item WHERE customer_id = ?', [customer.id]
    );
    res.json({ customer: { ...customer, customer_id: customer.uid }, purchases, feedbacks, wardrobe });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 상세 조회 실패' }); }
});

app.patch('/api/admin/customers/:id/membership', adminAuth, async (req, res) => {
  const { membership_level } = req.body;
  try {
    await pool.execute('UPDATE customer SET membership_level = ? WHERE uid = ? OR id = ?',
      [membership_level, req.params.id, req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '등급 변경 실패' }); }
});

// 쿠폰 관련 admin (테이블 없으면 graceful)
app.get('/api/admin/coupons', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM coupon ORDER BY id DESC');
    res.json(rows);
  } catch { res.json([]); }
});

app.post('/api/admin/coupons', adminAuth, async (req, res) => {
  try {
    const { name, code, discount_type, discount_value, min_order_amt, max_discount, valid_from, valid_until } = req.body;
    await pool.execute(
      `INSERT INTO coupon (code, name, discount_type, discount_value, min_order_amt, max_discount, valid_from, valid_until)
       VALUES (?,?,?,?,?,?,?,?)`,
      [code.toUpperCase(), name, discount_type, discount_value, min_order_amt || 0, max_discount || null, valid_from, valid_until]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 생성 실패' }); }
});

app.get('/api/admin/logs/behavior', adminAuth, async (req, res) => {
  try {
    const { customer_id, action, limit = 100 } = req.query;
    let sql = 'SELECT * FROM behavior_log WHERE 1=1';
    const params = [];
    if (customer_id) { sql += ' AND customer_id=?'; params.push(customer_id); }
    if (action)      { sql += ' AND action=?'; params.push(action); }
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
      'SELECT feedback, AVG(temperature) as avg_temp, AVG(feels_like_temp) as avg_feels FROM temperature_feedback GROUP BY feedback'
    );
    res.json({ byType, avgTemp });
  } catch (err) { console.error(err); res.status(500).json({ error: '피드백 통계 실패' }); }
});

app.get('/api/admin/purchase/stats', adminAuth, async (req, res) => {
  try {
    const [byStatus] = await pool.execute(
      'SELECT status, COUNT(*) as count, COALESCE(SUM(price),0) as revenue FROM purchase GROUP BY status'
    );
    const [topProducts] = await pool.execute(
      `SELECT p.product_name as name, p.brand, p.category, COUNT(*) as count, SUM(pu.price) as revenue
       FROM purchase pu JOIN product p ON pu.product_id = p.id
       WHERE pu.status='paid'
       GROUP BY pu.product_id ORDER BY count DESC LIMIT 10`
    );
    res.json({ byStatus, topProducts });
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 통계 실패' }); }
});

app.get('/api/admin/stats/styles', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT preferred_style, activity_level, cold_sensitivity, COUNT(*) as count
       FROM customer GROUP BY preferred_style, activity_level, cold_sensitivity`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '스타일 통계 실패' }); }
});
