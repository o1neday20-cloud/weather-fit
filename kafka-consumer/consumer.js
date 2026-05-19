/**
 * WeatherFit Kafka Consumer
 * ─────────────────────────────────────────────────────────────
 * 토픽별로 메시지를 소비하여 MySQL에 저장합니다.
 *
 * 토픽 목록:
 *   weatherfit.behavior  → behavior_log 테이블
 *   weatherfit.purchase  → purchase 테이블
 *   weatherfit.feedback  → temperature_feedback 테이블
 *   weatherfit.wardrobe  → wardrobe_item 테이블
 *   weatherfit.wishlist  → purchase 테이블 (status=wishlist)
 *   weatherfit.etc       → behavior_log 테이블 (기타)
 */

require('dotenv').config();
const { Kafka, logLevel } = require('kafkajs');
const mysql = require('mysql2/promise');

// ── 설정 ──────────────────────────────────────────────────────
const KAFKA_BROKER    = process.env.KAFKA_BROKER    || 'localhost:29092';
const CONSUMER_GROUP  = process.env.CONSUMER_GROUP  || 'weatherfit-consumer-group';
const DB_HOST         = process.env.DB_HOST         || 'localhost';
const DB_USER         = process.env.DB_USER         || 'root';
const DB_PASSWORD     = process.env.DB_PASSWORD     || '';
const DB_NAME         = process.env.DB_NAME         || 'weather_fit';

const TOPICS = [
  'weatherfit.behavior',
  'weatherfit.purchase',
  'weatherfit.feedback',
  'weatherfit.wardrobe',
  'weatherfit.wishlist',
  'weatherfit.etc',
];

// ── DB 연결 ───────────────────────────────────────────────────
let pool;
async function getDB() {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST, user: DB_USER,
      password: DB_PASSWORD, database: DB_NAME,
      waitForConnections: true, connectionLimit: 10,
    });
  }
  return pool;
}

