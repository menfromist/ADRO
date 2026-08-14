/*
 * 배지 시스템 — 코인과 함께 쓰는 비금전 보상.
 *
 * 배지는 경로 하나를 완주했을 때의 성과로 진행도를 계산한다.
 * (실서비스에서는 사용자 누적 기록으로 확장 — 연속 출석, 누적 걸음 등)
 */
(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.ADRO = Object.assign(global.ADRO || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BADGES = [
    {
      id: 'media_hunter',
      name: '미디어 헌터',
      desc: '한 번의 이동으로 광고 10곳 노출',
      target: r => 10,
      progress: r => r.reward.adCount,
    },
    {
      id: 'digital_collector',
      name: '디지털 컬렉터',
      desc: '역 미디어보드·디지털 매체 3곳 노출',
      target: r => 3,
      progress: r => r.reward.digitalCount,
    },
    {
      id: 'long_walker',
      name: '만보 로더',
      desc: '한 경로에서 8,000걸음',
      target: r => 8000,
      progress: r => r.reward.steps,
    },
    {
      id: 'area_explorer',
      name: '동네 탐험가',
      desc: '지역 광고 매체의 30% 커버',
      target: r => Math.max(1, Math.ceil(r.regionAdTotal * 0.3)),
      progress: r => r.reward.adCount,
    },
    {
      id: 'coin_rush',
      name: '코인 러시',
      desc: '한 경로에서 300코인 적립',
      target: r => 300,
      progress: r => r.reward.totalCoins,
    },
  ];

  /**
   * @param {object} ctx
   * @param {object} ctx.reward        estimateReward() 결과
   * @param {number} ctx.regionAdTotal 지역의 전체 광고 매체 수 (중복 제거)
   * @returns {Array<{id,name,desc,earned,current,target}>}
   */
  function evaluateBadges(ctx) {
    return BADGES.map(b => {
      const target = b.target(ctx);
      const current = Math.min(b.progress(ctx), target);
      return {
        id: b.id,
        name: b.name,
        desc: b.desc,
        earned: current >= target,
        current,
        target,
      };
    });
  }

  /** 지역 그래프의 전체 광고 매체 수 (id 중복 제거). */
  function countRegionAds(graph) {
    const ids = new Set();
    for (const e of graph.edges) for (const ad of e.ads) ids.add(ad.id);
    return ids.size;
  }

  return { BADGES, evaluateBadges, countRegionAds };
});
