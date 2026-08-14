/*
 * 리워드 모델 — 가상 재화(AD코인) 기반.
 *
 * 실제 광고주 정산(CPE) 계약 전 단계에서는 현금성 포인트 대신
 * 앱 내 가상 코인과 배지로 보상한다. 코인 적립 구조는 정산 모델과
 * 동일해서, 광고주 계약이 붙으면 단가만 실비로 교체하면 된다.
 *
 *  1. 걸음 코인: 캐시워크식 기본 적립 (걸음 수 × 걸음당 코인)
 *  2. 노출 코인: 경로상의 광고 앞을 실제로 지나면 광고별 가치만큼 적립
 *
 * 부정 적립 방지를 위해 일일 상한을 두고, 실제 서비스에서는
 * GPS 속도 검증(도보 1~7km/h)과 광고별 1일 1회 정산을 함께 적용한다.
 */
(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.ADRO = Object.assign(global.ADRO || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REWARD_DEFAULTS = {
    stepLengthM: 0.7,       // 평균 보폭
    baseCoinPerStep: 0.05,  // 걸음당 기본 코인
    walkSpeedKmh: 4.8,      // 도보 속도 가정
    dailyCapCoins: 500,     // 일일 적립 상한 (코인 인플레이션 방지)
  };

  /**
   * 경로 하나에 대한 예상 코인 적립.
   * @param {{ length: number, edges: Array }} route
   */
  function estimateReward(route, opts = {}) {
    const cfg = { ...REWARD_DEFAULTS, ...opts };

    const steps = Math.round(route.length / cfg.stepLengthM);
    const baseCoins = Math.floor(steps * cfg.baseCoinPerStep);

    const seen = new Set();
    let adCoins = 0;
    let adCount = 0;
    let digitalCount = 0;
    for (const e of route.edges) {
      for (const ad of e.ads) {
        if (seen.has(ad.id)) continue;
        seen.add(ad.id);
        adCoins += ad.value;
        adCount += 1;
        if (ad.type === 'digital') digitalCount += 1;
      }
    }

    const rawTotal = baseCoins + adCoins;
    const totalCoins = Math.min(rawTotal, cfg.dailyCapCoins);
    const walkTimeMin = (route.length / 1000 / cfg.walkSpeedKmh) * 60;

    return {
      steps,
      baseCoins,
      adCoins,
      adCount,
      digitalCount,
      totalCoins,
      capped: rawTotal > totalCoins,
      walkTimeMin,
    };
  }

  return { REWARD_DEFAULTS, estimateReward };
});
