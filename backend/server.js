/**
 * WeatherFit 백엔드 API v3
 * 추가: 회원가입/로그인, 쿠폰, 찜(wishlist) API
 * 설치: npm install express mysql2 cors dotenv multer bcryptjs kafkajs
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

// ── 팀원 서버 2 Fluentd 전송 ──────────────────────────────────
const FLUENTD_URL = process.env.FLUENTD_URL || 'http://210.104.76.135:9880/weatherfit.logs';

async function sendToFluentd(eventData) {
  try {
    await axios.post(
      FLUENTD_URL,
      {
        event_type: eventData.event_type,
        customer_id: eventData.customer_id || null,
        timestamp: new Date().toISOString(),
        ...eventData,
      },
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

/**
 * Kafka로 메시지 전송 (실패 시 직접 DB 저장으로 폴백)
 * @param {string} topic  - 'weatherfit.behavior' 등
 * @param {object} data   - 전송할 JSON 데이터
 */
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
  return false; // 폴백 필요
}

// 종료 시 Producer 연결 해제
process.on('SIGTERM', async () => { if (kafkaReady) await producer.disconnect(); });
process.on('SIGINT',  async () => { if (kafkaReady) await producer.disconnect(); process.exit(0); });


const app = express();
app.use(cors());
app.use(express.json());

