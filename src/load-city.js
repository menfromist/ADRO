/*
 * 직렬화된 도시 데이터(scripts/build-real-data.js 출력)를 그래프로 로드한다.
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

  function buildCityFromData(data) {
    const g = new Graph();
    for (const n of data.nodes) g.addNode(n.id, n.x, n.y);
    for (const e of data.edges) {
      g.addEdge(e.a, e.b, { length: e.length, ads: e.ads, geometry: e.geometry });
    }
    return {
      graph: g,
      name: data.name,
      attribution: data.attribution || [],
      defaults: data.defaults || null,
    };
  }

  return { buildCityFromData };
});
