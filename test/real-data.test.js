'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { shortestRoute, adRoadRoute } = require('../src/adroad.js');
const { buildCityFromData } = require('../src/load-city.js');

const REGIONS = [
  { data: require('../web/data/seongsu.js'), namePattern: /성수/, minNodes: 800, minEdges: 1200, minAds: 80 },
  { data: require('../web/data/yongsan.js'), namePattern: /용산/, minNodes: 100, minEdges: 150, minAds: 15 },
];

for (const { data, namePattern, minNodes, minEdges, minAds } of REGIONS) {
  const label = data.key;

  test(`실데이터(${label}): 직렬화 파일이 그래프로 로드된다`, () => {
    const { graph, name, attribution } = buildCityFromData(data);
    assert.match(name, namePattern);
    assert.equal(attribution.length, 2);
    assert.ok(graph.nodes.size >= minNodes, `노드 ${graph.nodes.size}`);
    assert.ok(graph.edges.length >= minEdges, `간선 ${graph.edges.length}`);
  });

  test(`실데이터(${label}): 그래프가 하나로 연결되어 있다`, () => {
    const { graph } = buildCityFromData(data);
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

  test(`실데이터(${label}): 간선 지오메트리와 광고 부착이 유효하다`, () => {
    const { graph } = buildCityFromData(data);
    const adIds = new Set();
    for (const e of graph.edges) {
      assert.ok(e.geometry.length >= 2);
      assert.ok(e.length > 0);
      for (const ad of e.ads) {
        adIds.add(ad.id);
        assert.ok(ad.t >= 0 && ad.t <= 1, `t=${ad.t}`);
        assert.ok(ad.side === 1 || ad.side === -1);
        assert.ok(ad.value >= 2 && ad.value <= 18);
        assert.ok(ad.label.length > 0);
      }
    }
    assert.ok(adIds.size >= minAds, `실제 광고 매체 ${adIds.size}곳`);
  });

  test(`실데이터(${label}): 쇼케이스 구간에서 우회 예산을 지키며 노출을 늘린다`, () => {
    const { graph, defaults } = buildCityFromData(data);
    assert.ok(defaults && defaults.start && defaults.goal);
    const base = shortestRoute(graph, defaults.start, defaults.goal);
    const ad = adRoadRoute(graph, defaults.start, defaults.goal, { maxDetourRatio: 0.3 });
    assert.ok(base && ad);
    assert.ok(ad.length <= base.length * 1.3 + 1e-9);
    assert.ok(ad.adScore >= base.adScore);
    assert.ok(ad.adScore > 0, '쇼케이스 경로가 광고를 하나도 지나지 않음');
  });
}
