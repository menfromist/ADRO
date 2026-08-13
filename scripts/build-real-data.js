#!/usr/bin/env node
/*
 * 실데이터 빌드 파이프라인.
 *
 * 입력 (data-src/):
 *  - roads-seoul.geojson        서울 용산 일대 실제 도로망 (OpenStreetMap, ODbL)
 *                               출처: openlayers/openlayers 예제 데이터 (overpass-turbo 추출)
 *  - seoul_bus_stations_utf8.csv 서울시 버스정류소 위치정보 (서울 열린데이터광장)
 *                               출처: Just-Kaggle/labs 미러
 *
 * 출력:
 *  - web/data/yongsan.js        데모가 로드하는 직렬화된 도시 데이터 (UMD)
 *
 * 처리:
 *  1. GeoJSON LineString → 보행 그래프 (공유 정점에서 way 분할, 폴리라인 유지)
 *  2. 최대 연결 요소만 유지
 *  3. bbox 안의 버스정류소를 가장 가까운 도로에 스냅해 광고 매체로 부착
 *     - 역 인접 정류소(이름에 '역') → 디지털 미디어보드 (고가치)
 *     - 일반 정류소 → 버스쉘터 광고
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = p => path.join(ROOT, 'data-src', p);

// ---- 1. 도로망 파싱 ----
const fc = JSON.parse(fs.readFileSync(SRC('roads-seoul.geojson'), 'utf8'));
const ways = fc.features.filter(f => f.geometry.type === 'LineString');

let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
for (const w of ways) {
  for (const [lon, lat] of w.geometry.coordinates) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
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

// ---- 2. 그래프 정점 찾기 (way 끝점 + 둘 이상의 way가 공유하는 좌표) ----
const key = ([lon, lat]) => `${lon},${lat}`;
const usage = new Map();
for (const w of ways) {
  const coords = w.geometry.coordinates;
  const seen = new Set();
  coords.forEach((c, i) => {
    const k = key(c);
    // way 내부 중복 방문(루프)도 정점으로 취급
    const inc = i === 0 || i === coords.length - 1 || seen.has(k) ? 2 : 1;
    seen.add(k);
    usage.set(k, (usage.get(k) || 0) + inc);
  });
}
const isVertex = k => usage.get(k) >= 2;

const nodeIds = new Map(); // coordKey -> nodeId
const nodes = [];
function nodeFor(coord) {
  const k = key(coord);
  if (!nodeIds.has(k)) {
    const p = project(coord[0], coord[1]);
    nodeIds.set(k, nodes.length);
    nodes.push({ id: `r${nodes.length}`, x: +p.x.toFixed(1), y: +p.y.toFixed(1) });
  }
  return nodeIds.get(k);
}

// ---- 3. way를 정점 기준으로 분할해 간선(폴리라인) 생성 ----
const edges = [];
for (const w of ways) {
  const coords = w.geometry.coordinates;
  let segStart = 0;
  for (let i = 1; i < coords.length; i++) {
    const atEnd = i === coords.length - 1;
    if (!atEnd && !isVertex(key(coords[i]))) continue;
    const slice = coords.slice(segStart, i + 1);
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
    if (a !== b && length > 1) {
      edges.push({ a, b, length: +length.toFixed(1), geometry, ads: [], highway: w.properties.highway, name: w.properties.name || null });
    }
    segStart = i;
  }
}

// ---- 4. 최대 연결 요소만 유지 ----
{
  const adj = new Map();
  edges.forEach((e, i) => {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  });
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
  edges.length = 0;
  edges.push(...keep);
}

// ---- 5. 버스정류소 → 광고 매체 스냅 ----
const csv = fs.readFileSync(SRC('seoul_bus_stations_utf8.csv'), 'utf8').trim().split('\n').slice(1);
const stops = [];
for (const line of csv) {
  const [arsId, stdId, name, xs, ys] = line.split(',');
  const lon = +xs, lat = +ys;
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
  stops.push({ arsId, name, ...project(lon, lat) });
}
console.log(`bbox 내 버스정류소 ${stops.length}곳`);

function nearestOnEdge(e, p) {
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
}

const hash = s => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

// 옥외광고는 특정 간선 하나가 아니라 가시권 안의 모든 도로에서 노출된다.
// 이 OSM 추출본에는 한강대로·이태원로 등 일부 간선도로가 빠져 있어 정류소가
// 도로망에서 다소 떨어져 계산되므로, 가시권을 보수적으로 160m로 잡고
// 반경 안의 가까운 도로 최대 4개에 같은 광고를 부착한다 (노출 정산은 광고
// id 기준으로 중복 제거되므로 경로가 몇 개 간선을 지나든 1회만 집계).
const VISIBILITY_M = 160;
const MAX_EDGES_PER_AD = 4;
let attached = 0, skipped = 0;
for (const stop of stops) {
  const hits = [];
  for (const e of edges) {
    const hit = nearestOnEdge(e, stop);
    if (hit && hit.d <= VISIBILITY_M) hits.push({ e, hit });
  }
  if (!hits.length) { skipped++; continue; }
  hits.sort((x, y) => x.hit.d - y.hit.d);
  const nearStation = /역/.test(stop.name);
  const h = hash(stop.arsId);
  for (const { e, hit } of hits.slice(0, MAX_EDGES_PER_AD)) {
    e.ads.push({
      id: `bus${stop.arsId}`,
      type: nearStation ? 'digital' : 'billboard',
      label: stop.name,
      value: nearStation ? 10 + (h % 8) : 5 + (h % 6),
      t: +hit.t.toFixed(3),
      side: hit.side,
    });
  }
  attached++;
}
console.log(`광고 매체로 부착 ${attached}곳 (가시권 ${VISIBILITY_M}m), 반경 밖 제외 ${skipped}곳`);

// ---- 6. 직렬화 ----
const usedNodes = new Set();
for (const e of edges) { usedNodes.add(e.a); usedNodes.add(e.b); }
const nodeRemap = new Map();
const outNodes = [];
for (const i of usedNodes) {
  nodeRemap.set(i, outNodes.length);
  outNodes.push(nodes[i]);
}
const outEdges = edges.map(e => ({
  a: nodes[e.a].id, b: nodes[e.b].id,
  length: e.length, geometry: e.geometry, ads: e.ads,
  name: e.name,
}));

// ---- 6.5. 쇼케이스 기본 구간: 광고 로드와 최단 경로의 차이가 가장 큰 노드쌍 ----
const { Graph } = require('../src/graph.js');
const { shortestRoute, adRoadRoute } = require('../src/adroad.js');
const showcase = (() => {
  const g = new Graph();
  for (const n of outNodes) g.addNode(n.id, n.x, n.y);
  for (const e of outEdges) g.addEdge(e.a, e.b, { length: e.length, ads: e.ads, geometry: e.geometry });

  const step = Math.max(1, Math.ceil(outNodes.length / 64));
  const sample = outNodes.filter((_, i) => i % step === 0);
  let best = null;
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const a = sample[i], b = sample[j];
      const base = shortestRoute(g, a.id, b.id);
      if (!base || base.length < 500) continue;
      const ad = adRoadRoute(g, a.id, b.id, { maxDetourRatio: 0.3 });
      const gain = ad.adScore - base.adScore;
      // 이득이 같다면 노출 가치가 큰 구간을 고른다
      if (!best || gain > best.gain || (gain === best.gain && ad.adScore > best.adScore)) {
        best = { gain, start: a.id, goal: b.id, adScore: ad.adScore };
      }
    }
  }
  console.log(`쇼케이스 구간: ${best.start} → ${best.goal} (노출 가치 +${best.gain})`);
  return { start: best.start, goal: best.goal };
})();

const data = {
  name: '용산 (실제 데이터)',
  defaults: showcase,
  attribution: [
    '도로망: OpenStreetMap contributors (ODbL) — openlayers/openlayers 예제 추출본',
    '광고 매체 지점: 서울시 버스정류소 위치정보 (서울 열린데이터광장) — Just-Kaggle/labs 미러',
  ],
  bbox: { minLon, minLat, maxLon, maxLat },
  nodes: outNodes,
  edges: outEdges,
};

const out = `/*
 * 자동 생성 파일 — scripts/build-real-data.js 가 만든다. 직접 수정 금지.
 * 도로망: © OpenStreetMap contributors, ODbL 1.0
 * 정류소: 서울 열린데이터광장 '서울시 버스정류소 위치정보'
 */
(function (global, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  global.ADRO_DATA = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return ${JSON.stringify(data)};
});
`;
fs.mkdirSync(path.join(ROOT, 'web', 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'web', 'data', 'yongsan.js'), out);
const adTotal = outEdges.reduce((s, e) => s + e.ads.length, 0);
console.log(`web/data/yongsan.js 생성 — 노드 ${outNodes.length}, 간선 ${outEdges.length}, 광고 매체 ${adTotal}`);
