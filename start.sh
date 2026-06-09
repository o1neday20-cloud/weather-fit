#!/bin/bash
# WeatherFit 서비스 시작 스크립트
set -e

echo "========================================"
echo "  WeatherFit 서비스 시작"
echo "========================================"

# ── 로그 디렉토리 생성 ────────────────────────
mkdir -p /home/ubuntu/logs
chmod 755 /home/ubuntu/logs

# ── pm2-logrotate 설정 ───────────────────────
pm2 install pm2-logrotate > /dev/null 2>&1 || true
pm2 set pm2-logrotate:max_size 500M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD
pm2 set pm2-logrotate:rotateInterval "0 0 * * *"

# ── 백엔드 (pm2) ─────────────────────────────
echo ""
echo "[1/2] 백엔드 서버 시작 중..."

if pm2 describe weatherfit-api > /dev/null 2>&1; then
  pm2 restart weatherfit-api
  echo "  ✅ 백엔드 재시작 완료 (weatherfit-api)"
else
  pm2 start /home/ubuntu/weather-fit/ecosystem.config.js
  echo "  ✅ 백엔드 시작 완료 (weatherfit-api)"
fi

# ── 프론트엔드 (nginx) ───────────────────────
echo ""
echo "[2/2] nginx 시작 중..."

if pgrep -x nginx > /dev/null 2>&1; then
  echo "  ℹ️  nginx가 이미 실행 중입니다."
else
  sudo nginx
  if [ $? -eq 0 ]; then
    echo "  ✅ nginx 시작 완료"
  else
    echo "  ❌ nginx 시작 실패"
    exit 1
  fi
fi

echo ""
echo "========================================"
echo "  모든 서비스가 시작되었습니다."
echo "========================================"
pm2 list
