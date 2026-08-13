# 원본 데이터 출처

| 파일 | 내용 | 출처 | 라이선스 |
|---|---|---|---|
| `roads-seoul.geojson` | 서울 용산 일대 실제 도로망 (LineString 94개) | OpenStreetMap — [openlayers/openlayers](https://github.com/openlayers/openlayers) 예제 데이터 (overpass-turbo 추출본) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) © OpenStreetMap contributors |
| `seoul_bus_stations_utf8.csv` | 서울시 버스정류소 위치정보 11,180곳 (정류소명·경위도) | 서울 열린데이터광장 — [Just-Kaggle/labs](https://github.com/Just-Kaggle/labs) 미러 (CP949 → UTF-8 변환) | 공공데이터 (서울특별시) |

`scripts/build-real-data.js` 가 이 두 파일을 읽어 `web/data/yongsan.js` 를 생성한다.

버스정류소를 광고 매체로 쓰는 근거: 버스쉘터는 실제 옥외광고(OOH) 매체이며,
역 인접 정류소는 유동인구가 많아 고가치 디지털 미디어보드로 분류했다.
