/**
 * WeatherFit 백엔드 API v5
 * DB: 팀원 weatherfit DB (210.104.76.135:3306) — DESCRIBE 실측 스키마 기준
 *
 * customer         : id(bigint PK auto), uid(varchar50), name, email, phone,
 *                    birth_date, gender, join_date, membership_level,
 *                    cold_sensitivity, activity_level, preferred_style,
 *                    marketing_consent, push_consent, email_consent, sms_consent,
 *                    dm_consent, tm_consent, last_login_date, is_fraud,
 *                    join_channel, join_type, region_id
 *                    ※ password_hash 없음, customer_id 컬럼 없음
 *
 * product          : id(bigint PK auto), product_name, category, price, style,
 *                    color_id, warmth, brand, image_url, in_stock
 *                    ※ name 컬럼 없음
 *
 * purchase         : id(bigint PK auto), customer_id(bigint), product_id(bigint),
 *                    price, purchased_at(datetime), status, size, view_duration
 *                    ※ purchase_date 없음
 *
 * wardrobe_item    : id(bigint PK auto), customer_id(bigint), category, style,
 *                    color_id, warmth, registered_date
 *
 * temperature_feedback : id(bigint PK auto), customer_id(bigint), feedback,
 *                        temperature(double), feedback_date,
 *                        feels_like_temp, humidity, wind_speed,
 *                        weather_condition, recommended_outfit
 *                        ※ actual_temp 없음 → temperature 사용
 *
 * behavior_log     : id(bigint PK auto), customer_id(bigint), event_type(varchar50),
 *                    page_url, item_id(bigint), duration, scroll_depth, timestamp
 *                    ※ action 컬럼 없음
 */
require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { Kafka, logLevel } = require('kafkajs');
const axios   = require('axios');

// ── product_id 변환: prod_N 또는 숫자 → bigint ────────────────
function toPartnerId(productId) {
  if (!productId) return null;
  const str = String(productId);
  if (str.startsWith('prod_')) {
    const n = parseInt(str.slice(5), 10);
    return isNaN(n) ? null : n;
  }
  const n = parseInt(str.replace(/[^0-9]/g, ''), 10);
  return n || null;
}

// ── customer uid → bigint id 변환 헬퍼 ───────────────────────
// 숫자(69)         → 그대로 Number 반환
// uid_xxx          → DB에서 id 조회 후 반환
// anon_xxx / 기타  → null 반환 (DB 조회 하지 않음)
async function getPartnerCustomerId(customerId) {
  if (!customerId) return null;
  const str = String(customerId);
  // 순수 숫자 → bigint id 그대로 반환
  if (/^\d+$/.test(str)) return Number(str);
  // anon_ 비로그인 식별자 → null
  if (str.startsWith('anon_')) return null;
  // uid_xxx → DB에서 customer.id(bigint) 조회
  if (str.startsWith('uid_')) {
    const [rows] = await pool.execute('SELECT id FROM customer WHERE uid = ?', [str]);
    return rows.length ? rows[0].id : null;
  }
  // 그 외 알 수 없는 형식 → null
  return null;
}

