/*
 * 데모용 가상 도심 생성기.
 *
 * 격자형 도로망 위에 세 곳의 "광고 밀집 거리"(디지털 미디어폴 거리,
 * 옥외 사이니지 애비뉴, 상점가 골목)를 배치하고, 나머지 거리에는
 * 드문드문 소형 상점 광고를 뿌린다. 시드 고정 난수를 써서
 * 실행할 때마다 같은 도시가 나온다.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./graph.js'));
  } else {
    global.ADRO = Object.assign(global.ADRO || {}, factory(global.ADRO));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  const { Graph } = core;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const AD_TYPES = {
    digital: { label: '디지털 미디어폴', min: 10, max: 18 },
    billboard: { label: '옥외 빌보드', min: 8, max: 16 },
    storefront: { label: '상점 광고', min: 2, max: 6 },
  };

  function buildDemoCity(seed = 20260813) {
    const rand = mulberry32(seed);
    const g = new Graph();

    const ROWS = 8;
    const COLS = 11;
    const SP = 95; // 평균 블록 크기 (m)

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * SP + (rand() - 0.5) * 26;
        const y = r * SP + (rand() - 0.5) * 26;
        g.addNode(`n${r}_${c}`, x, y);
      }
    }

    // 광고 밀집 거리 정의 (격자 좌표 기준)
    const corridors = [
      { name: '미디어폴 스트리트', type: 'digital', row: 2, c0: 1, c1: 9 },
      { name: '사이니지 애비뉴', type: 'billboard', col: 7, r0: 1, r1: 6 },
      { name: '상점가 골목', type: 'storefront', row: 5, c0: 2, c1: 7, dense: true },
    ];

    const corridorEdgeType = new Map(); // "a|b" -> 광고 유형
    for (const co of corridors) {
      if (co.row != null) {
        for (let c = co.c0; c < co.c1; c++) {
          corridorEdgeType.set(`n${co.row}_${c}|n${co.row}_${c + 1}`, co);
        }
      } else {
        for (let r = co.r0; r < co.r1; r++) {
          corridorEdgeType.set(`n${r}_${co.col}|n${r + 1}_${co.col}`, co);
        }
      }
    }

    let adId = 0;
    const makeAd = (type) => {
      const spec = AD_TYPES[type];
      const value = Math.round(spec.min + rand() * (spec.max - spec.min));
      return {
        id: `ad${adId++}`,
        type,
        label: spec.label,
        value,
        t: 0.15 + rand() * 0.7,        // 간선상의 위치
        side: rand() < 0.5 ? -1 : 1,   // 도로의 어느 쪽인지 (렌더링용)
      };
    };

    const addStreet = (a, b) => {
      const key = `${a}|${b}`;
      const corridor = corridorEdgeType.get(key);
      const ads = [];
      if (corridor) {
        const n = corridor.dense ? 3 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 2);
        for (let i = 0; i < n; i++) ads.push(makeAd(corridor.type));
      } else if (rand() < 0.22) {
        ads.push(makeAd('storefront'));
      }
      return g.addEdge(a, b, { ads });
    };

    // 격자 간선 생성. 광고 거리가 아닌 내부 간선은 일부 끊어서
    // 실제 도심처럼 불규칙하게 만든다.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c + 1 < COLS) {
          const a = `n${r}_${c}`, b = `n${r}_${c + 1}`;
          const interior = r > 0 && r < ROWS - 1;
          if (corridorEdgeType.has(`${a}|${b}`) || !interior || rand() >= 0.08) {
            addStreet(a, b);
          }
        }
        if (r + 1 < ROWS) {
          const a = `n${r}_${c}`, b = `n${r + 1}_${c}`;
          const interior = c > 0 && c < COLS - 1;
          if (corridorEdgeType.has(`${a}|${b}`) || !interior || rand() >= 0.08) {
            addStreet(a, b);
          }
        }
      }
    }

    return { graph: g, corridors, rows: ROWS, cols: COLS };
  }

  return { buildDemoCity, AD_TYPES };
});
