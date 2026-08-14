# 원본 데이터 출처

| 파일 | 내용 | 출처 | 라이선스 |
|---|---|---|---|
| `seoul-roads.pbf` | 서울 전역 실제 도로 그래프 (노드 324,752 · way 76,979) | OpenStreetMap — [anvaka/index-large-cities](https://github.com/anvaka/index-large-cities) (city-roads 캐시, gh-pages 브랜치 `data/3602297418.pbf`) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) © OpenStreetMap contributors |
| `roads-seoul.geojson` | 서울 용산 일대 도로망 (LineString 94개) | OpenStreetMap — [openlayers/openlayers](https://github.com/openlayers/openlayers) 예제 데이터 (overpass-turbo 추출본) | ODbL 1.0 © OpenStreetMap contributors |
| `seoul_bus_stations_utf8.csv` | 서울시 버스정류소 위치정보 11,180곳 (정류소명·경위도) | 서울 열린데이터광장 — [Just-Kaggle/labs](https://github.com/Just-Kaggle/labs) 미러 (CP949 → UTF-8 변환) | 공공데이터 (서울특별시) |
| `seoul_subway_stations_utf8.csv` | 서울시 지하철역 좌표 (역명·호선·경위도) | 서울 열린데이터광장 — [Just-Kaggle/labs](https://github.com/Just-Kaggle/labs) 미러 (CP949 → UTF-8 변환) | 공공데이터 (서울특별시) |

`scripts/build-real-data.js` 가 이 파일들을 읽어 `web/data/<지역>.js` 를 생성한다.
`seoul-roads.pbf` 의 스키마는 `scripts/lib/place-pbf.js` 참고 (의존성 없는 디코더 포함).

## 광고 매체 모델링 근거

- **버스쉘터**: 실제 옥외광고(OOH) 매체다. 정류소 좌표를 빌보드·쉘터 광고
  지점으로 사용한다.
- **지하철역**: 역 출입구·역사 미디어보드는 고가치 디지털 매체다. 역 좌표
  기준 가시권을 넓게(110m) 잡는다.
- 역 인접 정류소(이름에 '역' 포함)는 유동인구가 많아 디지털 등급으로 분류한다.
