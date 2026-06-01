/**
 * WeatherFit 백엔드 API v5
 * DB: weatherfit (210.104.76.135:3306) — 확정 DDL 기준
 *
 * customer         : id(bigint PK auto), uid(varchar50), name, email, phone,
 *                    birth_date, gender, join_date, membership_level,
 *                    cold_sensitivity, activity_level, preferred_style,
 *                    marketing_consent, push_consent, email_consent, sms_consent,
 *                    dm_consent, tm_consent, last_login_date, is_fraud,
 *                    join_channel, join_type, region_id, created_at, updated_at
 *                    ※ password_hash 없음, customer_id 컬럼 없음
 *
 * product          : id(bigint PK auto), product_name, category, price, style,
 *                    color_id, warmth, brand, image_url, in_stock, created_at
 *                    ※ name 컬럼 없음
 *
 * coupon           : id(bigint PK auto), coupon_name, code(varchar50),
 *                    type(PERCENT/AMOUNT), discount_value, min_order_amount,
 *                    max_discount_amount, valid_days, target_category, campaign_id,
 *                    issued_count, used_count, status(ACTIVE/INACTIVE/EXPIRED),
 *                    expired_at(date), description, created_at
 *
 * customer_coupon  : id(bigint PK auto), customer_id(bigint), coupon_id(bigint),
 *                    issued_at, used_at, expired_at, status(ISSUED/USED/EXPIRED),
 *                    order_id
 *
 * purchase         : id(bigint PK auto), customer_id(bigint), product_id(bigint),
 *                    price, status(PURCHASED/WISHLIST/CART/VIEW_ONLY),
 *                    size, view_duration, purchased_at, created_at
 *
 * wardrobe_item    : id(bigint PK auto), customer_id(bigint), color_id,
 *                    category, style, warmth, registered_date, created_at
 *
 * temperature_feedback : id(bigint PK auto), customer_id(bigint), region_id,
 *                        feedback(HOT/COLD/PERFECT), temperature(double),
 *                        feels_like_temp, humidity, wind_speed,
 *                        weather_condition, recommended_outfit,
 *                        feedback_date, created_at
 *                        ※ actual_temp 없음 → temperature 사용
 *
 * behavior_log     : id(bigint PK auto), customer_id(bigint), event_type(varchar50),
 *                    page_url, item_id(bigint), duration, scroll_depth,
 *                    timestamp, created_at
 *                    ※ action 컬럼 없음
 *
 * process_success_log : id, customer_id, topic, partition_no, offset_value,
 *                       data_type, consumer_group, raw_message NOT NULL,
 *                       processed_at NOT NULL, created_at NOT NULL
 *
 * process_fail_log : id, customer_id, topic, partition_no, offset_value,
 *                    consumer_group, raw_message NOT NULL, fail_reason,
 *                    fail_type, retry_count, processed_at NOT NULL, created_at NOT NULL
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
const bcrypt  = require('bcryptjs');

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

// ── Kafka Producer 초기화 ──────────────────────────────────────
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
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

// 모든 이벤트를 'weatherfit-log-raw' 단일 토픽으로 전송
const KAFKA_TOPIC = 'weatherfit-log-raw';

async function sendToKafka(data) {
  if (kafkaReady) {
    try {
      await producer.send({
        topic: KAFKA_TOPIC,
        messages: [{ value: JSON.stringify({ ...data, serverTimestamp: new Date().toISOString() }) }],
      });
      console.log(`[Kafka] → ${KAFKA_TOPIC} [${data.event_type}]`, JSON.stringify(data).slice(0, 80));
      return true;
    } catch (e) {
      console.warn(`[Kafka] 전송 실패 [${data.event_type}] — DB 폴백:`, e.message);
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
app.post('/api/auth/register', async (req, res) => {
  const {
    name, email, phone, birth_date, gender, password,
    marketing_consent, push_consent, email_consent, sms_consent,
    cold_sensitivity, anonymous_id,
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

    // 비밀번호 해시 (password 없으면 null)
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    await pool.execute(
      `INSERT INTO customer
         (uid, password_hash, name, email, phone, birth_date, gender,
          join_date, membership_level, cold_sensitivity,
          marketing_consent, push_consent, email_consent, sms_consent)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, 'BASIC', ?, ?, ?, ?, ?)`,
      [uid, passwordHash, name || null, email, phone || null, birth_date || null, dbGender,
       parseInt(cold_sensitivity ?? 3) || 3,
       marketing_consent ? 1 : 0, push_consent ? 1 : 0,
       email_consent ? 1 : 0, sms_consent ? 1 : 0]
    );

    const [rows] = await pool.execute('SELECT * FROM customer WHERE uid = ?', [uid]);
    const { password_hash, ...safeCustomer } = rows[0];
    // SIGNUP Kafka 이벤트 (fire-and-forget)
    sendToKafka({
      event_type:  'signup',
      customer_id: rows[0].id,
      name:        name || null,
      email:       email,
      gender:      dbGender,
    }).catch(() => {});
    // 비로그인 데이터를 회원 계정으로 연동 (Spring Boot)
    if (anonymous_id) {
      fetch(`http://210.104.76.135:8080/api/anonymous-users/${anonymous_id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: rows[0].id }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }
    // customer_id = uid (프론트 localStorage 호환)
    res.json({ success: true, customer: { ...safeCustomer, customer_id: uid } });
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

    // 비밀번호 검증: DB에 hash가 있으면 반드시 password 필요
    if (customer.password_hash) {
      if (!password) return res.status(401).json({ error: '비밀번호를 입력해주세요' });
      const ok = await bcrypt.compare(password, customer.password_hash);
      if (!ok) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    // last_login_date 업데이트
    await pool.execute(
      'UPDATE customer SET last_login_date = CURRENT_DATE WHERE id = ?',
      [customer.id]
    );

    // 응답에서 password_hash 제거 후 전송
    const { password_hash, ...safeCustomer } = customer;
    // customer_id = uid (프론트 localStorage 호환), id(bigint)도 포함 → partnerCustomerId 저장용
    res.json({ success: true, customer: { ...safeCustomer, customer_id: customer.uid } });
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

    // VIEW 이벤트 → Kafka (fire-and-forget)
    sendToKafka({
      event_type:  'page_view',
      customer_id: partnerCustId,
      product_id:  numericId,
    }).catch(() => {});

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

    // ── 멤버십 등급 계산 (최근 4개월 구매금액 기준, 이번 달 포함) ──
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth() - 4, 1);

    const [[amountRow]] = await pool.execute(
      `SELECT COALESCE(SUM(price), 0) AS total
       FROM purchase
       WHERE customer_id = ? AND status = 'PURCHASED'
         AND purchased_at >= ?`,
      [customer.id, startMonth]
    );
    const amount = Number(amountRow.total);

    const LEVELS = [
      { name: 'BASIC',  min: 0 },
      { name: 'SILVER', min: 100000 },
      { name: 'GOLD',   min: 300000 },
      { name: 'VIP',    min: 500000 },
    ];
    let currentLevel = LEVELS[0];
    for (const l of LEVELS) {
      if (amount >= l.min) currentLevel = l;
    }
    const nextLevel    = LEVELS[LEVELS.indexOf(currentLevel) + 1] || null;
    const amountToNext = nextLevel ? nextLevel.min - amount : 0;

    res.json({
      ...customer,
      customer_id:       customer.uid,
      membership_amount: amount,
      next_level:        nextLevel?.name || null,
      next_level_amount: nextLevel?.min  || null,
      amount_to_next:    Math.max(0, amountToNext),
      next_update:       new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0],
    });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 조회 실패' }); }
});

app.post('/api/customers', async (req, res) => {
  const { customer_id, cold_sensitivity, activity_level, preferred_style, name, email } = req.body;

  // name과 email이 둘 다 없으면 빈 고객 INSERT 금지 (ensureCustomer() 방어)
  if (!name && !email) return res.json({ success: true, skipped: true });

  try {
    // 이미 존재하는 customer_id면 INSERT 대신 선호도 UPDATE만 실행
    const [existing] = await pool.execute(
      'SELECT id FROM customer WHERE uid = ?', [customer_id]
    );

    if (existing.length > 0) {
      await pool.execute(
        `UPDATE customer SET
           cold_sensitivity = ?,
           activity_level   = ?,
           preferred_style  = ?
         WHERE uid = ?`,
        [parseInt(cold_sensitivity ?? 0) || 0,
         (activity_level  || 'MEDIUM').toUpperCase(),
         (preferred_style || 'CASUAL').toUpperCase(),
         customer_id]
      );
    } else {
      await pool.execute(
        `INSERT INTO customer (uid, cold_sensitivity, activity_level, preferred_style,
           membership_level, join_date, join_channel, join_type)
         VALUES (?, ?, ?, ?, 'BASIC', CURRENT_DATE, 'web', 'self')`,
        [customer_id,
         parseInt(cold_sensitivity ?? 0) || 0,
         (activity_level  || 'MEDIUM').toUpperCase(),
         (preferred_style || 'CASUAL').toUpperCase()]
      );
    }
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
    // DDL: code VARCHAR(50), status ACTIVE/INACTIVE/EXPIRED, expired_at DATE
    const [rows] = await pool.execute(
      `SELECT * FROM coupon
       WHERE code = ? AND status = 'ACTIVE'
         AND (expired_at IS NULL OR expired_at >= CURRENT_DATE)`,
      [code.toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ error: '유효하지 않은 쿠폰 코드입니다' });
    const cpn = rows[0];
    const amt = parseInt(orderAmt) || 0;
    // DDL: min_order_amount, max_discount_amount, type(PERCENT/AMOUNT)
    if (cpn.min_order_amount && amt < cpn.min_order_amount) {
      return res.status(400).json({ error: `최소 주문금액 ${cpn.min_order_amount.toLocaleString()}원 이상` });
    }
    const discountAmt = cpn.type === 'AMOUNT'
      ? cpn.discount_value
      : Math.min(Math.floor(amt * cpn.discount_value / 100), cpn.max_discount_amount || Infinity);
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

// ── 쿠폰 직접 발급 (status='ISSUED'인 경우만 중복으로 판단) ───────
app.post('/api/coupons/issue', async (req, res) => {
  const { customer_id, coupon_id } = req.body;
  if (!customer_id || !coupon_id)
    return res.status(400).json({ error: 'customer_id, coupon_id 필요' });
  try {
    // ISSUED 상태인 쿠폰만 중복 판단 (USED/EXPIRED는 재발급 허용)
    const [dup] = await pool.execute(
      `SELECT id FROM customer_coupon
       WHERE customer_id = ? AND coupon_id = ? AND status = 'ISSUED'`,
      [customer_id, coupon_id]
    );
    if (dup.length > 0) return res.json({ success: false, duplicate: true });

    // 만료일: 쿠폰의 expired_at 또는 valid_days 기준 계산
    const [[cpn]] = await pool.execute(
      'SELECT expired_at, valid_days FROM coupon WHERE id = ?', [coupon_id]
    );
    if (!cpn) return res.status(404).json({ error: '쿠폰 없음' });
    const expiredAt = cpn.expired_at
      ? cpn.expired_at
      : cpn.valid_days
        ? new Date(Date.now() + cpn.valid_days * 86400000).toISOString().slice(0, 10)
        : null;

    await pool.execute(
      `INSERT INTO customer_coupon (customer_id, coupon_id, issued_at, expired_at, status)
       VALUES (?, ?, NOW(), ?, 'ISSUED')`,
      [customer_id, coupon_id, expiredAt]
    );
    res.json({ success: true });
  } catch (err) { console.error('[coupons/issue]', err.message); res.status(500).json({ error: '쿠폰 발급 실패' }); }
});

// ── 내 쿠폰 목록 조회 ─────────────────────────────────────────
// DDL 기준:
//   coupon: coupon_name, code, type(PERCENT/AMOUNT), min_order_amount, max_discount_amount, status(ACTIVE/...)
//   customer_coupon: coupon_id → JOIN coupon.id, status(ISSUED/USED/EXPIRED), expired_at
// discount_type: DB 'AMOUNT'/'PERCENT' → 프론트 'amount'/'percent' 소문자 변환
app.get('/api/coupons/my/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT cc.coupon_id,
              c.coupon_name         AS name,
              c.code,
              c.type                AS discount_type,
              c.discount_value,
              c.min_order_amount    AS min_order_amt,
              c.max_discount_amount AS max_discount,
              cc.issued_at          AS valid_from,
              cc.expired_at         AS valid_until
       FROM customer_coupon cc
       JOIN coupon c ON cc.coupon_id = c.id
       WHERE cc.customer_id = ? AND cc.status = 'ISSUED'
         AND cc.expired_at >= CURRENT_DATE
         AND c.status = 'ACTIVE'
       ORDER BY cc.expired_at ASC`,
      [req.params.customerId]
    );
    const result = rows.map(r => ({
      ...r,
      code:          r.code || String(r.coupon_id),         // code 있으면 사용, 없으면 coupon_id 폴백
      discount_type: (r.discount_type || '').toLowerCase(), // 'AMOUNT'→'amount', 'PERCENT'→'percent'
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
       ORDER BY pu.id DESC`,
      [custId]
    );
    // product_id: p.id 숫자 그대로 반환
    res.json(rows.map(row => ({ ...row, product_id: Number(row.product_id) })));
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 목록 조회 실패' }); }
});

app.post('/api/wishlist', async (req, res) => {
  const { customer_id, product_id, partnerCustomerId, anonymous_id, price } = req.body;
  try {
    // 1) partnerCustomerId(숫자)가 있으면 직접 사용, 없으면 uid → DB 조회
    //    → 변환된 숫자 custId로 중복 체크 및 INSERT
    const custId = partnerCustomerId
      ? Number(partnerCustomerId)
      : await getPartnerCustomerId(customer_id);
    const partnerProductId = toPartnerId(product_id);

    // customer_id 없어도 anonymous_id 있으면 허용 (비로그인 찜)
    if (!custId && !anonymous_id) {
      return res.status(400).json({ error: 'customer_id 또는 anonymous_id 필요' });
    }
    if (!partnerProductId) {
      return res.status(400).json({ error: 'product_id 변환 실패' });
    }

    const [productCheck] = await pool.execute(
      'SELECT id, price FROM product WHERE id = ?', [partnerProductId]
    );
    if (!productCheck.length) {
      return res.status(404).json({ error: '존재하지 않는 상품입니다', code: 'PRODUCT_NOT_FOUND' });
    }

    // 2) 중복 체크 (custId 기준, 비로그인은 anonymous_id 기준)
    const [exist] = custId
      ? await pool.execute(
          `SELECT id FROM purchase WHERE customer_id = ? AND product_id = ? AND status = 'WISHLIST'`,
          [custId, partnerProductId]
        )
      : await pool.execute(
          `SELECT id FROM purchase WHERE anonymous_id = ? AND product_id = ? AND status = 'WISHLIST'`,
          [anonymous_id, partnerProductId]
        );
    // 3) 중복이면 INSERT 없이 반환
    if (exist.length > 0) return res.json({ success: true, duplicate: true });

    // 4) 중복 아니면 INSERT — price: 프론트에서 전달된 값, 없으면 product 테이블에서 조회
    const insertPrice = (price != null && Number(price) > 0)
      ? Number(price)
      : Number(productCheck[0].price) || 0;
    await pool.execute(
      `INSERT INTO purchase (customer_id, anonymous_id, product_id, price, size, status, purchased_at)
       VALUES (?, ?, ?, ?, NULL, 'WISHLIST', NULL)`,
      [custId || null, anonymous_id || null, partnerProductId, insertPrice]
    );

    sendToKafka({
      event_type:  'wishlist_add',
      customer_id: custId,
      product_id:  partnerProductId,
      price:       productCheck[0].price ?? null,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) { console.error('[wishlist POST]', err.message); res.status(500).json({ error: '찜 추가 실패' }); }
});

app.delete('/api/wishlist/:customerId/:productId', async (req, res) => {
  try {
    const { anonymous_id } = req.query;
    const custId = await getPartnerCustomerId(req.params.customerId);
    const partnerProductId = toPartnerId(req.params.productId);

    if (custId) {
      // 로그인 사용자: customer_id 기준 삭제
      await pool.execute(
        `DELETE FROM purchase WHERE customer_id = ? AND product_id = ? AND status = 'WISHLIST'`,
        [custId, partnerProductId]
      );
    } else if (anonymous_id) {
      // 비로그인 사용자: anonymous_id 기준 삭제
      await pool.execute(
        `DELETE FROM purchase WHERE anonymous_id = ? AND product_id = ? AND status = 'WISHLIST'`,
        [anonymous_id, partnerProductId]
      );
    } else {
      return res.status(400).json({ error: 'customer 또는 anonymous_id 필요' });
    }

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
  const { customer_id, category, style, color_id, warmth, partnerCustomerId, anonymous_id } = req.body;
  // customer_id(uid_xxx) 우선, 없으면 partnerCustomerId(bigint) 사용
  const custId = await getPartnerCustomerId(customer_id || partnerCustomerId);
  // customer_id 없을 때 anonymous_id가 있으면 허용 (비로그인 저장)
  if (!custId && !anonymous_id) return res.status(400).json({ error: 'customer_id 또는 anonymous_id 필요' });
  try {
    await pool.execute(
      `INSERT INTO wardrobe_item (customer_id, anonymous_id, category, style, color_id, warmth, registered_date)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE)`,
      [custId || null, anonymous_id || null,
       (category || 'TOP').toUpperCase(),           // 대문자 통일
       (style    || 'CASUAL').toUpperCase(),         // 대문자 통일
       color_id ?? null,
       parseInt(warmth ?? 1) || 1]                  // 숫자 강제 변환
    );
    sendToKafka({
      event_type:  'wardrobe_add',
      customer_id: custId,
      category:    (category || '').toUpperCase(),
      style:       (style    || '').toUpperCase(),
      color_id:    color_id ?? null,
      warmth,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '아이템 추가 실패' }); }
});

app.delete('/api/wardrobe/:wardrobeId', async (req, res) => {
  try {
    const { wardrobeId } = req.params;
    const partnerCustomerId = req.query.partnerCustomerId;
    await pool.execute('DELETE FROM wardrobe_item WHERE id = ?', [wardrobeId]);
    sendToKafka({
      event_type:  'wardrobe_delete',
      customer_id: partnerCustomerId ? Number(partnerCustomerId) : null,
      item_id:     wardrobeId,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '아이템 삭제 실패' }); }
});

// ================================================================
// PURCHASE
// purchase: id(bigint PK auto), customer_id(bigint), product_id(bigint),
//           price, purchased_at(datetime), status, size, view_duration
// ================================================================
// 구매 내역 조회  GET /api/purchase/:customerId/history
app.get('/api/purchase/:customerId/history', async (req, res) => {
  try {
    const custId = await getPartnerCustomerId(req.params.customerId);
    if (!custId) return res.status(400).json({ error: 'customer_id 변환 실패' });

    const [rows] = await pool.execute(
      `SELECT pu.id AS purchase_id, pu.product_id, pu.price, pu.size,
              pu.status, pu.purchased_at,
              p.product_name AS name, p.brand, p.image_url
       FROM purchase pu
       JOIN product p ON pu.product_id = p.id
       WHERE pu.customer_id = ? AND pu.status = 'PURCHASED'
       ORDER BY pu.purchased_at DESC`,
      [custId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 내역 조회 실패' }); }
});

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
  const { customer_id, product_id, size, price, status, partnerCustomerId, coupon_id } = req.body;
  // partnerCustomerId 또는 customer_id 둘 다 bigint 허용
  const partnerCustId    = partnerCustomerId ? Number(partnerCustomerId)
                         : customer_id       ? Number(customer_id)
                         : null;
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
      // Kafka 전송 시도 → 성공하면 Consumer가 DB 저장, 실패하면 직접 저장
      const sent = await sendToKafka({
        event_type:  'purchase',
        customer_id: partnerCustId,
        product_id:  partnerProductId,
        price,
        size:        size || null,
      });
      if (!sent) {
        await pool.execute(
          `INSERT INTO purchase (customer_id, product_id, price, size, status, purchased_at)
           VALUES (?, ?, ?, ?, 'PURCHASED', NOW())`,
          [partnerCustId, partnerProductId, price, size || null]
        );
      }
      // 쿠폰 사용 처리 — customer_coupon status → USED
      if (coupon_id && partnerCustId) {
        const orderId = `ord_${Date.now()}`;
        await pool.execute(
          `UPDATE customer_coupon
           SET status = 'USED', used_at = NOW(), order_id = ?
           WHERE customer_id = ? AND coupon_id = ? AND status = 'ISSUED'`,
          [orderId, partnerCustId, coupon_id]
        ).catch(() => {}); // 쿠폰 처리 실패해도 구매는 완료
      }
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
        `INSERT INTO purchase (customer_id, product_id, price, size, status)
         VALUES (?, ?, ?, ?, ?)`,
        [partnerCustId, partnerProductId, price || 0, size || null, currentStatus]
      );
      sendToKafka({
        event_type:  'add_to_cart',
        customer_id: partnerCustId,
        product_id:  partnerProductId,
        price,
        size:        size || null,
      }).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 처리 실패' }); }
});

// 장바구니 아이템 삭제  DELETE /api/cart/:purchaseId
app.delete('/api/cart/:purchaseId', async (req, res) => {
  try {
    const { purchaseId } = req.params;
    await pool.execute(
      "DELETE FROM purchase WHERE id = ? AND status = 'CART'",
      [purchaseId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '장바구니 삭제 실패' }); }
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
    humidity, wind_speed, weather_condition, feedback, partnerCustomerId, region_name, anonymous_id,
  } = req.body;

  const partnerCustId = partnerCustomerId ? Number(partnerCustomerId) : null;

  // feedback → DDL 저장값: HOT / COLD / PERFECT (대문자 영어)
  // 한글·영어 혼용 입력을 모두 수용해 DDL 기준 대문자 영어로 정규화
  const FEEDBACK_NORM_MAP = {
    // 영어 입력
    HOT: 'HOT', TOO_HOT: 'HOT', VERY_HOT: 'HOT',
    COLD: 'COLD', TOO_COLD: 'COLD', VERY_COLD: 'COLD',
    PERFECT: 'PERFECT', GOOD: 'PERFECT', NORMAL: 'PERFECT',
    // 한글 입력
    '덥다': 'HOT', '너무더움': 'HOT', '더움': 'HOT',
    '춥다': 'COLD', '너무추움': 'COLD', '추움': 'COLD',
    '적당': 'PERFECT', '딱좋음': 'PERFECT',
  };
  const dbFeedback = FEEDBACK_NORM_MAP[String(feedback).toUpperCase()]
                  || FEEDBACK_NORM_MAP[String(feedback)]
                  || 'PERFECT';

  const WEATHER_CODE_MAP = {
    '맑음': 'CLEAR', '흐림': 'CLOUDY', '구름많음': 'PARTLY_CLOUDY',
    '비': 'RAIN', '눈': 'SNOW', '안개': 'FOG',
  };
  const mappedCondition = WEATHER_CODE_MAP[weather_condition] || weather_condition;

  try {
    // DDL: feedback VARCHAR(20) — HOT / COLD / PERFECT (영어 대문자)
    // actual_temp → temperature 컬럼
    await pool.execute(
      `INSERT INTO temperature_feedback
         (customer_id, anonymous_id, feedback, temperature, feels_like_temp,
          humidity, wind_speed, weather_condition, feedback_date, region_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?)`,
      [partnerCustId, anonymous_id || null, dbFeedback, actual_temp, feels_like_temp,
       humidity, wind_speed, mappedCondition, region_name ?? null]
    );

    sendToKafka({
      event_type:        'feedback',
      customer_id:       partnerCustId,
      feedback:          dbFeedback,
      temperature:       actual_temp,
      feels_like_temp,
      humidity,
      wind_speed,
      weather_condition: mappedCondition,
    }).catch(() => {});
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
  // action 또는 event_type 둘 다 수용 → 소문자 통일 (확정 event_type 목록: page_view / login / ...)
  const dbEventType = (event_type || action || 'page_view').toLowerCase();
  try {
    const custId = customer_id ? await getPartnerCustomerId(customer_id) : null;

    // Kafka 전송 — fire-and-forget (실패해도 DB 저장은 계속)
    sendToKafka({
      event_type:   dbEventType,
      customer_id:  custId,
      page_url:     page_url ?? null,
      item_id:      item_id ?? null,
      duration:     duration ?? null,
      scroll_depth: scroll_depth ?? null,
    }).catch(e => console.warn('[Kafka behavior]', e.message));

    // DB 항상 직접 저장 (Kafka Consumer 없어도 데이터 보장)
    // DDL: timestamp DATETIME + created_at DATETIME 둘 다 설정
    await pool.execute(
      `INSERT INTO behavior_log
         (customer_id, event_type, page_url, item_id, duration, scroll_depth, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
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
    // DDL: raw_message NOT NULL, processed_at NOT NULL, created_at NOT NULL
    const { topic, partition_no, offset_value, data_type, raw_message, raw_data, customer_id, consumer_group } = req.body;
    const rawMsg = raw_message ?? (raw_data ? JSON.stringify(raw_data) : '{}');
    await pool.execute(
      `INSERT INTO process_success_log
         (topic, partition_no, offset_value, data_type, raw_message, customer_id, consumer_group, processed_at, created_at)
       VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
      [topic, partition_no ?? null, offset_value ?? null, data_type ?? null,
       rawMsg, customer_id ?? null, consumer_group ?? null]
    );
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

app.post('/api/logs/fail', async (req, res) => {
  try {
    // DDL: raw_message NOT NULL, processed_at NOT NULL, created_at NOT NULL
    const {
      topic, partition_no, offset_value, raw_message, raw_data,
      fail_reason, fail_type, customer_id, retry_count, consumer_group,
    } = req.body;
    const rawMsg = raw_message ?? (raw_data ? JSON.stringify(raw_data) : '{}');
    await pool.execute(
      `INSERT INTO process_fail_log
         (topic, partition_no, offset_value, raw_message,
          fail_reason, fail_type, customer_id, retry_count, consumer_group, processed_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [topic, partition_no ?? null, offset_value ?? null, rawMsg,
       fail_reason ?? null, fail_type ?? null, customer_id ?? null,
       retry_count ?? 0, consumer_group ?? null]
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
      `SELECT pu.id, pu.customer_id, pu.product_id, pu.size, pu.status,
              pu.purchased_at, pu.created_at,
              COALESCE(NULLIF(pu.price, 0), p.price) AS price,
              p.product_name, p.brand, p.image_url
       FROM purchase pu
       LEFT JOIN product p ON pu.product_id = p.id
       WHERE pu.customer_id = ? ORDER BY pu.purchased_at IS NULL ASC, pu.purchased_at DESC, pu.id DESC`,
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

// 상품 재고 상태 수정  PATCH /api/admin/products/:id
app.patch('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const inStock = req.body.in_stock ? 1 : 0;
    await pool.execute('UPDATE product SET in_stock = ? WHERE id = ?', [inStock, req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '상품 수정 실패' }); }
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
    // DDL: coupon_name, code, type(PERCENT/AMOUNT), min_order_amount, max_discount_amount, expired_at
    const {
      coupon_name, name, code,
      type, discount_type,
      discount_value,
      min_order_amount, min_order_amt,
      max_discount_amount, max_discount,
      expired_at, valid_until,
    } = req.body;
    const dbName     = coupon_name || name || null;
    const dbType     = (type || discount_type || 'PERCENT').toUpperCase();  // PERCENT / AMOUNT
    const dbMinOrder = min_order_amount ?? min_order_amt ?? 0;
    const dbMaxDisc  = max_discount_amount ?? max_discount ?? null;
    const dbExpired  = expired_at || valid_until || null;

    await pool.execute(
      `INSERT INTO coupon
         (coupon_name, code, type, discount_value,
          min_order_amount, max_discount_amount, expired_at, status, created_at)
       VALUES (?,?,?,?,?,?,?,'ACTIVE',NOW())`,
      [dbName, code ? code.toUpperCase() : null, dbType, discount_value,
       dbMinOrder, dbMaxDisc, dbExpired]
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