// ── purchase.status 정규화 ────────────────────────────────────
// DB 저장 형식: WISHLIST / CART / PURCHASED (항상 대문자)
function normalizeStatus(status) {
  const map = {
    wishlist:  'WISHLIST',  WISHLIST:  'WISHLIST',
    cart:      'CART',      CART:      'CART',
    paid:      'PURCHASED', PAID:      'PURCHASED',
    purchased: 'PURCHASED', PURCHASED: 'PURCHASED',
  };
  return map[status] || String(status || '').toUpperCase();
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

// ── DB 연결 ───────────────────────────────────────────────────
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
// password_hash 컬럼 없음 → bcrypt 불필요, uid로 내부 식별
app.post('/api/auth/register', async (req, res) => {
  const {
    name, email, phone, birth_date, gender,
    marketing_consent, push_consent, email_consent, sms_consent,
  } = req.body;
  if (!email) return res.status(400).json({ error: '이메일 필요' });
  try {
    const [exist] = await pool.execute('SELECT id FROM customer WHERE email = ?', [email]);
    if (exist.length > 0) return res.status(409).json({ error: '이미 가입된 이메일입니다' });

    // uid: 내부 식별자 (uid_xxx) — customer.uid 컬럼에 저장
    const uid = 'uid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    // gender: M/F → MALE/FEMALE 통일 (DB 저장 형식)
    const genderMap = { M: 'MALE', F: 'FEMALE', MALE: 'MALE', FEMALE: 'FEMALE' };
    const dbGender  = genderMap[String(gender).toUpperCase()] || 'MALE';

    await pool.execute(
      `INSERT INTO customer
         (uid, name, email, phone, birth_date, gender,
          join_date, membership_level,
          marketing_consent, push_consent, email_consent, sms_consent)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE, 'BASIC', ?, ?, ?, ?)`,
      [uid, name || null, email, phone || null, birth_date || null, dbGender,
       marketing_consent ? 1 : 0, push_consent ? 1 : 0,
       email_consent ? 1 : 0, sms_consent ? 1 : 0]
    );

    const [rows] = await pool.execute('SELECT * FROM customer WHERE uid = ?', [uid]);
    const customer = rows[0];
    // customer_id = uid (프론트 localStorage 호환)
    res.json({ success: true, customer: { ...customer, customer_id: uid } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원가입 실패' });
  }
});

// 로그인  POST /api/auth/login
// password_hash 없음 → 이메일만으로 조회 (로컬 폴백이 비밀번호 검증)
app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '이메일을 입력해주세요' });
  try {
    const [rows] = await pool.execute('SELECT * FROM customer WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    const customer = rows[0];

    // last_login_date 업데이트 (bigint PK id 기준)
    await pool.execute(
      'UPDATE customer SET last_login_date = CURRENT_DATE WHERE id = ?',
      [customer.id]
    );

    // customer_id = uid (프론트 localStorage 호환), id(bigint)도 포함 → partnerCustomerId 저장용
    res.json({ success: true, customer: { ...customer, customer_id: customer.uid } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '로그인 실패' });
  }
});

// ================================================================
// PRODUCT
// product: id(bigint PK auto), product_name, category, price,
//          style, color_id, warmth, brand, image_url, in_stock
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
    sql += ' ORDER BY id';
    const [rows] = await pool.execute(sql, params);
    // product_name → name alias, id → product_id: 'prod_N' (프론트 호환)
    res.json(rows.map(p => ({ ...p, name: p.product_name, product_id: `prod_${p.id}` })));
  } catch (err) { console.error(err); res.status(500).json({ error: '상품 조회 실패' }); }
});