// ── Kafka 클라이언트 ──────────────────────────────────────────
const kafka = new Kafka({
  clientId: 'weatherfit-consumer',
  brokers: [KAFKA_BROKER],
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

const consumer = kafka.consumer({ groupId: CONSUMER_GROUP });

// ── 성공 로그 저장 ────────────────────────────────────────────
async function logSuccess(db, { topic, partition, offset, dataType, rawData, customerId }) {
  try {
    await db.execute(
      `INSERT INTO process_success_log
         (topic, partition_no, offset_value, data_type, raw_data, customer_id, consumer_group)
       VALUES (?,?,?,?,?,?,?)`,
      [topic, partition, offset, dataType, JSON.stringify(rawData), customerId || null, CONSUMER_GROUP]
    );
  } catch (e) {
    console.warn('[Consumer] 성공 로그 저장 실패:', e.message);
  }
}

// ── 실패 로그 저장 ────────────────────────────────────────────
async function logFail(db, { topic, partition, offset, rawData, reason, type, customerId, retryCount = 0 }) {
  try {
    await db.execute(
      `INSERT INTO process_fail_log
         (topic, partition_no, offset_value, raw_data, fail_reason, fail_type, customer_id, retry_count, consumer_group)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [topic, partition, offset, JSON.stringify(rawData), reason, type, customerId || null, retryCount, CONSUMER_GROUP]
    );
  } catch (e) {
    console.warn('[Consumer] 실패 로그 저장 실패:', e.message);
  }
}

// ── 토픽별 처리 함수 ──────────────────────────────────────────

/** weatherfit.behavior → behavior_log */
async function processBehavior(db, data, meta) {
  const { customer_id, action, page_url, item_id, duration, scroll_depth } = data;

  // 유효성 검사
  const validActions = ['page_view','product_view','add_to_cart','purchase',
    'outfit_view','feedback','search','wardrobe_add','wishlist_add','wishlist_remove','coupon_apply'];
  if (!action || !validActions.includes(action)) {
    throw { type: 'validation', reason: `유효하지 않은 action: ${action}` };
  }

  await db.execute(
    `INSERT INTO behavior_log (customer_id, action, page_url, item_id, duration, scroll_depth)
     VALUES (?,?,?,?,?,?)`,
    [customer_id || null, action, page_url || null, item_id || null, duration || null, scroll_depth || null]
  );
  await logSuccess(db, { ...meta, dataType: 'behavior', rawData: data, customerId: customer_id });
}

/** weatherfit.purchase → purchase */
async function processPurchase(db, data, meta) {
  const { purchase_id, customer_id, product_id, status, size, price, coupon_id, discount_amt } = data;

  if (!purchase_id || !customer_id || !product_id) {
    throw { type: 'validation', reason: 'purchase_id/customer_id/product_id 필수' };
  }

  await db.execute(
    `INSERT IGNORE INTO purchase
       (purchase_id, customer_id, product_id, status, size, price, coupon_id, discount_amt)
     VALUES (?,?,?,?,?,?,?,?)`,
    [purchase_id, customer_id, product_id, status || 'paid',
     size || null, price || 0, coupon_id || null, discount_amt || 0]
  );
  await logSuccess(db, { ...meta, dataType: 'purchase', rawData: data, customerId: customer_id });
}

/** weatherfit.feedback → temperature_feedback */
async function processFeedback(db, data, meta) {
  const { feedback_id, customer_id, region_id, actual_temp, feels_like_temp,
          humidity, wind_speed, weather_condition, recommended_outfit, feedback } = data;

  const validFeedbacks = ['너무추움','춥다','적당','덥다','너무더움'];
  if (!feedback || !validFeedbacks.includes(feedback)) {
    throw { type: 'validation', reason: `유효하지 않은 feedback: ${feedback}` };
  }

  const fid = feedback_id || `fb_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  await db.execute(
    `INSERT IGNORE INTO temperature_feedback
       (feedback_id, customer_id, region_id, actual_temp, feels_like_temp,
        humidity, wind_speed, weather_condition, recommended_outfit, feedback)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [fid, customer_id, region_id || null, actual_temp, feels_like_temp,
     humidity || null, wind_speed || null, weather_condition || null,
     JSON.stringify(recommended_outfit || []), feedback]
  );
  await logSuccess(db, { ...meta, dataType: 'feedback', rawData: data, customerId: customer_id });
}

/** weatherfit.wardrobe → wardrobe_item */
async function processWardrobe(db, data, meta) {
  const { wardrobe_id, customer_id, category, style, color_id, warmth } = data;

  if (!wardrobe_id || !customer_id || !category || !style || !warmth) {
    throw { type: 'validation', reason: 'wardrobe 필수 필드 누락' };
  }

  await db.execute(
    `INSERT IGNORE INTO wardrobe_item (wardrobe_id, customer_id, category, style, color_id, warmth)
     VALUES (?,?,?,?,?,?)`,
    [wardrobe_id, customer_id, category, style, color_id || null, warmth]
  );
  await logSuccess(db, { ...meta, dataType: 'wardrobe', rawData: data, customerId: customer_id });
}

/** weatherfit.wishlist → purchase (status=wishlist) */
async function processWishlist(db, data, meta) {
  const { customer_id, product_id, action } = data;

  if (!customer_id || !product_id) {
    throw { type: 'validation', reason: 'customer_id/product_id 필수' };
  }

  if (action === 'remove') {
    await db.execute(
      `DELETE FROM purchase WHERE customer_id=? AND product_id=? AND status='wishlist'`,
      [customer_id, product_id]
    );
  } else {
    const wid = `wsh_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    await db.execute(
      `INSERT IGNORE INTO purchase (purchase_id, customer_id, product_id, status) VALUES (?,?,?,'wishlist')`,
      [wid, customer_id, product_id]
    );
  }
  await logSuccess(db, { ...meta, dataType: 'wishlist', rawData: data, customerId: customer_id });
}

// ── 메시지 라우터 ─────────────────────────────────────────────
async function handleMessage({ topic, partition, message }) {
  const db = await getDB();
  const offset = message.offset;
  let rawData = {};

  try {
    const raw = message.value?.toString();
    if (!raw) return;
    rawData = JSON.parse(raw);

    console.log(`[Consumer] ← ${topic} [${partition}:${offset}]`, JSON.stringify(rawData).slice(0, 100));

    switch (topic) {
      case 'weatherfit.behavior':
        await processBehavior(db, rawData, { topic, partition, offset });
        break;
      case 'weatherfit.purchase':
        await processPurchase(db, rawData, { topic, partition, offset });
        break;
      case 'weatherfit.feedback':
        await processFeedback(db, rawData, { topic, partition, offset });
        break;
      case 'weatherfit.wardrobe':
        await processWardrobe(db, rawData, { topic, partition, offset });
        break;
      case 'weatherfit.wishlist':
        await processWishlist(db, rawData, { topic, partition, offset });
        break;
      default:
        // weatherfit.etc — behavior_log에 기타로 저장
        await db.execute(
          'INSERT INTO behavior_log (customer_id, action, page_url) VALUES (?,?,?)',
          [rawData.customer_id || null, 'page_view', rawData.page_url || null]
        );
        await logSuccess(db, { topic, partition, offset, dataType: 'behavior', rawData, customerId: rawData.customer_id });
    }

    console.log(`[Consumer] ✅ 처리 완료: ${topic} offset=${offset}`);

  } catch (err) {
    const failType = err.type || (err.code?.startsWith('ER_') ? 'db_error' : 'unknown');
    const reason   = err.reason || err.message || '알 수 없는 오류';
    console.error(`[Consumer] ❌ 처리 실패: ${topic} offset=${offset} — ${reason}`);
    await logFail(db, {
      topic, partition, offset, rawData,
      reason, type: failType,
      customerId: rawData?.customer_id,
    });
  }
}

// ── 메인 실행 ─────────────────────────────────────────────────
async function run() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  WeatherFit Kafka Consumer 시작');
  console.log(`  Broker : ${KAFKA_BROKER}`);
  console.log(`  Group  : ${CONSUMER_GROUP}`);
  console.log(`  DB     : ${DB_USER}@${DB_HOST}/${DB_NAME}`);
  console.log(`  Topics : ${TOPICS.join(', ')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // DB 연결 확인
  try {
    const db = await getDB();
    await db.execute('SELECT 1');
    console.log('[Consumer] ✅ DB 연결 성공');
  } catch (e) {
    console.error('[Consumer] ❌ DB 연결 실패:', e.message);
    process.exit(1);
  }

  // Kafka 연결 + 토픽 구독
  await consumer.connect();
  console.log('[Consumer] ✅ Kafka 연결 성공');

  await consumer.subscribe({ topics: TOPICS, fromBeginning: false });
  console.log('[Consumer] ✅ 토픽 구독 완료');

  await consumer.run({
    eachMessage: handleMessage,
  });
}

// ── 종료 시그널 처리 ─────────────────────────────────────────
const shutdown = async () => {
  console.log('\n[Consumer] 종료 중...');
  await consumer.disconnect();
  if (pool) await pool.end();
  console.log('[Consumer] 종료 완료');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

run().catch(async (err) => {
  console.error('[Consumer] 치명적 오류:', err);
  await consumer.disconnect().catch(() => {});
  process.exit(1);
});
