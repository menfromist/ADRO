'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { edgeAdScore } = require('../src/graph.js');
const { shortestRoute, adRoadRoute } = require('../src/adroad.js');
const { buildCityFromData } = require('../src/load-city.js');
const DATA = require('../web/data/yongsan.js');

test('실데이터: 직렬화 파일이 그래프로 로드된다', () => {
  const { graph, name, attribution } = buildCityFromData(DATA);
  assert.match(name, /용산/);
  assert.equal(attribution.length, 2);
  assert.ok(graph.nodes.size >= 100, `노드 ${graph.nodes.size}`);
  assert.ok(graph.edges.length >= 150, `간선 ${graph.edges.length}`);
});

test('실데이터: 그래프가 하나로 연결되어 있다', () => {
  const { graph } = buildCityFromData(DATA);
  const start = graph.nodes.keys().next().value;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const u = stack.pop();
    for (const e of graph.neighbors(u)) {
      const v = e.a === u ? e.b : e.a;
      if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
  }
  assert.equal(seen.size, graph.nodes.size);
});

test('실데이터: 간선 지오메트리와 광고 부착이 유효하다', () => {
  const { graph } = buildCityFromData(DATA);
  let adCount = 0;
  for (const e of graph.edges) {
    assert.ok(e.geometry.length >= 2);
    assert.ok(e.length > 0);
    for (const ad of e.ads) {
      adCount++;
      assert.ok(ad.t >= 0 && ad.t <= 1, `t=${ad.t}`);
      assert.ok(ad.side === 1 || ad.side === -1);
      assert.ok(ad.value >= 2 && ad.value <= 18);
      assert.ok(ad.label.length > 0);
    }
  }
  assert.ok(adCount >= 15, `실제 광고 매체 ${adCount}곳`);
});

test('실데이터: 광고 로드가 우회 예산을 지키며 노출을 늘린다', () => {
  const { graph } = buildCityFromData(DATA);
  // 가장 멀리 떨어진 두 노드 사이를 왕복 케이스로 사용
  const nodes = [...graph.nodes.values()];
  let s = nodes[0].id, t = nodes[1].id, best = -1;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d > best) { best = d; s = nodes[i].id; t = nodes[j].id; }
    }
  }
  const base = shortestRoute(graph, s, t);
  const ad = adRoadRoute(graph, s, t, { maxDetourRatio: 0.3 });
  assert.ok(base && ad);
  assert.ok(ad.length <= base.length * 1.3 + 1e-9);
  assert.ok(ad.adScore >= base.adScore);
  assert.ok(ad.adScore > 0, '실데이터 경로가 광고를 하나도 지나지 않음');
});
