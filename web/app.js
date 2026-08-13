/* ADRO 광고 로드 데모 UI */
(function () {
  'use strict';

  const { buildDemoCity, shortestRoute, adRoadRoute, estimateReward, edgeAdScore } = window.ADRO;

  const city = buildDemoCity();
  const g = city.graph;

  const state = {
    start: 'n6_1',
    goal: 'n1_9',
    maxDetour: 0.3,
    clickPhase: 0, // 0: 다음 클릭이 출발지, 1: 다음 클릭이 도착지
  };

  const canvas = document.getElementById('map');
  const ctx = canvas.getContext('2d');

  // ---- 좌표 변환 ----
  let view = { scale: 1, ox: 0, oy: 0 };

  function computeView() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of g.nodes.values()) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
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

  const px = n => n.x * view.scale + view.ox;
  const py = n => n.y * view.scale + view.oy;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeView();
    render();
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

  function edgeEnds(e) {
    return [g.nodes.get(e.a), g.nodes.get(e.b)];
  }

  function strokeRoute(route, style) {
    if (!route) return;
    ctx.beginPath();
    for (let i = 0; i < route.path.length; i++) {
      const n = g.nodes.get(route.path[i]);
      i === 0 ? ctx.moveTo(px(n), py(n)) : ctx.lineTo(px(n), py(n));
    }
    Object.assign(ctx, style.props);
    ctx.setLineDash(style.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawPin(nodeId, color, label) {
    const n = g.nodes.get(nodeId);
    const x = px(n), y = py(n);
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

  function adMarkerPos(e, ad) {
    const [a, b] = edgeEnds(e);
    const x = a.x + (b.x - a.x) * ad.t;
    const y = a.y + (b.y - a.y) * ad.t;
    // 도로에서 살짝 비켜 세운다
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const off = 9 / view.scale;
    return { x: (x + nx * ad.side * off) * view.scale + view.ox, y: (y + ny * ad.side * off) * view.scale + view.oy };
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
      const [a, b] = edgeEnds(e);
      const alpha = Math.min(0.42, 0.08 + (s / e.length) * 0.9);
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
      ctx.strokeStyle = `rgba(${COLORS.heat}, ${alpha})`;
      ctx.lineWidth = 13;
      ctx.stroke();
    }

    // 도로
    for (const e of g.edges) {
      const [a, b] = edgeEnds(e);
      ctx.beginPath();
      ctx.moveTo(px(a), py(a));
      ctx.lineTo(px(b), py(b));
      ctx.strokeStyle = COLORS.street;
      ctx.lineWidth = 5;
      ctx.stroke();
    }

    // 경로
    strokeRoute(routes.short, { props: { strokeStyle: COLORS.short, lineWidth: 3.5 }, dash: [7, 7] });
    strokeRoute(routes.ad, { props: { strokeStyle: COLORS.ad, lineWidth: 6 } });

    // 광고 마커
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
      const d = Math.hypot(px(n) - mx, py(n) - my);
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
    let s, t, tries = 0;
    do {
      s = ids[Math.floor(Math.random() * ids.length)];
      t = ids[Math.floor(Math.random() * ids.length)];
      tries++;
    } while ((s === t || farApart(s, t) < 400) && tries < 50);
    state.start = s;
    state.goal = t;
    state.clickPhase = 0;
    recompute();
  });

  function farApart(a, b) {
    const na = g.nodes.get(a), nb = g.nodes.get(b);
    return Math.hypot(na.x - nb.x, na.y - nb.y);
  }

  window.addEventListener('resize', resize);
  resize();
  recompute();
})();