// ── 옷장 이미지 폴더 ──
const WARDROBE_IMG_DIR = path.resolve(__dirname, '../public/images/wardrobe');
if (!fs.existsSync(WARDROBE_IMG_DIR)) fs.mkdirSync(WARDROBE_IMG_DIR, { recursive: true });
app.use('/images', express.static(path.resolve(__dirname, '../public/images')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, WARDROBE_IMG_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname) || '.jpg';
    cb(null, `item_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype));
  },
});

app.post('/api/upload/wardrobe', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일 없음' });
  res.json({ success: true, imageUrl: `/images/wardrobe/${req.file.filename}` });
});

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'weather_fit',
  waitForConnections: true,
  connectionLimit:  10,
});

app.get('/health', (_, res) => res.json({ ok: true }));

// ================================================================
// AUTH — 회원가입 / 로그인
// ================================================================

// 이메일 중복 확인  GET /api/auth/check-email?email=xxx
app.get('/api/auth/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: '이메일 필요' });
  try {
    const [rows] = await pool.execute('SELECT customer_id FROM customer WHERE email=?', [email]);
    res.json({ exists: rows.length > 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: '확인 실패' }); }
});

// 회원가입  POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const {
    name, email, phone, birth_date, gender, region_id,
    password,
    agree_terms, agree_privacy, marketing_consent, push_consent, email_consent, sms_consent
  } = req.body;
  if (!email || !password || !agree_terms || !agree_privacy) {
    return res.status(400).json({ error: '필수 항목 누락 (이메일, 비밀번호, 필수 동의)' });
  }
  try {
    const [exist] = await pool.execute('SELECT customer_id FROM customer WHERE email=?', [email]);
    if (exist.length > 0) return res.status(409).json({ error: '이미 가입된 이메일입니다' });

    const customerId = 'uid_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    const hash       = await bcrypt.hash(password, 10);

    await pool.execute(
      `INSERT INTO customer
         (customer_id, name, email, phone, birth_date, gender, region_id, join_date,
          password_hash, marketing_consent, push_consent, email_consent, sms_consent,
          join_channel, join_type)
       VALUES (?,?,?,?,?,?,?,CURRENT_DATE,?,?,?,?,?,'web','self')`,
      [customerId, name||null, email, phone||null, birth_date||null,
       gender||'N', region_id||null, hash,
       marketing_consent?1:0, push_consent?1:0, email_consent?1:0, sms_consent?1:0]
    );

    // 신규 가입 쿠폰 자동 지급
    await pool.execute(
      `INSERT IGNORE INTO customer_coupon (customer_id, coupon_id) VALUES (?, 'cpn_welcome')`,
      [customerId]
    );

    const [rows] = await pool.execute('SELECT * FROM customer WHERE customer_id=?', [customerId]);
    res.json({ success: true, customer: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원가입 실패' });
  }
});

// 로그인  POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요' });
  try {
    const [rows] = await pool.execute('SELECT * FROM customer WHERE email=?', [email]);
    if (!rows.length) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const customer = rows[0];
    const ok = await bcrypt.compare(password, customer.password_hash || '');
    if (!ok) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const { password_hash, ...safe } = customer;
    res.json({ success: true, customer: safe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '로그인 실패' });
  }
});

// ================================================================
// PRODUCT
// ================================================================
app.get('/api/products', async (req, res) => {
  try {
    const { category } = req.query;
    let sql = `SELECT p.*, c.hex_code, c.display_name AS color_name
               FROM product p LEFT JOIN color_code c ON p.color_id = c.color_id
               WHERE p.in_stock = 1`;
    const params = [];
    if (category && category !== 'all') { sql += ' AND p.category = ?'; params.push(category); }
    sql += ' ORDER BY p.created_at DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '상품 조회 실패' }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.*, c.hex_code, c.display_name AS color_name
       FROM product p LEFT JOIN color_code c ON p.color_id = c.color_id
       WHERE p.product_id = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: '상품 없음' });
    // VIEW 이벤트 → Fluentd
    sendToFluentd({
      event_type: 'VIEW',
      product_id: req.params.id,
      timestamp: new Date().toISOString(),
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
    const { password_hash, ...safe } = rows[0];
    res.json(safe);
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 조회 실패' }); }
});

app.post('/api/customers', async (req, res) => {
  const { customer_id, cold_sensitivity, activity_level, preferred_style } = req.body;
  try {
    await pool.execute(
      `INSERT INTO customer (customer_id, cold_sensitivity, activity_level, preferred_style, join_date)
       VALUES (?, ?, ?, ?, CURRENT_DATE)
       ON DUPLICATE KEY UPDATE
         cold_sensitivity = VALUES(cold_sensitivity),
         activity_level   = VALUES(activity_level),
         preferred_style  = VALUES(preferred_style)`,
      [customer_id, cold_sensitivity ?? 0, activity_level ?? 'medium', preferred_style ?? 'casual']
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 생성 실패' }); }
});

// 고객 정보 수정  PATCH /api/customers/:id
app.patch('/api/customers/:id', async (req, res) => {
  const allowed = ['name','phone','birth_date','gender','region_id',
                   'cold_sensitivity','activity_level','preferred_style',
                   'marketing_consent','push_consent','email_consent','sms_consent'];
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
// ================================================================

// 쿠폰 코드 조회  GET /api/coupons/validate?code=XXXX&orderAmt=50000
app.get('/api/coupons/validate', async (req, res) => {
  const { code, orderAmt } = req.query;
  if (!code) return res.status(400).json({ error: '쿠폰 코드 필요' });
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM coupon WHERE code = ? AND is_active = 1
       AND valid_from <= CURRENT_DATE AND valid_until >= CURRENT_DATE`,
      [code.toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ error: '유효하지 않은 쿠폰 코드입니다' });
    const cpn = rows[0];
    const amt = parseInt(orderAmt) || 0;
    if (cpn.min_order_amt && amt < cpn.min_order_amt) {
      return res.status(400).json({
        error: `최소 주문금액 ${cpn.min_order_amt.toLocaleString()}원 이상에서 사용 가능합니다`
      });
    }
    // 할인액 계산
    let discountAmt;
    if (cpn.discount_type === 'amount') {
      discountAmt = cpn.discount_value;
    } else {
      discountAmt = Math.floor(amt * cpn.discount_value / 100);
      if (cpn.max_discount) discountAmt = Math.min(discountAmt, cpn.max_discount);
    }
    res.json({ ...cpn, discountAmt });
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 조회 실패' }); }
});

