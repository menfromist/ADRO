'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Graph, dijkstra, edgeAdScore } = require('../src/graph.js');
const { shortestRoute, adRoadRoute, collectAds } = require('../src/adroad.js');
const { estimateReward } = require('../src/rewards.js');
const { buildDemoCity } = require('../src/demo-city.js');

function squareGraph() {
  // A --- B
  // |     |
  // C --- D   (모든 변 100m, C쪽 경로에만 광고)
  const g = new Graph();
  g.addNode('A', 0, 0).addNode('B', 100, 0).addNode('C', 0, 100).addNode('D', 100, 100);
  g.addEdge('A', 'B');
  g.addEdge('B', 'D');
  g.addEdge('A', 'C', { ads: [{ id: 'x1', type: 'billboard', value: 10, t: 0.5, side: 1 }] });
  g.addEdge('C', 'D', { ads: [{ id: 'x2', type: 'billboard', value: 10, t: 0.5, side: 1 }] });
  return g;
}

test('다익스트라: 최단 거리와 경로를 복원한다', () => {
  const g = squareGraph();
  const r = dijkstra(g, 'A', 'D');
  assert.ok(r);
  assert.equal(Math.round(r.length), 200);
  assert.equal(r.path.length, 3);
  assert.equal(r.path[0], 'A');
  assert.equal(r.path[2], 'D');
});

test('다익스트라: 도달 불가능하면 null', () => {
  const g = new Graph();
  g.addNode('A', 0, 0).addNode('B', 100, 0).addNode('Z', 999, 999);
  g.addEdge('A', 'B');
  assert.equal(dijkstra(g, 'A', 'Z'), null);
});

test('광고 로드: 거리가 같으면 광고가 있는 쪽을 고른다', () => {
  const g = squareGraph();
  const r = adRoadRoute(g, 'A', 'D', { maxDetourRatio: 0 });
  assert.equal(r.adScore, 20);
  assert.deepEqual(r.path, ['A', 'C', 'D']);
  assert.equal(collectAds(r).length, 2);
});

test('광고 로드: 우회 예산 안에서만 우회한다', () => {
  // 직행 A-B 300m (광고 없음) vs 우회 A-C-B 약 340m (광고 가치 50)
  const g = new Graph();
  g.addNode('A', 0, 0).addNode('B', 300, 0).addNode('C', 150, 80);
  g.addEdge('A', 'B');
  g.addEdge('A', 'C', { ads: [{ id: 'big1', type: 'digital', value: 25, t: 0.5, side: 1 }] });
  g.addEdge('C', 'B', { ads: [{ id: 'big2', type: 'digital', value: 25, t: 0.5, side: 1 }] });

  const generous = adRoadRoute(g, 'A', 'B', { maxDetourRatio: 0.3 });
  assert.equal(generous.adScore, 50);
  assert.deepEqual(generous.path, ['A', 'C', 'B']);
  assert.ok(generous.detourRatio > 0 && generous.detourRatio <= 0.3);

  const strict = adRoadRoute(g, 'A', 'B', { maxDetourRatio: 0.05 });
  assert.equal(strict.adScore, 0);
  assert.deepEqual(strict.path, ['A', 'B']);
});

test('광고 로드: 노출 가치는 항상 최단 경로 이상', () => {
  const { graph } = buildDemoCity();
  const cases = [
    ['n6_1', 'n1_9'],
    ['n0_0', 'n7_10'],
    ['n7_2', 'n0_8'],
    ['n3_0', 'n4_10'],
  ];
  for (const [s, t] of cases) {
    const base = shortestRoute(graph, s, t);
    const ad = adRoadRoute(graph, s, t, { maxDetourRatio: 0.3 });
    assert.ok(base && ad, `${s}->${t} 경로가 있어야 한다`);
    assert.ok(ad.adScore >= base.adScore, `${s}->${t}: ${ad.adScore} >= ${base.adScore}`);
    assert.ok(ad.length <= base.length * 1.3 + 1e-9, `${s}->${t}: 우회 예산 초과`);
  }
});

test('데모 도시: 모든 노드가 연결되어 있다', () => {
  const { graph } = buildDemoCity();
  const start = graph.nodes.keys().next().value;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const u = stack.pop();
    for (const e of graph.neighbors(u)) {
      const v = e.a === u ? e.b : e.a;
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  assert.equal(seen.size, graph.nodes.size);
});

test('데모 도시: 광고 밀집 거리가 실제로 존재한다', () => {
  const { graph } = buildDemoCity();
  const dense = graph.edges.filter(e => edgeAdScore(e) >= 20);
  assert.ok(dense.length >= 10, `밀집 간선 ${dense.length}개`);
});

test('리워드: 걸음 보상 + 광고 보상 합산, 상한 적용', () => {
  const route = {
    length: 700, // 1,000걸음
    edges: [
      { length: 700, ads: [{ id: 'a', value: 12 }, { id: 'b', value: 8 }] },
    ],
  };
  const r = estimateReward(route);
  assert.equal(r.steps, 1000);
  assert.equal(r.basePoints, 50);
  assert.equal(r.adPoints, 20);
  assert.equal(r.adCount, 2);
  assert.equal(r.totalPoints, 70);
  assert.equal(r.capped, false);

  const capped = estimateReward(route, { dailyCapPoints: 60 });
  assert.equal(capped.totalPoints, 60);
  assert.equal(capped.capped, true);
});
