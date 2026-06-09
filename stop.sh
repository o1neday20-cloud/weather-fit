#!/bin/bash
# WeatherFit 서비스 종료 스크립트

echo "========================================"
echo "  WeatherFit 서비스 종료"
echo "========================================"

# ── 백엔드 (pm2) ─────────────────────────────
echo ""
echo "[1/2] 백엔드 서버 종료 중..."

if pm2 describe weatherfit-api > /dev/null 2>&1; then
  pm2 stop weatherfit-api
  echo "  ✅ 백엔드 종료 완료 (weatherfit-api)"
else
  echo "  ℹ️  백엔드가 실행 중이 아닙니다."
fi

# ── 프론트엔드 (nginx) ───────────────────────
echo ""
echo "[2/2] nginx 종료 중..."

if pgrep -x nginx > /dev/null 2>&1; then
  sudo nginx -s stop
  if [ $? -eq 0 ]; then
    echo "  ✅ nginx 종료 완료"
  else
    echo "  ❌ nginx 종료 실패 — 강제 종료 시도"
    sudo pkill -x nginx || true
  fi
else
  echo "  ℹ️  nginx가 실행 중이 아닙니다."
fi

echo ""
echo "========================================"
echo "  모든 서비스가 종료되었습니다."
echo "========================================"