// 내 쿠폰 목록  GET /api/coupons/my/:customerId
app.get('/api/coupons/my/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT cc.*, c.code, c.name, c.discount_type, c.discount_value,
              c.min_order_amt, c.max_discount, c.valid_from, c.valid_until
       FROM customer_coupon cc
       JOIN coupon c ON cc.coupon_id = c.coupon_id
       WHERE cc.customer_id = ? AND cc.used_at IS NULL
         AND c.is_active = 1 AND c.valid_until >= CURRENT_DATE
       ORDER BY c.valid_until ASC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 목록 조회 실패' }); }
});

// ================================================================
// WISHLIST (찜)
// ================================================================

// 찜 목록 조회  GET /api/wishlist/:customerId
app.get('/api/wishlist/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT p.*, c.hex_code, c.display_name AS color_name, pu.purchase_id, pu.created_at AS wished_at
       FROM purchase pu
       JOIN product p ON pu.product_id = p.product_id
       LEFT JOIN color_code c ON p.color_id = c.color_id
       WHERE pu.customer_id = ? AND pu.status = 'wishlist'
       ORDER BY pu.created_at DESC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 목록 조회 실패' }); }
});

// 찜 추가  POST /api/wishlist
app.post('/api/wishlist', async (req, res) => {
  const { customer_id, product_id } = req.body;
  try {
    const [exist] = await pool.execute(
      `SELECT purchase_id FROM purchase WHERE customer_id=? AND product_id=? AND status='wishlist'`,
      [customer_id, product_id]
    );
    if (exist.length > 0) return res.json({ success: true, duplicate: true });
    const id = `wsh_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    await pool.execute(
      `INSERT INTO purchase (purchase_id, customer_id, product_id, status, price, purchase_date) VALUES (?,?,?,'wishlist',0,CURRENT_DATE)`,
      [id, customer_id, product_id]
    );
    // WISHLIST 이벤트 → Fluentd
    sendToFluentd({
      event_type: 'WISHLIST',
      customer_id, product_id,
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 추가 실패' }); }
});

// 찜 삭제  DELETE /api/wishlist/:customerId/:productId
app.delete('/api/wishlist/:customerId/:productId', async (req, res) => {
  try {
    await pool.execute(
      `DELETE FROM purchase WHERE customer_id=? AND product_id=? AND status='wishlist'`,
      [req.params.customerId, req.params.productId]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '찜 삭제 실패' }); }
});

// ================================================================
// WARDROBE
// ================================================================
app.get('/api/wardrobe/:customerId', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT w.*, c.hex_code, c.display_name AS color_name
       FROM wardrobe_item w LEFT JOIN color_code c ON w.color_id = c.color_id
       WHERE w.customer_id = ? ORDER BY w.registered_date DESC`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '옷장 조회 실패' }); }
});

app.post('/api/wardrobe', async (req, res) => {
  const { item_id, wardrobe_id, customer_id, category, style, color_id, warmth } = req.body;
    const itemId = item_id || wardrobe_id;
  try {
    await pool.execute(
      `INSERT INTO wardrobe_item (item_id, customer_id, category, style, color_id, warmth, registered_date)
       VALUES (?,?,?,?,?,?,CURRENT_DATE)`,
      [itemId, customer_id, category, style, color_id ?? null, warmth]
    );
    // WARDROBE 이벤트 → Fluentd
    sendToFluentd({
      event_type: 'WARDROBE',
      customer_id, category, style, warmth,
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '아이템 추가 실패' }); }
});

app.delete('/api/wardrobe/:wardrobeId', async (req, res) => {
  try {
    await pool.execute('DELETE FROM wardrobe_item WHERE item_id = ?', [req.params.wardrobeId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '아이템 삭제 실패' }); }
});

