/*
 * anvaka/index-large-cities 의 place.proto 최소 디코더 (의존성 없음).
 *
 * message place {
 *   message node { uint64 id = 1; float lat = 2; float lon = 3; }
 *   message way  { repeated uint64 nodes = 1 [packed]; }
 *   uint32 version = 1; string name = 2; string date = 3; string id = 4;
 *   repeated node nodes = 5; repeated way ways = 6;
 * }
 */
'use strict';

function decodePlace(buf) {
  let pos = 0;
  const readVarint = () => {
    let result = 0n, shift = 0n;
    for (;;) {
      const b = buf[pos++];
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7n;
    }
    return result;
  };

  const nodes = new Map(); // id(string) -> [lon, lat]
  const ways = [];         // [nodeId(string)...]
  let name = '', id = '';

  while (pos < buf.length) {
    const key = Number(readVarint());
    const field = key >> 3, wire = key & 7;
    if (wire === 0) { readVarint(); continue; }
    if (wire === 5) { pos += 4; continue; }
    if (wire === 1) { pos += 8; continue; }

    const len = Number(readVarint());
    const msgEnd = pos + len;
    if (field === 2) { name = buf.toString('utf8', pos, msgEnd); pos = msgEnd; continue; }
    if (field === 4) { id = buf.toString('utf8', pos, msgEnd); pos = msgEnd; continue; }
    if (field === 5) {
      let nid = 0n, lat = 0, lon = 0;
      while (pos < msgEnd) {
        const k = Number(readVarint());
        const f = k >> 3, w = k & 7;
        if (w === 0) { const v = readVarint(); if (f === 1) nid = v; }
        else if (w === 5) { const v = buf.readFloatLE(pos); pos += 4; if (f === 2) lat = v; else if (f === 3) lon = v; }
        else if (w === 2) { pos += Number(readVarint()); }
        else if (w === 1) { pos += 8; }
      }
      nodes.set(nid.toString(), [lon, lat]);
      continue;
    }
    if (field === 6) {
      const wayNodes = [];
      while (pos < msgEnd) {
        const k = Number(readVarint());
        const f = k >> 3, w = k & 7;
        if (f === 1 && w === 2) {
          const pend = pos + Number(readVarint());
          while (pos < pend) wayNodes.push(readVarint().toString());
        } else if (w === 0) readVarint();
        else if (w === 2) pos += Number(readVarint());
        else if (w === 1) pos += 8;
      }
      if (wayNodes.length >= 2) ways.push(wayNodes);
      continue;
    }
    pos = msgEnd;
  }
  return { name, id, nodes, ways };
}

module.exports = { decodePlace };
