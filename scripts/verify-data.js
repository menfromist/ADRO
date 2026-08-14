#!/usr/bin/env node
/*
 * data-src/MANIFEST.json 에 고정된 체크섬과 실제 파일을 대조한다.
 * 원본 미러가 바뀌거나 파일이 오염되면 빌드 전에 잡아낸다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'data-src');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'MANIFEST.json'), 'utf8'));

let failed = 0;
for (const entry of manifest.files) {
  const p = path.join(ROOT, entry.file);
  if (!fs.existsSync(p)) {
    console.error(`누락: ${entry.file}`);
    failed++;
    continue;
  }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if (sha !== entry.sha256) {
    console.error(`체크섬 불일치: ${entry.file}\n  기대: ${entry.sha256}\n  실제: ${sha}`);
    failed++;
  } else {
    console.log(`확인: ${entry.file}`);
  }
}

if (failed) {
  console.error(`\n${failed}개 파일이 매니페스트와 다릅니다.`);
  process.exit(1);
}
console.log('\n모든 원본 데이터가 매니페스트와 일치합니다.');
