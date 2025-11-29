```
import { 
  PAXGPriceChart, 
  BTCPriceChart, 
  VolatilityChart, 
  VolatilityCandlestickChart 
} from '@/components/charts';

/**
 * 실시간 차트 데모 페이지
 * 
 * 5초마다 자동 업데이트되는 차트를 표시합니다.
 */
export default function ChartDemoPage() {
  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="mx-auto max-w-7xl">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">실시간 차트 (5초 업데이트)</h1>
          <p className="mt-2 text-gray-400">
            PAXG와 BTC의 실시간 가격 및 변동성을 5초마다 업데이트합니다. (500개 데이터 포인트)
          </p>
        </div>

        {/* 핵심: 변동성 캔들스틱 차트 (전체 폭) */}
        <div className="mb-8 rounded-lg bg-gray-800 p-6">
          <div className="mb-2 text-sm text-yellow-400 font-semibold">⭐ 프로젝트 핵심 차트</div>
          <VolatilityCandlestickChart 
            asset="PAXG" 
            height={400} 
            period="1h" 
            theme="dark" 
            refreshInterval={10000}
          />
        </div>

        {/* 3개 차트 그리드 */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* PAXG 차트 */}
          <div className="rounded-lg bg-gray-800 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">금 시세 (PAXG)</h2>
            <PAXGPriceChart height={300} period="1h" theme="dark" />
          </div>

          {/* BTC 차트 */}
          <div className="rounded-lg bg-gray-800 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">비트코인 시세 (BTC)</h2>
            <BTCPriceChart height={300} period="1h" theme="dark" />
          </div>

          {/* BTC 변동성 캔들스틱 */}
          <div className="rounded-lg bg-gray-800 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">BTC 변동성</h2>
            <VolatilityCandlestickChart 
              asset="BTC" 
              height={300} 
              period="1h" 
              theme="dark"
              refreshInterval={10000}
            />
          </div>
        </div>

        {/* 정보 */}
        <div className="mt-8 rounded-lg bg-gray-800 p-6">
          <h2 className="mb-2 text-lg font-semibold text-white">📊 실시간 업데이트</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
            <li>차트는 10초마다 자동으로 업데이트됩니다</li>
            <li>백그라운드에서 5초마다 새로운 데이터를 수집하고 있습니다</li>
            <li>Binance API에서 최대 500개의 데이터 포인트를 가져옵니다 (촘촘한 차트)</li>
            <li><strong>변동성 캔들스틱 차트</strong>는 변동성의 변동성을 양봉/음봉으로 표현합니다</li>
            <li className="text-green-400">📈 양봉(초록): 변동성 증가 → 시장 불안정</li>
            <li className="text-red-400">📉 음봉(빨강): 변동성 감소 → 시장 안정</li>
          </ul>
          <p className="mt-4 text-xs text-gray-500">
            수동으로 새로고침하려면 Ctrl+Shift+R (Mac: Cmd+Shift+R)을 눌러주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
```
