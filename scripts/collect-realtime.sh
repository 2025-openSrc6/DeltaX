#!/bin/bash

# 실시간 차트 데이터 수집 스크립트
# 5초마다 Binance에서 가격을 조회하여 데이터베이스에 저장합니다

echo "🚀 Starting real-time data collection (5-second interval)..."
echo "Press Ctrl+C to stop"
echo ""

count=0

while true; do
  count=$((count + 1))
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Collecting data (#$count)..."
  
  response=$(curl -s -X POST http://localhost:3000/api/chart/collect)
  
  if echo "$response" | grep -q '"success":true'; then
    echo "✅ Data collected successfully"
  else
    echo "❌ Failed to collect data"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
  fi
  
  echo ""
  sleep 5
done