app.get('/api/products/:id', async (req, res) => {
  // prod_11 또는 11 형태 모두 수용 → 숫자 변환
  const numericId = parseInt(String(req.params.id).replace(/^prod_/i, ''), 10);
  if (isNaN(numericId)) return res.status(400).json({ error: '잘못된 상품 ID' });

  const partnerCustId = req.query.partnerCustomerId
    ? Number(req.query.partnerCustomerId)
    : null;

  try {
    const [rows] = await pool.execute('SELECT * FROM product WHERE id = ?', [numericId]);
    if (!rows.length) return res.status(404).json({ error: '상품 없음' });

    // VIEW 이벤트 → Fluentd (fire-and-forget)
    sendToFluentd({
      event_type:  'VIEW',
      customer_id: partnerCustId,
      product_id:  numericId,
      timestamp:   new Date().toISOString(),
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
    await pool.execute(
      `INSERT INTO customer (uid, cold_sensitivity, activity_level, preferred_style,
         membership_level, join_date, join_channel, join_type)
       VALUES (?, ?, ?, ?, 'BASIC', CURRENT_DATE, 'web', 'self')
       ON DUPLICATE KEY UPDATE
         cold_sensitivity = VALUES(cold_sensitivity),
         activity_level   = VALUES(activity_level),
         preferred_style  = VALUES(preferred_style)`,
      [customer_id,
       parseInt(cold_sensitivity ?? 0) || 0,              // 숫자 강제 변환
       (activity_level  || 'MEDIUM').toUpperCase(),        // 대문자 통일
       (preferred_style || 'CASUAL').toUpperCase()]        // 대문자 통일
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
    // 값 정규화: gender M/F→MALE/FEMALE, 열거형 대문자, cold_sensitivity parseInt
    const gMap = { M: 'MALE', F: 'FEMALE', MALE: 'MALE', FEMALE: 'FEMALE' };
    const values = fields.map(f => {
      const v = req.body[f];
      if (f === 'gender')          return gMap[String(v).toUpperCase()] || 'MALE';
      if (f === 'activity_level')  return (v || 'MEDIUM').toUpperCase();
      if (f === 'preferred_style') return (v || 'CASUAL').toUpperCase();
      if (f === 'membership_level')return (v || 'BASIC').toUpperCase();
      if (f === 'cold_sensitivity')return parseInt(v) || 0;
      return v;
    });
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    if (String(req.params.id).startsWith('uid_')) {
      await pool.execute(`UPDATE customer SET ${setClause} WHERE uid = ?`, [...values, req.params.id]);
    } else {
      await pool.execute(`UPDATE customer SET ${setClause} WHERE id = ?`, [...values, req.params.id]);
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '정보 수정 실패' }); }
});

// ================================================================
// COUPON
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
    const discountAmt = cpn.discount_type === 'amount'
      ? cpn.discount_value
      : Math.min(Math.floor(amt * cpn.discount_value / 100), cpn.max_discount || Infinity);
    res.json({ ...cpn, discountAmt });
  } catch { res.status(200).json({ error: '쿠폰 기능 미지원' }); }
});

// ── 쿠폰 발급 프록시 (팀원 캠페인 API → localhost:8080) ─────────
app.post('/api/coupons/issue-campaign', async (req, res) => {
  const { campaign_id, customer_id } = req.body;
  if (!campaign_id || !customer_id)
    return res.status(400).json({ error: 'campaign_id, customer_id 필요' });
  try {
    const response = await axios.post(
      `http://localhost:8080/api/campaigns/${campaign_id}/issue-coupons`,
      { customerIds: [customer_id] }
    );
    res.json(response.data);
  } catch (err) {
    console.error('[issue-campaign]', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: '쿠폰 발급 실패',
      detail: err.response?.data || err.message,
    });
  }
});

