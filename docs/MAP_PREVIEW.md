# 지도 미리보기 (프레임워크 미선정)

현재는 버스타이머의 **실제 벡터 지도 스타일**을 그대로 복제하여 보여주는 HTML/CSS/JavaScript 지도 화면입니다.

## 사용 기술
- 렌더러: MapLibre GL JS 6.17.0 (ES Module CDN)
- 스타일: `web/styles/bus_transit_style.json` — `bluehawhy/busstop_timer/assets/map/bus_transit_style.json` 원본과 동일
- 벡터 타일: OpenFreeMap `https://tiles.openfreemap.org/planet` (OpenMapTiles 스키마, OSM 원천)
- 초기 위치: 부산 연제구 `[129.0756, 35.1796]`, 줌 14 (버스타이머와 동일)
- 오른쪽 **3D** 버튼: 건물 돌출(`fill-extrusion`), 지도 기울기 58°와 회전 -16° 적용. 버튼이 **2D**로 바뀌며 다시 누르면 평면 지도로 돌아옴. 초기 위치 복귀는 현재 2D/3D 모드를 유지.
- **건물 속성에 따라 색상 자동 구분**: 타일에 속성이 있는 건물은 연한 주황 `#F5C79F`, 불투명도 0.7(투명도 30%). 속성이 전혀 없는 건물은 베이지 `#DDCEB5`, 불투명도 0.5(투명도 50%). 2D 건물 외곽과 3D 건물 벽·지붕에 동일 적용.
- 건물 속성 판단 키: `render_height`, `render_min_height`, `colour`, `hide_3d`, `name`, `name:ko`. **OpenMapTiles는 줌 14 이상에서 기본 높이(예: 5m)를 자동 제공할 수 있어, 대부분의 건물이 주황색이 될 수 있음.** 주황색은 건물의 주소나 상세 용도 정보가 있다는 의미가 아님.
- MapLibre의 `fill-extrusion-opacity`는 레이어 단위로만 적용되므로 3D 건물을 **속성 없음(불투명도 0.5) / 속성 있음(불투명도 0.7)** 두 레이어로 분리. 2D는 속성식으로 색상·투명도를 적용.
- 3D에서 건물 뒤/위로 겹쳐 보이는 도로명 텍스트는 `road-labels` 레이어를 숨겨 제거. 2D에서는 도로명을 다시 표시.
- 3D 건물은 OpenMapTiles `building`의 `render_height`·`render_min_height`를 활용하며 데이터에 높이가 없다면 기본 9m를 사용. `hide_3d`가 참인 건물 외곽은 3D에서 제외.
- **지형 고도(DEM), 위성 영상, 별도 3D 모델은 사용하지 않음.** OSM 건물 높이는 지역별로 정확도가 다를 수 있으며 정밀 실측 정보가 아님.
- 3D 레이어는 `web/map.js`에서 실행 시 추가하므로 기존 버스타이머의 2D 스타일 JSON을 변경하지 않음.
- **도로/건물 클릭 속성 모달**: `queryRenderedFeatures()`로 현재 렌더링된 `transportation` 도로 또는 `building` 건물을 검색하고, 클릭 객체를 주황색으로 강조. 속성 전체와 실제 GeoJSON(타일 범위 기하)을 표시하며 JSON 복사 가능. 2D/3D 모두 동일하게 작동.
- 작은 도로는 클릭 지점 주변 12px에서 가까운 선형을 찾아 선택. 건물 폴리곤/3D 건물과 겹치면 건물 선택을 우선함.
- 조회 결과는 타일에 포함된 속성만 표시하며 원본 OSM 전체 속성, 실제 도로 전체 형상, 정밀 실측 높이를 보장하지 않음.
- 정류장·실시간 교통정보·사용자 계정은 표시하지 않음. 추후 별도 API 연동.
- DB 및 다운로드 기능 미구성 상태에서도 지도 화면은 표시됨. 지도 타일/글리프 및 CDN 네트워크는 필요.

## 대시보드 웹 빌드 (DB 설치 불필요)

프로젝트 `main` 브랜치에 루트 `package.json`의 `build:web` 스크립트를 추가했습니다.

1. BlueWaikiki 대시보드에서 GitHub 저장소 `bluehawhy/bluewaikiki_map` / `main` 연결
2. 해당 프로젝트의 **웹 빌드** 실행
3. 대시보드가 자동 생성된 `dist/index.html`을 `https://app.bluewaikiki.top/<slug>/`에 게시

`scripts/build-web.mjs`는 `web/` 전체를 `dist/`로 복사하기만 합니다. 런타임 npm 패키지는 없으며 DB, PostGIS, 지도 ZIP 다운로드, Docker Compose 실행이 필요하지 않습니다.

`index.html`의 `./main.js`, `./site.css`, `map.js`에서 참조하는 `./styles/*` 등 **상대 경로**는 대시보드의 `/<slug>/` 하위 경로에서도 그대로 동작하도록 유지합니다.

## 실행
- 독립 정적 페이지: `cd web && python3 -m http.server 8000` 다음 `http://localhost:8000`
- 기존 FastAPI: `python -m app.runner` 다음 `http://localhost:8080/` (필요한 Python 패키지 설치 시)
- Dashboard Function: 배포 시 `https://api.bluewaikiki.top/<project-slug>/` (별도 프로젝트 등록 및 배포 필요)
- `/health`는 **웹 서버 준비 상태**만 조회. PostGIS 준비 확인은 Bearer 토큰을 사용하는 `/v1/health/db`.
- HTML 파일을 `file://`로 직접 여는 방식은 모듈/스타일 로딩 문제를 일으킬 수 있으므로 HTTP 서버 권장.

## 프레임워크 전환
- `web/map.js`의 `createMap({lib, container, styleUrl, onReady, onError})`를 사용합니다.
- 반환 객체는 `map, zoomIn, zoomOut, reset, set3DEnabled, toggle3D, is3DEnabled, clearFeatureSelection, resize, destroy`를 제공합니다. 프레임워크의 버튼 상태는 `onModeChange`, 클릭 객체는 `onFeatureSelect`/`onFeatureClear` 콜백으로 전달됩니다. 모달은 `web/main.js`, 선택·강조는 `web/feature-inspector.js`가 담당합니다.
- React/Vue/Svelte에서는 마운트 이후 `createMap`을 호출하고 언마운트에서 `destroy()`를 호출하면 됩니다.
- 현재 `web/main.js`만 버튼/UI 이벤트를 연결하므로 화면 프레임워크를 바꿀 때 `map.js`와 스타일 JSON은 재사용 가능합니다.
- Flutter 등 다른 렌더러에서는 동일한 **MapLibre Style JSON**과 타일 출처를 사용할 수 있지만, JS 렌더러 코드를 그대로 실행하는 것은 아닙니다.

## 서버 DB와 분리
공용 `DATABASE_URL` 및 독립 PostGIS `MAP_DATABASE_URL`은 지도 미리보기에 필요하지 않습니다. 향후 자체 데이터 제공 시 스타일의 source URL을 점진적으로 바꿀 수 있도록 스타일은 별도 JSON으로 유지합니다.

## 출처
- OpenFreeMap · OpenMapTiles · © OpenStreetMap contributors
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- 버스타이머 원본 스타일: https://github.com/bluehawhy/busstop_timer/blob/main/assets/map/bus_transit_style.json