// ================================================================
// PURCHASE
// ================================================================
app.get('/api/purchase/:customerId/cart', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pu.*, p.name, p.brand, p.image_url, p.price AS list_price
       FROM purchase pu JOIN product p ON pu.product_id = p.product_id
       WHERE pu.customer_id = ? AND pu.status = 'cart'`,
      [req.params.customerId]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '장바구니 조회 실패' }); }
});

app.post('/api/purchase', async (req, res) => {
  const { purchase_id, customer_id, product_id, size, price, status, coupon_id, discount_amt } = req.body;
  try {
    if ((status || 'cart') === 'paid') {
      // 구매 완료 → Kafka weatherfit.purchase 토픽
      const sent = await sendToKafka('weatherfit.purchase', {
        purchase_id, customer_id, product_id, status: status || 'paid',
        size: size || null, price, coupon_id: coupon_id || null, discount_amt: discount_amt || 0,
      });
      if (!sent) {
        await pool.execute(
          `INSERT INTO purchase (purchase_id, customer_id, product_id, status, size, price, coupon_id, discount_amt)
           VALUES (?,?,?,?,?,?,?,?)`,
          [purchase_id, customer_id, product_id, status || 'paid', size || null, price, coupon_id || null, discount_amt || 0]
        );
      }
    } else {
      // 장바구니/위시리스트 → 직접 DB
      if ((status || 'cart') === 'cart') {
        const [existing] = await pool.execute(
          `SELECT purchase_id FROM purchase WHERE customer_id=? AND product_id=? AND size=? AND status='cart'`,
          [customer_id, product_id, size]
        );
        if (existing.length > 0) return res.json({ success: true, duplicate: true });
      }
      await pool.execute(
        `INSERT INTO purchase (purchase_id, customer_id, product_id, status, size, price, purchase_date)
         VALUES (?,?,?,?,?,?,CURRENT_DATE)`,
        [purchase_id, customer_id, product_id, status || 'cart', size || null, price || 0]
      );
      // CART 이벤트 → Fluentd
      sendToFluentd({
        event_type: 'CART',
        customer_id, product_id, size, price,
        timestamp: new Date().toISOString(),
      });
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '장바구니 추가 실패' }); }
});

app.patch('/api/purchase/:purchaseId/status', async (req, res) => {
  const { status } = req.body;
  try {
    await pool.execute('UPDATE purchase SET status=? WHERE purchase_id=?', [status, req.params.purchaseId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '상태 변경 실패' }); }
});

// ================================================================
// TEMPERATURE FEEDBACK
// ================================================================
app.post('/api/feedback', async (req, res) => {
  const { feedback_id, customer_id, region_id, actual_temp, feels_like_temp,
          humidity, wind_speed, weather_condition, recommended_outfit, feedback } = req.body;
  try {
    const fid = feedback_id || `fb_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    await pool.execute(
      `INSERT INTO temperature_feedback
         (feedback_id, customer_id, region_id, actual_temp, feels_like_temp,
          humidity, wind_speed, weather_condition, recommended_outfit, feedback, feedback_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_DATE)`,
      [fid, customer_id, region_id ?? null, actual_temp, feels_like_temp,
       humidity, wind_speed, weather_condition, JSON.stringify(recommended_outfit ?? []), feedback]
    );
    // FEEDBACK 이벤트 → Fluentd
    sendToFluentd({
      event_type: 'FEEDBACK',
      customer_id,
      actual_temp, feels_like_temp,
      humidity, wind_speed,
      weather_condition,
      feedback,
      feedback_date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '피드백 저장 실패' }); }
});

// ================================================================
// BEHAVIOR LOG
// ================================================================
app.post('/api/logs/behavior', async (req, res) => {
  const { customer_id, action, page_url, item_id, duration, scroll_depth } = req.body;
  try {
    // Kafka로 전송 시도
    const sent = await sendToKafka('weatherfit.behavior', {
      customer_id: customer_id ?? null, action, page_url: page_url ?? null,
      item_id: item_id ?? null, duration: duration ?? null, scroll_depth: scroll_depth ?? null,
    });
    // Kafka 미연결 시 직접 DB 저장 (폴백)
    if (!sent) {
      await pool.execute(
        `INSERT INTO behavior_log (customer_id, action, page_url, item_id, duration, scroll_depth)
         VALUES (?,?,?,?,?,?)`,
        [customer_id ?? null, action, page_url ?? null, item_id ?? null, duration ?? null, scroll_depth ?? null]
      );
    }
    res.json({ success: true, via: sent ? 'kafka' : 'direct' });
  } catch (err) { console.error(err); res.status(500).json({ error: '로그 저장 실패' }); }
});