// ── 내 쿠폰 목록 조회 ─────────────────────────────────────────
// coupon 테이블 실제 컬럼: type, min_order_amount, max_discount_amount, expired_at(customer_coupon)
// code 컬럼 없음 → coupon_id를 code로 사용
// discount_type: DB 'AMOUNT'/'PERCENT' → 프론트 'amount'/'percent' 소문자 변환
app.get('/api/coupons/my/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT cc.coupon_id,
              c.name,
              c.type                AS discount_type,
              c.discount_value,
              c.min_order_amount    AS min_order_amt,
              c.max_discount_amount AS max_discount,
              cc.issued_at          AS valid_from,
              cc.expired_at         AS valid_until
       FROM customer_coupon cc
       JOIN coupon c ON cc.coupon_id = c.coupon_id
       WHERE cc.customer_id = ? AND cc.used_at IS NULL
         AND cc.status = 'ACTIVE' AND cc.expired_at >= CURRENT_DATE
         AND c.status = 'ACTIVE'
       ORDER BY cc.expired_at ASC`,
      [req.params.customerId]
    );
    const result = rows.map(r => ({
      ...r,
      code:          r.coupon_id,                           // coupon 테이블에 code 컬럼 없음
      discount_type: (r.discount_type || '').toLowerCase(), // 'AMOUNT'→'amount'
    }));
    res.json(result);
  } catch (err) {
    console.error('[coupons/my]', err.message);
    res.json([]);
  }
});

// ================================================================
// WISHLIST (찜)
// purchase 테이블 status='WISHLIST' 사용 (대문자 통일)
// customer_id: uid(문자) → getPartnerCustomerId()로 bigint 변환
// product_id:  prod_N → toPartnerId()로 bigint 변환
// purchased_at(datetime) 사용
// ================================================================
app.get('/api/wishlist/:customerId', async (req, res) => {
  try {
    const custId = await getPartnerCustomerId(req.params.customerId);
    if (!custId) return res.status(400).json({ error: 'customer_id 변환 실패' });

    const [rows] = await pool.execute(
      `SELECT pu.id AS purchase_id, pu.customer_id, pu.product_id,
              pu.status, pu.purchased_at AS wished_at,
              p.product_name AS name, p.brand, p.image_url, p.price
       FROM purchase pu
       JOIN product p ON pu.product_id = p.id
       WHERE pu.customer_id = ? AND pu.status = 'WISHLIST'
       ORDER BY pu.purchased_at DESC`,
      [custId]
    );
    // product_id를 'prod_N' 포맷으로 변환 (프론트 localStorage와 타입 통일)
    res.json(rows.map(row => ({ ...row, product_id: `prod_${row.product_id}` })));
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 목록 조회 실패' }); }
});

app.post('/api/wishlist', async (req, res) => {
  const { customer_id, product_id, partnerCustomerId } = req.body;
  // customer_id(uid_xxx) 우선, 없으면 partnerCustomerId(bigint) 사용
  const custId           = await getPartnerCustomerId(customer_id || partnerCustomerId);
  const partnerProductId = toPartnerId(product_id);

  if (!custId || !partnerProductId) {
    return res.status(400).json({ error: 'customer_id 또는 product_id 변환 실패' });
  }
  try {
    const [productCheck] = await pool.execute(
      'SELECT id, price FROM product WHERE id = ?', [partnerProductId]
    );
    if (!productCheck.length) {
      return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
    }

    const [exist] = await pool.execute(
      `SELECT id FROM purchase WHERE customer_id = ? AND product_id = ? AND status = 'WISHLIST'`,
      [custId, partnerProductId]
    );
    if (exist.length > 0) return res.json({ success: true, duplicate: true });

    await pool.execute(
      `INSERT INTO purchase (customer_id, product_id, price, size, status, purchased_at)
       VALUES (?, ?, 0, NULL, 'WISHLIST', NOW())`,
      [custId, partnerProductId]
    );

    sendToFluentd({
      event_type:  'WISHLIST',
      customer_id: custId,
      product_id:  partnerProductId,
      price:       productCheck[0].price ?? null,
      timestamp:   new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 추가 실패' }); }
});

app.delete('/api/wishlist/:customerId/:productId', async (req, res) => {
  try {
    const custId = await getPartnerCustomerId(req.params.customerId);
    if (!custId) return res.status(400).json({ error: 'customer 없음' });
    const partnerProductId = toPartnerId(req.params.productId);
    await pool.execute(
      `DELETE FROM purchase WHERE customer_id = ? AND product_id = ? AND status = 'WISHLIST'`,
      [custId, partnerProductId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 삭제 실패' }); }
});

// ================================================================
// WARDROBE
// wardrobe_item: id(bigint PK auto), customer_id(bigint),
//               category, style, color_id, warmth, registered_date
// customer_id: uid(문자) → getPartnerCustomerId()로 bigint 변환
// ================================================================
app.get('/api/wardrobe/:customerId', async (req, res) => {
  try {
    const custId = await getPartnerCustomerId(req.params.customerId);
    if (!custId) return res.status(400).json({ error: 'customer_id 변환 실패' });

    const [rows] = await pool.execute(
      'SELECT * FROM wardrobe_item WHERE customer_id = ? ORDER BY id DESC',
      [custId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '옷장 조회 실패' }); }
});

app.post('/api/wardrobe', async (req, res) => {
  const { customer_id, category, style, color_id, warmth, partnerCustomerId } = req.body;
  // customer_id(uid_xxx) 우선, 없으면 partnerCustomerId(bigint) 사용
  const custId = await getPartnerCustomerId(customer_id || partnerCustomerId);
  if (!custId) return res.status(400).json({ error: 'customer_id 변환 실패' });
  try {
    await pool.execute(
      `INSERT INTO wardrobe_item (customer_id, category, style, color_id, warmth, registered_date)
       VALUES (?, ?, ?, ?, ?, CURRENT_DATE)`,
      [custId,
       (category || 'TOP').toUpperCase(),           // 대문자 통일
       (style    || 'CASUAL').toUpperCase(),         // 대문자 통일
       color_id ?? null,
       parseInt(warmth ?? 1) || 1]                  // 숫자 강제 변환
    );
    sendToFluentd({
      event_type:  'WARDROBE',
      customer_id: custId,
      category:    (category || '').toUpperCase(),
      style:       (style    || '').toUpperCase(),
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
// purchase: id(bigint PK auto), customer_id(bigint), product_id(bigint),
//           price, purchased_at(datetime), status, size, view_duration
// ================================================================
app.get('/api/purchase/:customerId/cart', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pu.id AS purchase_id, pu.customer_id, pu.product_id,
              pu.price, pu.size, pu.status, pu.purchased_at,
              p.product_name AS name, p.brand, p.image_url, p.price AS list_price
       FROM purchase pu
       JOIN product p ON pu.product_id = p.id
       WHERE pu.customer_id = ? AND pu.status = 'CART'`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '장바구니 조회 실패' }); }
});

