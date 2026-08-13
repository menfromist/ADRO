/*
 * 광고 로드(Ad Road) 라우팅.
 *
 * 문제 정의: 최단 경로 대비 우회율이 maxDetourRatio를 넘지 않는 경로 중
 * 광고 노출 가치(adScore)가 최대인 경로를 찾는다.
 *
 * 제약 조건이 붙은 최단 경로는 일반적으로 NP-hard이므로, 실용적인 근사로
 * "거리 − β·광고가치" 를 간선 비용으로 두고 β를 스윕하는 다익스트라를 쓴다.
 * β가 커질수록 광고가 많은 길이 싸져서 경로가 광고 밀집 거리 쪽으로 휘고,
 * 우회 예산을 넘는 후보는 버린다.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./graph.js'));
  } else {
    global.ADRO = Object.assign(global.ADRO || {}, factory(global.ADRO));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  const { dijkstra, edgeAdScore } = core;

  /** 경로가 지나는 광고를 중복 없이 모은다. */
  function collectAds(route) {
    const seen = new Set();
    const ads = [];
    for (const e of route.edges) {
      for (const ad of e.ads) {
        if (seen.has(ad.id)) continue;
        seen.add(ad.id);
        ads.push(ad);
      }
    }
    return ads;
  }

  // 같은 광고가 가시권 안의 여러 간선에 붙어 있을 수 있으므로,
  // 경로의 노출 가치는 광고 id 기준으로 중복 제거해 계산한다.
  function uniqueAdScore(route) {
    let sum = 0;
    for (const ad of collectAds(route)) sum += ad.value;
    return sum;
  }

  function shortestRoute(graph, start, goal) {
    const r = dijkstra(graph, start, goal);
    if (!r) return null;
    r.adScore = uniqueAdScore(r);
    return { ...r, mode: 'shortest', baseLength: r.length, detourRatio: 0 };
  }

  /**
   * @param {object} [opts]
   * @param {number} [opts.maxDetourRatio=0.3] 허용 우회율 (0.3 = 최단 대비 +30%)
   * @param {number} [opts.sweepSteps=28]      β 스윕 해상도
   */
  function adRoadRoute(graph, start, goal, opts = {}) {
    const { maxDetourRatio = 0.3, sweepSteps = 28 } = opts;
    const base = dijkstra(graph, start, goal);
    if (!base) return null;
    base.adScore = uniqueAdScore(base);

    const budget = base.length * (1 + maxDetourRatio);
    let best = base;

    // β 상한: 광고 밀도가 가장 낮은 광고 간선까지 비용이 거의 0이 되는 수준.
    // 비용 하한(길이의 5%) 클램프가 음수 비용을 막아주므로 β를 크게 잡아도 안전하다.
    let betaMax = 0;
    for (const e of graph.edges) {
      const s = edgeAdScore(e);
      if (s > 0) betaMax = Math.max(betaMax, (0.95 * e.length) / s);
    }

    if (betaMax > 0) {
      for (let i = 1; i <= sweepSteps; i++) {
        // 제곱 스케일로 작은 β 구간을 촘촘히 탐색한다
        const f = i / sweepSteps;
        const beta = betaMax * f * f;
        const costFn = e => Math.max(e.length * 0.05, e.length - beta * edgeAdScore(e));
        const r = dijkstra(graph, start, goal, costFn);
        if (!r || r.length > budget) continue;
        r.adScore = uniqueAdScore(r);
        if (r.adScore > best.adScore ||
            (r.adScore === best.adScore && r.length < best.length)) {
          best = r;
        }
      }
    }

    return {
      ...best,
      mode: 'adRoad',
      baseLength: base.length,
      detourRatio: best.length / base.length - 1,
    };
  }

  return { shortestRoute, adRoadRoute, collectAds };
});
