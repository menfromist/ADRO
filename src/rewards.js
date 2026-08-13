/*
 * 리워드 모델.
 *
 * 사용자는 두 갈래로 포인트를 얻는다.
 *  1. 걸음 보상: 캐시워크식 기본 적립 (걸음 수 × 걸음당 포인트)
 *  2. 광고 노출 보상: 경로상의 광고 앞을 실제로 지나면 광고별 가치만큼 적립
 *     — 광고주가 CPE(Cost Per Exposure)로 정산하는 재원
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
    basePointPerStep: 0.05, // 걸음당 기본 포인트
    walkSpeedKmh: 4.8,      // 도보 속도 가정
    dailyCapPoints: 500,    // 일일 적립 상한
  };

  /**
   * 경로 하나에 대한 예상 리워드.
   * @param {{ length: number, edges: Array }} route
   */
  function estimateReward(route, opts = {}) {
    const cfg = { ...REWARD_DEFAULTS, ...opts };

    const steps = Math.round(route.length / cfg.stepLengthM);
    const basePoints = Math.floor(steps * cfg.basePointPerStep);

    const seen = new Set();
    let adPoints = 0;
    let adCount = 0;
    for (const e of route.edges) {
      for (const ad of e.ads) {
        if (seen.has(ad.id)) continue;
        seen.add(ad.id);
        adPoints += ad.value;
        adCount += 1;
      }
    }

    const rawTotal = basePoints + adPoints;
    const totalPoints = Math.min(rawTotal, cfg.dailyCapPoints);
    const walkTimeMin = (route.length / 1000 / cfg.walkSpeedKmh) * 60;

    return {
      steps,
      basePoints,
      adPoints,
      adCount,
      totalPoints,
      capped: rawTotal > totalPoints,
      walkTimeMin,
    };
  }

  return { REWARD_DEFAULTS, estimateReward };
});
