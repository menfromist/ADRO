/* ADRO 광고 로드 데모 UI */
(function () {
  'use strict';

  const { buildDemoCity, buildCityFromData, shortestRoute, adRoadRoute, estimateReward, edgeAdScore } = window.ADRO;

  // ---- 지역 ----
  const REGIONS = {
    virtual: () => {
      const city = buildDemoCity();
      return { graph: city.graph, name: '가상 도심', attribution: [], adLabels: false };
    },
  };
  for (const [key, data] of Object.entries(window.ADRO_REGIONS || {})) {
    REGIONS[key] = () => ({ ...buildCityFromData(data), adLabels: true });
  }

  let city = null;
  let g = null;

  const state = { start: null, goal: null, maxDetour: 0.3, clickPhase: 0 };

  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');

  // 그래프에서 가장 멀리 떨어진 두 노드를 기본 출발/도착으로 쓴다.
  function defaultEndpoints() {
    const nodes = [...g.nodes.values()];
    let best = [nodes[0].id, nodes[nodes.length - 1].id, -1];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d > best[2]) best = [nodes[i].id, nodes[j].id, d];
      }
    }
    return best;
  }

  function setRegion(key) {
    city = REGIONS[key]();
    g = city.graph;
    if (key === 'virtual') {
      state.start = 'n6_1';
      state.goal = 'n1_9';
    } else if (city.defaults) {
      state.start = city.defaults.start;
      state.goal = city.defaults.goal;
    } else {
      const [s, t] = defaultEndpoints();
      state.start = s;
      state.goal = t;
    }
    state.clickPhase = 0;
    document.getElementById('attrib').innerHTML =
      city.attribution.map(a => `<div>${a}</div>`).join('');
    computeView();
    recompute();
  }

  // ---- 좌표 변환 ----
  let view = { scale: 1, ox: 0, oy: 0 };

  function computeView() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of g.edges) {
      for (const p of e.geometry) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
    }
    const pad = 34;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY));
    view = {
      scale,
      ox: (w - (maxX - minX) * scale) / 2 - minX * scale,
      oy: (h - (maxY - minY) * scale) / 2 - minY * scale,
    };
  }

  const sx = x => x * view.scale + view.ox;
  const sy = y => y * view.scale + view.oy;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (g) {
      computeView();
      render();
    }
  }

  // ---- 경로 계산 ----
  let routes = { short: null, ad: null };

  function recompute() {
    routes.short = shortestRoute(g, state.start, state.goal);
    routes.ad = adRoadRoute(g, state.start, state.goal, { maxDetourRatio: state.maxDetour });
    render();
    updatePanel();
  }

  // ---- 렌더링 ----
  const COLORS = {
    street: '#e3ddd2',
    heat: '232, 89, 12',
    short: '#7a8699',
    ad: '#e8590c',
    digital: '#e8590c',
    billboard: '#b23c07',
    storefront: '#f2a35c',
  };

  function tracePolyline(geometry) {
    ctx.beginPath();
    geometry.forEach((p, i) => {
      i === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y));
    });
  }

  function strokeRoute(route, style) {
    if (!route) return;
    ctx.beginPath();
    for (let i = 0; i < route.edges.length; i++) {
      const e = route.edges[i];
      const forward = e.a === route.path[i];
      const geom = forward ? e.geometry : [...e.geometry].reverse();
      geom.forEach((p, j) => {
        i === 0 && j === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y));
      });
    }
    Object.assign(ctx, style.props);
    ctx.setLineDash(style.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPin(nodeId, color, label) {
    const n = g.nodes.get(nodeId);
    const x = sx(n.x), y = sy(n.y);
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
  }

  // 간선 위 t 지점의 좌표(월드)와 진행 방향
  function pointAlongEdge(e, t) {
    const target = t * e.length;
    let acc = 0;
    for (let i = 1; i < e.geometry.length; i++) {
      const a = e.geometry[i - 1], b = e.geometry[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + seg >= target || i === e.geometry.length - 1) {
        const u = Math.max(0, Math.min(1, (target - acc) / (seg || 1e-9)));
        return {
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
          dx: (b.x - a.x) / (seg || 1),
          dy: (b.y - a.y) / (seg || 1),
        };
      }
      acc += seg;
    }
    return { ...e.geometry[0], dx: 1, dy: 0 };
  }

  let drawnLabels = new Set();

  function adMarkerPos(e, ad) {
    const p = pointAlongEdge(e, ad.t);
    const off = 9 / view.scale;
    return {
      x: sx(p.x + -p.dy * ad.side * off),
      y: sy(p.y + p.dx * ad.side * off),
    };
  }

  function drawAd(e, ad) {
    const { x, y } = adMarkerPos(e, ad);
    const r = 2.4 + ad.value * 0.22;
    ctx.fillStyle = COLORS[ad.type];
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ad.type === 'billboard') {
      ctx.rect(x - r, y - r * 0.75, r * 2, r * 1.5);
    } else if (ad.type === 'digital') {
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r * 1.2);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // 같은 역·정류소 이름이 여러 지점에 걸쳐 있으면 라벨은 한 번만 그린다
    if (city.adLabels && ad.type === 'digital' && ad.label && !drawnLabels.has(ad.label)) {
      drawnLabels.add(ad.label);
      ctx.font = '600 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(ad.label, x + r + 4, y);
      ctx.fillStyle = '#6b3410';
      ctx.fillText(ad.label, x + r + 4, y);
    }
  }

  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 광고 밀집 거리 히트 (아래 깔리는 글로우)
    for (const e of g.edges) {
      const s = edgeAdScore(e);
      if (s <= 0) continue;
      const alpha = Math.min(0.42, 0.08 + (s / e.length) * 0.9);
      tracePolyline(e.geometry);
      ctx.strokeStyle = `rgba(${COLORS.heat}, ${alpha})`;
      ctx.lineWidth = 13;
      ctx.stroke();
    }

    // 도로
    for (const e of g.edges) {
      tracePolyline(e.geometry);
      ctx.strokeStyle = COLORS.street;
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    // 경로
    strokeRoute(routes.short, { props: { strokeStyle: COLORS.short, lineWidth: 3.5 }, dash: [7, 7] });
    strokeRoute(routes.ad, { props: { strokeStyle: COLORS.ad, lineWidth: 6 } });

    // 광고 마커
    drawnLabels = new Set();
    for (const e of g.edges) for (const ad of e.ads) drawAd(e, ad);

    drawPin(state.start, '#2f9e44', '출');
    drawPin(state.goal, '#e03131', '도');
  }

  // ---- 패널 ----
  const fmt = new Intl.NumberFormat('ko-KR');
  const $ = id => document.getElementById(id);

  function fillCard(prefix, route) {
    const r = estimateReward(route);
    $(prefix + 'Reward').textContent = fmt.format(r.totalPoints);
    $(prefix + 'Dist').textContent = route.length >= 1000
      ? (route.length / 1000).toFixed(2) + 'km'
      : Math.round(route.length) + 'm';
    $(prefix + 'Time').textContent = Math.round(r.walkTimeMin) + '분';
    $(prefix + 'Steps').textContent = fmt.format(r.steps) + '걸음';
    $(prefix + 'Ads').textContent = `${r.adCount}개 · ${fmt.format(r.adPoints)}P`;
    return r;
  }

  function updatePanel() {
    if (!routes.short || !routes.ad) return;
    const ad = fillCard('ad', routes.ad);
    const sh = fillCard('sh', routes.short);

    const extraM = Math.round(routes.ad.length - routes.short.length);
    const extraMin = Math.max(0, Math.round(ad.walkTimeMin - sh.walkTimeMin));
    const extraP = ad.totalPoints - sh.totalPoints;
    $('diff').innerHTML = extraM <= 0
      ? '최단 경로가 이미 광고 밀집 거리를 지나거나, 허용 우회율 안에 더 나은 길이 없어요.'
      : `<b>${fmt.format(extraM)}m</b>(약 ${extraMin}분) 더 걷는 대신 <b>+${fmt.format(extraP)}P</b> 더 받고, ` +
        `광고 노출은 ${sh.adCount}개 → <b>${ad.adCount}개</b>로 늘어나요.`;
  }

  // ---- 인터랙션 ----
  canvas.addEventListener('click', ev => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    let bestId = null, bestD = 40; // px
    for (const n of g.nodes.values()) {
      const d = Math.hypot(sx(n.x) - mx, sy(n.y) - my);
      if (d < bestD) { bestD = d; bestId = n.id; }
    }
    if (!bestId) return;
    if (state.clickPhase === 0) {
      state.start = bestId;
      state.clickPhase = 1;
    } else {
      if (bestId === state.start) return;
      state.goal = bestId;
      state.clickPhase = 0;
    }
    recompute();
  });

  $('detour').addEventListener('input', ev => {
    state.maxDetour = Number(ev.target.value) / 100;
    $('detourOut').textContent = ev.target.value + '%';
    recompute();
  });

  $('shuffle').addEventListener('click', () => {
    const ids = [...g.nodes.keys()];
    const far = (a, b) => {
      const na = g.nodes.get(a), nb = g.nodes.get(b);
      return Math.hypot(na.x - nb.x, na.y - nb.y);
    };
    let s, t, tries = 0;
    do {
      s = ids[Math.floor(Math.random() * ids.length)];
      t = ids[Math.floor(Math.random() * ids.length)];
      tries++;
    } while ((s === t || far(s, t) < 400 || !shortestRoute(g, s, t)) && tries < 80);
    state.start = s;
    state.goal = t;
    state.clickPhase = 0;
    recompute();
  });

  $('region').addEventListener('change', ev => setRegion(ev.target.value));

  window.addEventListener('resize', resize);
  resize();
  setRegion(document.getElementById('region').value);
})();
