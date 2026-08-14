#!/usr/bin/env node
/*
 * 실데이터 빌드 파이프라인 (다지역).
 *
 * 지역별로 실제 도로망과 실제 광고 매체 지점(버스쉘터·지하철역)을 결합해
 * 데모가 로드하는 직렬화 파일(web/data/<key>.js)을 만든다.
 *
 * 데이터 출처 (data-src/, 자세한 내용은 data-src/README.md):
 *  - roads-seoul.geojson            용산 일대 도로망 — OpenStreetMap (ODbL),
 *                                   openlayers/openlayers 예제 추출본
 *  - seoul-roads.pbf                서울 전역 도로 그래프 — OpenStreetMap (ODbL),
 *                                   anvaka/index-large-cities(city-roads) 캐시
 *  - seoul_bus_stations_utf8.csv    서울시 버스정류소 위치정보 — 서울 열린데이터광장
 *  - seoul_subway_stations_utf8.csv 서울시 지하철역 좌표 — 서울 열린데이터광장 미러
 *
 * 공통 파이프라인:
 *  1. 소스별로 way(경위도 폴리라인) 목록 로드 (pbf는 bbox 크롭)
 *  2. 공유 정점에서 way를 분할해 보행 그래프 생성, 최대 연결 요소만 유지
 *  3. 광고 매체를 가시권 안 도로(가까운 순 최대 4개)에 부착
 *     — 노출 정산은 광고 id 기준 1회이므로 다간선 부착이 중복 집계되지 않는다
 *  4. 광고 로드와 최단 경로의 차이가 가장 큰 쇼케이스 구간 선정
 *  5. UMD 직렬화 (window.ADRO_REGIONS 레지스트리에 등록)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { decodePlace } = require('./lib/place-pbf.js');
const { Graph } = require('../src/graph.js');
const { shortestRoute, adRoadRoute } = require('../src/adroad.js');

const ROOT = path.join(__dirname, '..');
const SRC = p => path.join(ROOT, 'data-src', p);
const hash = s => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

// ---- 소스 로더 ----

function waysFromGeojson(file) {
  const fc = JSON.parse(fs.readFileSync(SRC(file), 'utf8'));
  return fc.features
    .filter(f => f.geometry.type === 'LineString')
    .map(f => f.geometry.coordinates);
}

function waysFromPbf(file, bbox) {
  const { nodes, ways } = decodePlace(fs.readFileSync(SRC(file)));
  const inBox = c => c && c[0] >= bbox.minLon && c[0] <= bbox.maxLon &&
                     c[1] >= bbox.minLat && c[1] <= bbox.maxLat;
  const out = [];
  for (const w of ways) {
    // bbox 안에 있는 연속 구간만 잘라낸다 (경계에서 way 분리)
    let run = [];
    for (const id of w) {
      const c = nodes.get(id);
      if (inBox(c)) {
        run.push(c);
      } else {
        if (run.length >= 2) out.push(run);
        run = [];
      }
    }
    if (run.length >= 2) out.push(run);
  }
  return out;
}

function loadCsvPoints(file, pick) {
  const lines = fs.readFileSync(SRC(file), 'utf8').trim().split('\n').slice(1);
  const points = [];
  for (const line of lines) {
    const p = pick(line.split(','));
    if (p) points.push(p);
  }
  return points;
}

const busStops = () => loadCsvPoints('seoul_bus_stations_utf8.csv', c => ({
  id: `bus${c[0]}`, name: c[2], lon: +c[3], lat: +c[4],
}));

const subwayStations = () => loadCsvPoints('seoul_subway_stations_utf8.csv', c => ({
  id: `sub${c[0]}`, name: `${c[1]}역`, lon: +c[8], lat: +c[7],
}));

// ---- 지역 정의 ----

const REGIONS = [
  {
    key: 'seongsu',
    name: '성수 (실제 데이터)',
    // 서울숲 ~ 뚝섬역 ~ 성수역 ~ 연무장길 일대
    bbox: { minLon: 127.032, maxLon: 127.070, minLat: 37.535, maxLat: 37.553 },
    loadWays() { return waysFromPbf('seoul-roads.pbf', this.bbox); },
    adSources: [
      {
        // 지하철역 미디어보드: 역 출입구 가시권을 넓게 잡는다
        points: subwayStations, type: () => 'digital', visibilityM: 110,
        value: p => 12 + (hash(p.id) % 7),
      },
      {
        // 버스쉘터·가로 빌보드: 도로망이 완전해 가시권을 좁게 잡는다
        points: busStops, type: p => (/역/.test(p.name) ? 'digital' : 'billboard'),
        visibilityM: 60, value: p => (/역/.test(p.name) ? 10 + (hash(p.id) % 8) : 5 + (hash(p.id) % 6)),
      },
    ],
    showcase: { sample: 36, minPathLen: 800 },
    attribution: [
      '도로망: OpenStreetMap contributors (ODbL) — anvaka/index-large-cities(city-roads) 캐시',
      '광고 매체 지점: 서울시 버스정류소·지하철역 좌표 (서울 열린데이터광장 미러)',
    ],
  },
  {
    key: 'yongsan',
    name: '용산 (실제 데이터)',
    loadWays() { return waysFromGeojson('roads-seoul.geojson'); },
    adSources: [
      {
        // 이 추출본에는 한강대로·이태원로 등 일부 간선도로가 빠져 있어
        // 정류소가 도로망에서 다소 떨어져 계산된다. 가시권을 보수적으로
        // 160m로 잡는다 (거리 분포 검증 기준).
        points: busStops, type: p => (/역/.test(p.name) ? 'digital' : 'billboard'),
        visibilityM: 160, value: p => (/역/.test(p.name) ? 10 + (hash(p.id) % 8) : 5 + (hash(p.id) % 6)),
      },
    ],
    showcase: { sample: 64, minPathLen: 500 },
    attribution: [
      '도로망: OpenStreetMap contributors (ODbL) — openlayers/openlayers 예제 추출본',
      '광고 매체 지점: 서울시 버스정류소 위치정보 (서울 열린데이터광장) — Just-Kaggle/labs 미러',
    ],
  },
];

const MAX_EDGES_PER_AD = 4;

// ---- 공통 파이프라인 ----

function buildRegion(region) {
  console.log(`\n== ${region.name} ==`);
  const ways = region.loadWays();

  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const w of ways) for (const [lon, lat] of w) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  const lon0 = (minLon + maxLon) / 2;
  const lat0 = (minLat + maxLat) / 2;
  const M_PER_LON = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const M_PER_LAT = 110574;
  // 화면 좌표계: x 동쪽 +, y 남쪽 + (북쪽이 위)
  const project = (lon, lat) => ({
    x: (lon - lon0) * M_PER_LON,
    y: (lat0 - lat) * M_PER_LAT,
  });

  // 1. 그래프 정점: way 끝점 + 둘 이상의 way가 공유하는 좌표
  const key = ([lon, lat]) => `${lon},${lat}`;
  const usage = new Map();
  for (const w of ways) {
    const seen = new Set();
    w.forEach((c, i) => {
      const k = key(c);
      const inc = i === 0 || i === w.length - 1 || seen.has(k) ? 2 : 1;
      seen.add(k);
      usage.set(k, (usage.get(k) || 0) + inc);
    });
  }
  const isVertex = k => usage.get(k) >= 2;

  const nodeIds = new Map();
  const nodes = [];
  const nodeFor = coord => {
    const k = key(coord);
    if (!nodeIds.has(k)) {
      const p = project(coord[0], coord[1]);
      nodeIds.set(k, nodes.length);
      nodes.push({ id: `r${nodes.length}`, x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
    }
    return nodeIds.get(k);
  };

  // 2. way를 정점 기준으로 분할해 간선(폴리라인) 생성
  let edges = [];
  const edgeSeen = new Set();
  for (const w of ways) {
    let segStart = 0;
    for (let i = 1; i < w.length; i++) {
      const atEnd = i === w.length - 1;
      if (!atEnd && !isVertex(key(w[i]))) continue;
      const slice = w.slice(segStart, i + 1);
      const a = nodeFor(slice[0]);
      const b = nodeFor(slice[slice.length - 1]);
      const geometry = slice.map(c => {
        const p = project(c[0], c[1]);
        return { x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
      });
      let length = 0;
      for (let j = 1; j < geometry.length; j++) {
        length += Math.hypot(geometry[j].x - geometry[j - 1].x, geometry[j].y - geometry[j - 1].y);
      }
      // 같은 두 정점을 같은 길이로 잇는 중복 간선(양방향 중복 표기 등)은 한 번만
      const ek = a < b ? `${a}|${b}|${length.toFixed(0)}` : `${b}|${a}|${length.toFixed(0)}`;
      if (a !== b && length > 1 && !edgeSeen.has(ek)) {
        edgeSeen.add(ek);
        edges.push({ a, b, length: +length.toFixed(1), geometry, ads: [] });
      }
      segStart = i;
    }
  }

  // 3. 최대 연결 요소만 유지
  {
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push(e.b);
      adj.get(e.b).push(e.a);
    }
    const comp = new Map();
    let nComp = 0;
    for (const start of adj.keys()) {
      if (comp.has(start)) continue;
      const c = nComp++;
      const stack = [start];
      comp.set(start, c);
      while (stack.length) {
        const u = stack.pop();
        for (const v of adj.get(u)) if (!comp.has(v)) { comp.set(v, c); stack.push(v); }
      }
    }
    const sizes = new Map();
    for (const c of comp.values()) sizes.set(c, (sizes.get(c) || 0) + 1);
    const main = [...sizes.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const keep = edges.filter(e => comp.get(e.a) === main);
    console.log(`연결 요소 ${nComp}개 중 최대(노드 ${sizes.get(main)}개) 유지 — 간선 ${edges.length} → ${keep.length}`);
    edges = keep;
  }

  // 4. 광고 매체 스냅 (가시권 모델)
  const nearestOnEdge = (e, p) => {
    let best = null;
    let acc = 0;
    for (let i = 1; i < e.geometry.length; i++) {
      const a = e.geometry[i - 1], b = e.geometry[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const segLen = Math.hypot(dx, dy) || 1e-9;
      let u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (segLen * segLen);
      u = Math.max(0, Math.min(1, u));
      const qx = a.x + dx * u, qy = a.y + dy * u;
      const d = Math.hypot(p.x - qx, p.y - qy);
      if (!best || d < best.d) {
        const cross = dx * (p.y - qy) - dy * (p.x - qx);
        // 좌표 반올림 때문에 세그먼트 길이 합이 e.length를 살짝 넘을 수 있다
        const t = Math.max(0, Math.min(1, (acc + segLen * u) / e.length));
        best = { d, t, side: cross >= 0 ? 1 : -1 };
      }
      acc += segLen;
    }
    return best;
  };

  const usedAdIds = new Set();
  for (const src of region.adSources) {
    let attached = 0, skipped = 0;
    for (const raw of src.points()) {
      if (raw.lon < minLon || raw.lon > maxLon || raw.lat < minLat || raw.lat > maxLat) continue;
      if (usedAdIds.has(raw.id)) continue;
      const p = project(raw.lon, raw.lat);
      const hits = [];
      for (const e of edges) {
        const hit = nearestOnEdge(e, p);
        if (hit && hit.d <= src.visibilityM) hits.push({ e, hit });
      }
      if (!hits.length) { skipped++; continue; }
      usedAdIds.add(raw.id);
      hits.sort((x, y) => x.hit.d - y.hit.d);
      for (const { e, hit } of hits.slice(0, MAX_EDGES_PER_AD)) {
        e.ads.push({
          id: raw.id,
          type: src.type(raw),
          label: raw.name,
          value: src.value(raw),
          t: +hit.t.toFixed(3),
          side: hit.side,
        });
      }
      attached++;
    }
    console.log(`광고 매체 부착 ${attached}곳 (가시권 ${src.visibilityM}m), 반경 밖 제외 ${skipped}곳`);
  }

  // 5. 직렬화 준비 + 쇼케이스 구간
  const usedNodes = new Set();
  for (const e of edges) { usedNodes.add(e.a); usedNodes.add(e.b); }
  const outNodes = [...usedNodes].map(i => nodes[i]);
  const outEdges = edges.map(e => ({
    a: nodes[e.a].id, b: nodes[e.b].id,
    length: e.length, geometry: e.geometry, ads: e.ads,
  }));

  const g = new Graph();
  for (const n of outNodes) g.addNode(n.id, n.x, n.y);
  for (const e of outEdges) g.addEdge(e.a, e.b, { length: e.length, ads: e.ads, geometry: e.geometry });

  const step = Math.max(1, Math.ceil(outNodes.length / region.showcase.sample));
  const sample = outNodes.filter((_, i) => i % step === 0);
  let best = null;
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const base = shortestRoute(g, sample[i].id, sample[j].id);
      if (!base || base.length < region.showcase.minPathLen) continue;
      const ad = adRoadRoute(g, sample[i].id, sample[j].id, { maxDetourRatio: 0.3 });
      const gain = ad.adScore - base.adScore;
      // 같은 이득이면 노출 가치가 큰 구간을 고른다
      if (!best || gain > best.gain || (gain === best.gain && ad.adScore > best.adScore)) {
        best = { gain, start: sample[i].id, goal: sample[j].id, adScore: ad.adScore };
      }
    }
  }
  console.log(`쇼케이스 구간: ${best.start} → ${best.goal} (노출 가치 +${best.gain})`);

  const data = {
    key: region.key,
    name: region.name,
    defaults: { start: best.start, goal: best.goal },
    attribution: region.attribution,
    bbox: { minLon, minLat, maxLon, maxLat },
    nodes: outNodes,
    edges: outEdges,
  };

  const out = `/*
 * 자동 생성 파일 — scripts/build-real-data.js 가 만든다. 직접 수정 금지.
 * 도로망: © OpenStreetMap contributors, ODbL 1.0
 * 광고 매체 지점: 서울 열린데이터광장 (버스정류소·지하철역)
 */
(function (global, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  global.ADRO_REGIONS = Object.assign(global.ADRO_REGIONS || {}, { [data.key]: data });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return ${JSON.stringify(data)};
});
`;
  fs.mkdirSync(path.join(ROOT, 'web', 'data'), { recursive: true });
  const outPath = path.join(ROOT, 'web', 'data', `${region.key}.js`);
  fs.writeFileSync(outPath, out);
  const adAttach = outEdges.reduce((s, e) => s + e.ads.length, 0);
  const adUnique = new Set(outEdges.flatMap(e => e.ads.map(a => a.id))).size;
  console.log(`web/data/${region.key}.js 생성 — 노드 ${outNodes.length}, 간선 ${outEdges.length}, ` +
    `광고 매체 ${adUnique}곳 (부착 ${adAttach})`);
}

for (const region of REGIONS) buildRegion(region);
