/*
 * ADRO 핵심 그래프 모듈.
 * 브라우저(window.ADRO)와 Node(require) 양쪽에서 동작하는 UMD 형태.
 */
(function (global, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.ADRO = Object.assign(global.ADRO || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 무방향 도로 그래프. 노드는 좌표(미터), 간선은 도로 구간 + 광고 목록을 가진다. */
  class Graph {
    constructor() {
      this.nodes = new Map();
      this.adj = new Map();
      this.edges = [];
    }

    addNode(id, x, y) {
      this.nodes.set(id, { id, x, y });
      this.adj.set(id, []);
      return this;
    }

    /**
     * @param {object} [opts]
     * @param {number} [opts.length]   미지정 시 지오메트리 폴리라인 길이
     * @param {Array}  [opts.ads]      [{ id, type, value, t, side }] — t는 간선상의 위치(0~1)
     * @param {Array}  [opts.geometry] 도로 형상 [{x,y}...] — 미지정 시 두 노드를 잇는 직선
     */
    addEdge(a, b, opts = {}) {
      const na = this.nodes.get(a);
      const nb = this.nodes.get(b);
      if (!na || !nb) throw new Error(`unknown node: ${a} or ${b}`);
      const geometry = opts.geometry || [{ x: na.x, y: na.y }, { x: nb.x, y: nb.y }];
      let polyLen = 0;
      for (let i = 1; i < geometry.length; i++) {
        polyLen += Math.hypot(geometry[i].x - geometry[i - 1].x, geometry[i].y - geometry[i - 1].y);
      }
      const length = opts.length ?? polyLen;
      const edge = { id: this.edges.length, a, b, length, geometry, ads: opts.ads || [] };
      this.edges.push(edge);
      this.adj.get(a).push(edge);
      this.adj.get(b).push(edge);
      return edge;
    }

    neighbors(id) {
      return this.adj.get(id) || [];
    }
  }

  /** 간선 하나가 담고 있는 광고 노출 가치의 합. */
  function edgeAdScore(edge) {
    let sum = 0;
    for (const ad of edge.ads) sum += ad.value;
    return sum;
  }

  // ---- 이진 최소 힙 (다익스트라용) ----
  function heapPush(heap, item) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  }

  function heapPop(heap) {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  }

  /**
   * 다익스트라 최단(최소 비용) 경로.
   * costFn(edge)은 항상 0 이상이어야 한다.
   * @returns {null | { path, edges, length, cost, adScore }}
   */
  function dijkstra(graph, start, goal, costFn = e => e.length) {
    if (!graph.nodes.has(start) || !graph.nodes.has(goal)) return null;
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const done = new Set();
    const heap = [[0, start]];

    while (heap.length) {
      const [d, u] = heapPop(heap);
      if (done.has(u)) continue;
      done.add(u);
      if (u === goal) break;
      for (const e of graph.neighbors(u)) {
        const v = e.a === u ? e.b : e.a;
        if (done.has(v)) continue;
        const c = costFn(e);
        if (!(c >= 0)) throw new Error(`negative or invalid edge cost: ${c}`);
        const nd = d + c;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          prev.set(v, { node: u, edge: e });
          heapPush(heap, [nd, v]);
        }
      }
    }

    if (!done.has(goal)) return null;

    const path = [goal];
    const edges = [];
    let cur = goal;
    while (cur !== start) {
      const p = prev.get(cur);
      edges.push(p.edge);
      path.push(p.node);
      cur = p.node;
    }
    path.reverse();
    edges.reverse();

    let length = 0;
    let adScore = 0;
    for (const e of edges) {
      length += e.length;
      adScore += edgeAdScore(e);
    }
    return { path, edges, length, cost: dist.get(goal), adScore };
  }

  return { Graph, dijkstra, edgeAdScore };
});