app.post('/api/purchase', async (req, res) => {
  const { customer_id, product_id, size, price, status, partnerCustomerId } = req.body;
  const partnerCustId    = partnerCustomerId ? Number(partnerCustomerId) : null;
  const partnerProductId = toPartnerId(product_id);

  if (!partnerProductId) {
    return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
  }
  try {
    const [productCheck] = await pool.execute(
      'SELECT id FROM product WHERE id = ?', [partnerProductId]
    );
    if (!productCheck.length) {
      return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
    }

    // status 정규화: 'paid'→'PURCHASED', 'cart'→'CART' (대문자 통일)
    const currentStatus = normalizeStatus(status || 'CART');

    if (currentStatus === 'PURCHASED') {
      const sent = await sendToKafka('weatherfit.purchase', {
        customer_id: partnerCustId, product_id: partnerProductId,
        status: 'PURCHASED', size: size || null, price,
      });
      if (!sent) {
        await pool.execute(
          `INSERT INTO purchase (customer_id, product_id, price, size, status, purchased_at)
           VALUES (?, ?, ?, ?, 'PURCHASED', NOW())`,
          [partnerCustId, partnerProductId, price, size || null]
        );
      }
      sendToFluentd({
        event_type:  'PURCHASE',
        customer_id: partnerCustId,
        product_id:  partnerProductId,
        size:        size || null,
        price,
        timestamp:   new Date().toISOString(),
      });
    } else {
      if (currentStatus === 'CART') {
        const [existing] = await pool.execute(
          `SELECT id FROM purchase
           WHERE customer_id = ? AND product_id = ? AND size = ? AND status = 'CART'`,
          [partnerCustId, partnerProductId, size]
        );
        if (existing.length > 0) return res.json({ success: true, duplicate: true });
      }
      await pool.execute(
        `INSERT INTO purchase (customer_id, product_id, price, size, status, purchased_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [partnerCustId, partnerProductId, price || 0, size || null, currentStatus]
      );
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
  const dbStatus = normalizeStatus(status); // 대문자 통일: CART / PURCHASED / WISHLIST
  try {
    await pool.execute('UPDATE purchase SET status = ? WHERE id = ?', [dbStatus, req.params.purchaseId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '상태 변경 실패' }); }
});

// ================================================================
// TEMPERATURE FEEDBACK
// temperature_feedback: id(bigint PK auto), customer_id(bigint),
//   feedback, temperature(double), feedback_date,
//   feels_like_temp, humidity, wind_speed, weather_condition, recommended_outfit
//   ※ actual_temp 없음 → temperature 컬럼 사용
// ================================================================
app.post('/api/feedback', async (req, res) => {
  const {
    customer_id, actual_temp, feels_like_temp,
    humidity, wind_speed, weather_condition, feedback, partnerCustomerId,
  } = req.body;

  const partnerCustId = partnerCustomerId ? Number(partnerCustomerId) : null;

  // feedback: 영어로 오면 한글로 변환 후 유효성 검사
  const feedbackKorMap = {
    TOO_COLD: '너무추움', VERY_COLD: '너무추움',
    COLD:     '춥다',
    PERFECT:  '적당', GOOD: '적당', NORMAL: '적당',
    HOT:      '덥다',
    TOO_HOT:  '너무더움', VERY_HOT: '너무더움',
  };
  const normalizedFeedback = feedbackKorMap[String(feedback).toUpperCase()] || feedback;
  const VALID_FEEDBACK = ['너무추움', '춥다', '적당', '덥다', '너무더움'];
  const safeFeedback = VALID_FEEDBACK.includes(normalizedFeedback) ? normalizedFeedback : '적당';

  const FEEDBACK_EN_MAP = {
    '너무추움': 'COLD', '춥다': 'COLD', '추움': 'COLD',
    '적당':     'PERFECT', '딱좋음': 'PERFECT',
    '덥다':     'HOT',  '더움': 'HOT', '너무더움': 'HOT',
  };
  const feedbackEn = FEEDBACK_EN_MAP[safeFeedback] || 'PERFECT';

  const WEATHER_CODE_MAP = {
    '맑음': 'CLEAR', '흐림': 'CLOUDY', '구름많음': 'PARTLY_CLOUDY',
    '비': 'RAIN', '눈': 'SNOW', '안개': 'FOG',
  };
  const mappedCondition = WEATHER_CODE_MAP[weather_condition] || weather_condition;

  try {
    // actual_temp → temperature 컬럼
    await pool.execute(
      `INSERT INTO temperature_feedback
         (customer_id, feedback, temperature, feels_like_temp,
          humidity, wind_speed, weather_condition, feedback_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)`,
      [partnerCustId, safeFeedback, actual_temp, feels_like_temp,
       humidity, wind_speed, weather_condition]
    );

    sendToFluentd({
      event_type:        'FEEDBACK',
      customer_id:       partnerCustId,
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
// behavior_log: id(bigint PK auto), customer_id(bigint),
//   event_type(varchar50), page_url, item_id(bigint),
//   duration, scroll_depth, timestamp
//   ※ action 컬럼 없음 → event_type 사용
// ================================================================
app.post('/api/logs/behavior', async (req, res) => {
  const { customer_id, action, event_type, page_url, item_id, duration, scroll_depth } = req.body;
  // action 또는 event_type 둘 다 수용 → 대문자 통일
  const dbEventType = (event_type || action || 'PAGE_VIEW').toUpperCase();
  try {
    const custId = customer_id ? await getPartnerCustomerId(customer_id) : null;

    // Kafka 전송 — 성공 여부 무관, fire-and-forget (실패해도 DB 저장은 계속)
    sendToKafka('weatherfit.behavior', {
      customer_id: custId, event_type: dbEventType,
      page_url: page_url ?? null, item_id: item_id ?? null,
      duration: duration ?? null, scroll_depth: scroll_depth ?? null,
    }).catch(e => console.warn('[Kafka behavior]', e.message));

    // DB 항상 직접 저장 (Kafka Consumer 없어도 데이터 보장)
    await pool.execute(
      `INSERT INTO behavior_log
         (customer_id, event_type, page_url, item_id, duration, scroll_depth, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [custId ?? null, dbEventType, page_url ?? null,
       item_id ? Number(item_id) : null, duration ?? null, scroll_depth ?? null]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[behavior POST]', err.message);
    res.status(500).json({ error: '로그 저장 실패' });
  }
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

app.listen(4000, () => console.log('✅ WeatherFit API v5 실행 중: http://localhost:4000'));

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
    const [[purchases]] = await pool.execute("SELECT COUNT(*) as cnt FROM purchase WHERE status='PURCHASED'");
    const [[wishlist]]  = await pool.execute("SELECT COUNT(*) as cnt FROM purchase WHERE status='WISHLIST'");
    const [[feedbacks]] = await pool.execute('SELECT COUNT(*) as cnt FROM temperature_feedback');
    const [[revenue]]   = await pool.execute("SELECT COALESCE(SUM(price),0) as total FROM purchase WHERE status='PURCHASED'");
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
    // purchased_at 컬럼 기준
    const groupBy = period === 'yearly'  ? "DATE_FORMAT(purchased_at,'%Y')"
                  : period === 'monthly' ? "DATE_FORMAT(purchased_at,'%Y-%m')"
                  : period === 'weekly'  ? "YEARWEEK(purchased_at,1)"
                  :                        "DATE_FORMAT(purchased_at,'%Y-%m-%d')";
    const [rows] = await pool.execute(
      `SELECT ${groupBy} as label, SUM(price) as revenue, COUNT(*) as count
       FROM purchase WHERE status='PURCHASED'
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
    const [[customer]] = await pool.execute(
      'SELECT * FROM customer WHERE uid = ? OR id = ?', [id, id]
    );
    if (!customer) return res.status(404).json({ error: '고객 없음' });

    const [purchases] = await pool.execute(
      `SELECT pu.*, p.product_name AS product_name, p.brand, p.image_url
       FROM purchase pu
       LEFT JOIN product p ON pu.product_id = p.id
       WHERE pu.customer_id = ? ORDER BY pu.purchased_at DESC`,
      [customer.id]
    );
    const [feedbacks] = await pool.execute(
      `SELECT * FROM temperature_feedback
       WHERE customer_id = ? ORDER BY feedback_date DESC LIMIT 20`,
      [customer.id]
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
    await pool.execute(
      'UPDATE customer SET membership_level = ? WHERE uid = ? OR id = ?',
      [membership_level, req.params.id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '등급 변경 실패' }); }
});

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
      `INSERT INTO coupon
         (code, name, discount_type, discount_value,
          min_order_amt, max_discount, valid_from, valid_until)
       VALUES (?,?,?,?,?,?,?,?)`,
      [code.toUpperCase(), name, discount_type, discount_value,
       min_order_amt || 0, max_discount || null, valid_from, valid_until]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 생성 실패' }); }
});

app.get('/api/admin/logs/behavior', adminAuth, async (req, res) => {
  try {
    const { customer_id, event_type, action, limit = 100 } = req.query;
    const evtType = event_type || action || null;
    let sql = 'SELECT * FROM behavior_log WHERE 1=1';
    const params = [];
    if (customer_id) { sql += ' AND customer_id=?'; params.push(customer_id); }
    if (evtType)     { sql += ' AND event_type=?';  params.push(evtType); }
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
    // temperature 컬럼 사용 (actual_temp 없음)
    const [avgTemp] = await pool.execute(
      `SELECT feedback,
              AVG(temperature)     AS avg_temp,
              AVG(feels_like_temp) AS avg_feels
       FROM temperature_feedback GROUP BY feedback`
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
      `SELECT p.product_name AS name, p.brand, p.category,
              COUNT(*) as count, SUM(pu.price) as revenue
       FROM purchase pu
       JOIN product p ON pu.product_id = p.id
       WHERE pu.status='PURCHASED'
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