app.post('/api/logs/success', async (req, res) => {
  const { topic, partition_no, offset_value, data_type, raw_data, customer_id, consumer_group } = req.body;
  try {
    await pool.execute(
      `INSERT INTO process_success_log (topic, partition_no, offset_value, data_type, raw_data, customer_id, consumer_group)
       VALUES (?,?,?,?,?,?,?)`,
      [topic, partition_no, offset_value, data_type, JSON.stringify(raw_data), customer_id??null, consumer_group]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '성공 로그 저장 실패' }); }
});

app.post('/api/logs/fail', async (req, res) => {
  const { topic, partition_no, offset_value, raw_data, fail_reason, fail_type, customer_id, retry_count, consumer_group } = req.body;
  try {
    await pool.execute(
      `INSERT INTO process_fail_log (topic, partition_no, offset_value, raw_data, fail_reason, fail_type, customer_id, retry_count, consumer_group)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [topic, partition_no, offset_value, JSON.stringify(raw_data), fail_reason, fail_type, customer_id??null, retry_count??0, consumer_group]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '실패 로그 저장 실패' }); }
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
  } catch (err) { console.error(err); res.status(500).json({ error: '지역 조회 실패' }); }
});

app.listen(4000, () => console.log('✅ WeatherFit API v3 실행 중: http://localhost:4000'));

// ================================================================
// ADMIN API — 관리자 전용 (prefix: /api/admin)
// ================================================================

// 간단한 관리자 인증 미들웨어 (토큰 방식)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'weatherfit-admin-2026';
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.adminToken;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '관리자 인증 필요' });
  next();
}

// ── 대시보드 통계 ─────────────────────────────────────────────
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const [[customers]]   = await pool.execute('SELECT COUNT(*) as cnt FROM customer');
    const [[purchases]]   = await pool.execute("SELECT COUNT(*) as cnt FROM purchase WHERE status='paid'");
    const [[wishlist]]    = await pool.execute("SELECT COUNT(*) as cnt FROM purchase WHERE status='wishlist'");
    const [[feedbacks]]   = await pool.execute('SELECT COUNT(*) as cnt FROM temperature_feedback');
    const [[couponsUsed]] = await pool.execute('SELECT COUNT(*) as cnt FROM customer_coupon WHERE used_at IS NOT NULL');
    const [[revenue]]     = await pool.execute("SELECT COALESCE(SUM(price - discount_amt),0) as total FROM purchase WHERE status='paid'");
    res.json({
      totalCustomers: customers.cnt,
      totalPurchases: purchases.cnt,
      totalWishlist:  wishlist.cnt,
      totalFeedbacks: feedbacks.cnt,
      couponsUsed:    couponsUsed.cnt,
      totalRevenue:   revenue.total,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: '통계 조회 실패' }); }
});

// ── 매출 시계열 ───────────────────────────────────────────────
app.get('/api/admin/revenue', adminAuth, async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    const groupBy = period === 'yearly'  ? "DATE_FORMAT(purchase_date,'%Y')"
                  : period === 'monthly' ? "DATE_FORMAT(purchase_date,'%Y-%m')"
                  : period === 'weekly'  ? "YEARWEEK(purchase_date,1)"
                  :                        "DATE_FORMAT(purchase_date,'%Y-%m-%d')";
    const [rows] = await pool.execute(
      `SELECT ${groupBy} as label,
              SUM(price - discount_amt) as revenue,
              COUNT(*) as count
       FROM purchase WHERE status='paid'
       GROUP BY label ORDER BY label DESC LIMIT 30`
    );
    res.json(rows.reverse());
  } catch (err) { console.error(err); res.status(500).json({ error: '매출 조회 실패' }); }
});

// ── 고객 목록 ─────────────────────────────────────────────────
app.get('/api/admin/customers', adminAuth, async (req, res) => {
  try {
    const { search = '', gender, membership } = req.query;
    let sql = `SELECT c.*, r.full_name as region_name
               FROM customer c LEFT JOIN region r ON c.region_id = r.region_id
               WHERE 1=1`;
    const params = [];
    if (search) { sql += ' AND (c.name LIKE ? OR c.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (gender) { sql += ' AND c.gender = ?'; params.push(gender); }
    if (membership) { sql += ' AND c.membership_level = ?'; params.push(membership); }
    sql += ' ORDER BY c.created_at DESC';
    const [rows] = await pool.execute(sql, params);
    res.json(rows.map(({ password_hash, ...r }) => r));
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 조회 실패' }); }
});

// ── 고객 상세 (구매/찜/피드백 포함) ─────────────────────────
app.get('/api/admin/customers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [[customer]] = await pool.execute(
      `SELECT c.*, r.full_name as region_name FROM customer c
       LEFT JOIN region r ON c.region_id = r.region_id
       WHERE c.customer_id = ?`, [id]
    );
    if (!customer) return res.status(404).json({ error: '고객 없음' });
    const [purchases]  = await pool.execute(
      `SELECT pu.*, p.name as product_name, p.brand, p.image_url
       FROM purchase pu LEFT JOIN product p ON pu.product_id = p.product_id
       WHERE pu.customer_id = ? ORDER BY pu.created_at DESC`, [id]
    );
    const [feedbacks]  = await pool.execute(
      'SELECT * FROM temperature_feedback WHERE customer_id = ? ORDER BY feedback_date DESC LIMIT 20', [id]
    );
    const [wardrobe]   = await pool.execute(
      `SELECT w.*, c.display_name as color_name, c.hex_code
       FROM wardrobe_item w LEFT JOIN color_code c ON w.color_id = c.color_id
       WHERE w.customer_id = ?`, [id]
    );
    const { password_hash, ...safeCustomer } = customer;
    res.json({ customer: safeCustomer, purchases, feedbacks, wardrobe });
  } catch (err) { console.error(err); res.status(500).json({ error: '고객 상세 조회 실패' }); }
});

// ── 고객 등급 변경 ────────────────────────────────────────────
app.patch('/api/admin/customers/:id/membership', adminAuth, async (req, res) => {
  const { membership_level } = req.body;
  try {
    await pool.execute('UPDATE customer SET membership_level=? WHERE customer_id=?', [membership_level, req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '등급 변경 실패' }); }
});

// ── 쿠폰 목록 ─────────────────────────────────────────────────
app.get('/api/admin/coupons', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT c.*,
         (SELECT COUNT(*) FROM customer_coupon cc WHERE cc.coupon_id=c.coupon_id) as issued_count,
         (SELECT COUNT(*) FROM customer_coupon cc WHERE cc.coupon_id=c.coupon_id AND cc.used_at IS NOT NULL) as used_count
       FROM coupon c ORDER BY c.created_at DESC`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 조회 실패' }); }
});

// ── 쿠폰 생성 ─────────────────────────────────────────────────
app.post('/api/admin/coupons', adminAuth, async (req, res) => {
  const { name, code, discount_type, discount_value, min_order_amt, max_discount, valid_from, valid_until } = req.body;
  try {
    const couponId = 'cpn_' + Date.now();
    await pool.execute(
      `INSERT INTO coupon (coupon_id, code, name, discount_type, discount_value, min_order_amt, max_discount, valid_from, valid_until)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [couponId, code.toUpperCase(), name, discount_type, discount_value, min_order_amt||0, max_discount||null, valid_from, valid_until]
    );
    res.json({ success: true, coupon_id: couponId });
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 생성 실패' }); }
});

// ── 쿠폰 수정/비활성화 ────────────────────────────────────────
app.patch('/api/admin/coupons/:id', adminAuth, async (req, res) => {
  const { is_active, name, valid_until } = req.body;
  try {
    const sets = []; const params = [];
    if (is_active !== undefined) { sets.push('is_active=?'); params.push(is_active); }
    if (name)        { sets.push('name=?');        params.push(name); }
    if (valid_until) { sets.push('valid_until=?'); params.push(valid_until); }
    if (!sets.length) return res.status(400).json({ error: '변경할 필드 없음' });
    await pool.execute(`UPDATE coupon SET ${sets.join(',')} WHERE coupon_id=?`, [...params, req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 수정 실패' }); }
});

// ── 쿠폰 고객에게 발급 ────────────────────────────────────────
app.post('/api/admin/coupons/:id/issue', adminAuth, async (req, res) => {
  const { customer_ids } = req.body; // 배열
  try {
    for (const cid of customer_ids) {
      await pool.execute(
        'INSERT IGNORE INTO customer_coupon (customer_id, coupon_id) VALUES (?,?)',
        [cid, req.params.id]
      );
    }
    res.json({ success: true, issued: customer_ids.length });
  } catch (err) { console.error(err); res.status(500).json({ error: '쿠폰 발급 실패' }); }
});

// ── 행동 로그 ─────────────────────────────────────────────────
app.get('/api/admin/logs/behavior', adminAuth, async (req, res) => {
  try {
    const { customer_id, action, limit = 100 } = req.query;
    let sql = `SELECT b.*, c.name as customer_name
               FROM behavior_log b LEFT JOIN customer c ON b.customer_id = c.customer_id
               WHERE 1=1`;
    const params = [];
    if (customer_id) { sql += ' AND b.customer_id=?'; params.push(customer_id); }
    if (action)      { sql += ' AND b.action=?';      params.push(action); }
    sql += ` ORDER BY b.timestamp DESC LIMIT ${parseInt(limit)}`;
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '로그 조회 실패' }); }
});

// ── 피드백 분석 ───────────────────────────────────────────────
app.get('/api/admin/feedback/stats', adminAuth, async (req, res) => {
  try {
    const [byType] = await pool.execute(
      `SELECT feedback, COUNT(*) as count FROM temperature_feedback GROUP BY feedback`
    );
    const [byRegion] = await pool.execute(
      `SELECT r.city, tf.feedback, COUNT(*) as count
       FROM temperature_feedback tf LEFT JOIN region r ON tf.region_id = r.region_id
       GROUP BY r.city, tf.feedback ORDER BY count DESC`
    );
    const [avgTemp] = await pool.execute(
      `SELECT feedback, AVG(actual_temp) as avg_temp, AVG(feels_like_temp) as avg_feels
       FROM temperature_feedback GROUP BY feedback`
    );
    res.json({ byType, byRegion, avgTemp });
  } catch (err) { console.error(err); res.status(500).json({ error: '피드백 통계 실패' }); }
});

// ── 구매 분석 ─────────────────────────────────────────────────
app.get('/api/admin/purchase/stats', adminAuth, async (req, res) => {
  try {
    const [byStatus] = await pool.execute(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(price-discount_amt),0) as revenue
       FROM purchase GROUP BY status`
    );
    const [topProducts] = await pool.execute(
      `SELECT p.name, p.brand, p.category, COUNT(*) as count, SUM(pu.price) as revenue
       FROM purchase pu JOIN product p ON pu.product_id = p.product_id
       WHERE pu.status='paid'
       GROUP BY pu.product_id ORDER BY count DESC LIMIT 10`
    );
    res.json({ byStatus, topProducts });
  } catch (err) { console.error(err); res.status(500).json({ error: '구매 통계 실패' }); }
});

// ── 스타일 선호도 분석 ────────────────────────────────────────
app.get('/api/admin/stats/styles', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT preferred_style, activity_level, cold_sensitivity, COUNT(*) as count
       FROM customer GROUP BY preferred_style, activity_level, cold_sensitivity`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: '스타일 통계 실패' }); }
});
