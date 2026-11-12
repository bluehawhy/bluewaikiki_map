# 지도 미리보기 (프레임워크 미선정)

현재는 버스타이머의 **실제 벡터 지도 스타일**을 그대로 복제하여 보여주는 HTML/CSS/JavaScript 지도 화면입니다.

## 사용 기술
- 렌더러: MapLibre GL JS 6.17.0 (ES Module CDN)
- 스타일: `web/styles/bus_transit_style.json` — `bluehawhy/busstop_timer/assets/map/bus_transit_style.json` 원본에서 분기한 사용자 지정 스타일. 건물·배경 구조는 유지하고 도로 폭/외곽선 규칙을 개편.
- 벡터 타일: OpenFreeMap `https://tiles.openfreemap.org/planet` (OpenMapTiles 스키마, OSM 원천)
- 초기 위치: 부산 연제구 `[129.0756, 35.1796]`, 줌 14 (버스타이머와 동일)
- 확대·축소 버튼 아래 **현재 줌 레벨(ZOOM 14.0 형식)** 표시. 마우스 휠·터치 핀치·버튼·초기 위치 복귀·2D/3D 모드 전환에 따른 줌 변경을 소수점 첫째 자리까지 실시간 갱신합니다.
- 오른쪽 **3D** 버튼: 건물 돌출(`fill-extrusion`), 지도 기울기 58°와 회전 -16° 적용. 버튼이 **2D**로 바뀌며 다시 누르면 평면 지도로 돌아옴. 초기 위치 복귀는 현재 2D/3D 모드를 유지.
- **건물 속성에 따라 색상 자동 구분**: 타일에 속성이 있는 건물은 연한 주황 `#F5C79F`, 불투명도 0.7(투명도 30%). 속성이 전혀 없는 건물은 베이지 `#DDCEB5`, 불투명도 0.5(투명도 50%). 2D 건물 외곽과 3D 건물 벽·지붕에 동일 적용.
- 건물 속성 판단 키: `render_height`, `render_min_height`, `colour`, `hide_3d`, `name`, `name:ko`. **OpenMapTiles는 줌 14 이상에서 기본 높이(예: 5m)를 자동 제공할 수 있어, 대부분의 건물이 주황색이 될 수 있음.** 주황색은 건물의 주소나 상세 용도 정보가 있다는 의미가 아님.
- MapLibre의 `fill-extrusion-opacity`는 레이어 단위로만 적용되므로 3D 건물을 **속성 없음(불투명도 0.5) / 속성 있음(불투명도 0.7)** 두 레이어로 분리. 2D는 속성식으로 색상·투명도를 적용.
- 3D에서 건물 뒤/위로 겹쳐 보이는 도로명 텍스트는 `road-labels` 레이어를 숨겨 제거. 2D에서는 도로명을 다시 표시.
- 3D 건물은 OpenMapTiles `building`의 `render_height`·`render_min_height`를 활용하며 데이터에 높이가 없다면 기본 9m를 사용. `hide_3d`가 참인 건물 외곽은 3D에서 제외.
- **지형 고도(DEM), 위성 영상, 별도 3D 모델은 사용하지 않음.** OSM 건물 높이는 지역별로 정확도가 다를 수 있으며 정밀 실측 정보가 아님.
- 3D 레이어는 `web/map.js`에서 실행 시 추가하며, 2D/3D가 공유하는 도로 색상·너비는 `web/styles/bus_transit_style.json`에서 관리함.
- **도로/건물 클릭 속성 모달**: `queryRenderedFeatures()`로 현재 렌더링된 `transportation` 도로 또는 `building` 건물을 검색하고, 클릭 객체를 주황색으로 강조. 속성 전체와 실제 GeoJSON(타일 범위 기하)을 표시하며 JSON 복사 가능. 2D/3D 모두 동일하게 작동.
- 작은 도로는 클릭 지점 주변 12px에서 가까운 선형을 찾아 선택. 건물 폴리곤/3D 건물과 겹치면 건물 선택을 우선함.
- 조회 결과는 타일에 포함된 속성만 표시하며 원본 OSM 전체 속성, 실제 도로 전체 형상, 정밀 실측 높이를 보장하지 않음.
- 정류장·실시간 교통정보·사용자 계정은 표시하지 않음. 추후 별도 API 연동.
- DB 및 다운로드 기능 미구성 상태에서도 지도 화면은 표시됨. 지도 타일/글리프 및 CDN 네트워크는 필요.

## 도로 차로 수 기반 너비·중앙선·차로 구분선

차로 수는 **OSM 실측값이 아닌 지도 디자인용 가정값**이며, 지도 표시 폭의 단위는 실제 미터가 아닌 화면 픽셀(px)입니다.

| 지도 레이어 | `class` | 일반도로 왕복 총 차로 | `oneway = 1 / -1`일 때 표시 차로 | 일반도로 내부 폭 (줌 17) | 일방통행 폭 (줌 17) |
|---|---|---:|---:|---:|---:|
| `major-roads` | `motorway` | 6 (3+3) | 3 | 19.2px | 9.6px |
| `major-roads` | `trunk`, `primary` | 4 (2+2) | 2 | 12.8px | 6.4px |
| `major-roads` | `secondary`, `tertiary` | 2 (1+1) | 1 | 6.4px | 3.2px |
| `local-roads` | `minor`, `service` | 1 (왕복 공유) | 별도 차로선 없음 | **1.6px** | **0.8px** |
| `pedestrian-paths` | `path` | 0 | 적용 없음 | 기존 너비 | 기존 너비 |

- **`oneway=1` 또는 `oneway=-1`** 인 도로는 해당 방향 전용 선형으로 간주해 위 기본 도로 폭을 절반(0.5배)으로 적용합니다. `oneway=0` 또는 속성이 없으면 왕복도로 기본 폭을 사용합니다.
- **왕복 1차로**(`minor`·`service`·호환용 `residential`)는 예전 1차로 너비(줌 17: 3.2px)에서 다시 **0.5배**로 축소했습니다. 이 규칙과 `oneway` 반감은 독립적으로 적용됩니다.
- 왕복 6차로(3+3): 황색 실선 중앙선 1개 + 회색 점선 차로 구분선 4개. 왕복 4차로(2+2): 중앙선 1개 + 점선 2개. 왕복 2차로(1+1): 중앙선 1개. 왕복 1차로: 내부선 없음.
- 일방통행으로 축소된 3차로: 점선 2개, 2차로: 점선 1개, 1차로와 0.5배 폭의 소형도로: 내부선 없음. **일방통행 도로에는 황색 중앙선을 그리지 않습니다.**
- 도로 내부는 **아스팔트 회색 `#656C74`**, 도로 양쪽 외곽은 **짙은 회색 `#414953`**로 채웁니다. 중앙선은 **황색 `#F4C542` 실선**, 차로 구분선은 **백색 `#FFFFFF` 점선**으로 표시합니다. 도로명은 어두운 노면에서 읽을 수 있도록 밝은 글자와 어두운 테두리를 사용합니다.
- 내부 차로선은 별도 `road-lane-*` 벡터 스타일 레이어로 도로 노면 위에 그립니다. **중앙선은 줌 15부터, 차로 구분선은 줌 15.5부터** 표시하여 멀리서 차로선이 겹쳐 보이지 않도록 합니다.
- 우측 **⚙ 도로 폭 설정** 위젯에서는 **아스팔트 도로 전체 폭**을 기본 대비 0.5~3배(0.1배 단위), **황색 중앙선** 두께를 0.2~3px(줌 17 기준, 0.05px 단위)로 각각 조절할 수 있습니다. 기본값은 도로 1.0배·중앙선 0.65px입니다.
- 도로 폭 조절 시 `major-roads`, `local-roads`의 아스팔트 노면 및 두 외곽선 레이어의 `line-width`, 점선 차로 구분선의 `line-offset`을 **같은 배율로 변경**합니다. 차로 구분선의 흰색 실선 두께는 기본값을 유지하고, 가상 차로 수·`oneway` 절반 폭·줌 배율은 보존합니다.
- 슬라이더 이동 시 `setPaintProperty`로 즉시 적용하고 **기본값 복원**을 지원합니다. `localStorage` 키는 `bluewaikiki-map-road-widths-v2`; 이전 저장 값이 있다면 중앙선 두께만 복구하고 과거 차로 구분선 두께 설정은 도로 폭으로 오해하지 않도록 이전하지 않습니다. 브라우저별로 저장되며 DB나 서버에는 저장하지 않습니다.
- 렌더링 순서는 **도로 외곽선 → 아스팔트 노면 → 중앙선·차로 구분선**입니다. 교차점에서도 동일한 도로 색을 사용해 노면은 이어지지만, 타일에 교차로 면이나 차선 단절 위치가 없으므로 교차로 중앙의 차로선 일부는 겹칠 수 있습니다(교차로별 정밀 처리 미구현).
- 화면 폭의 줌별 차로 배율: 줌 10 = 0.24px, 줌 14 = 1px, 줌 17 = 3.2px, 줌 19 = 6.4px. 확대/축소 시 너비와 구분선의 `line-offset`이 같은 비율로 조절됩니다. 왕복 1차로에는 기본 차로 배율 0.5가 적용됩니다.
- **고속도로·주요 간선도로**(`motorway`·`trunk`)는 진한 황갈색 외곽선을 내부 폭의 1.33배로 적용하고, 다른 주요도로는 1.12배, 일반도로는 1.2배를 적용합니다.
- 현재 스타일 레이어에 연결되지 않은 `track`, `raceway`, `busway`, `bus_guideway`, `ferry`의 시각화는 추가하지 않았습니다. `surface`별 스타일도 이번 변경에서 그대로 유지합니다.
- 외곽선, 중앙선, 차로선은 모두 **렌더링용 도형**입니다. 실제 도로의 폭·중앙분리대·차선 개수·방향 정확성을 보장하지 않으며 기존 도로 선택 모달은 `transportation` 원본 속성을 표시합니다.

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
- 반환 객체는 `map, zoomIn, zoomOut, reset, set3DEnabled, toggle3D, is3DEnabled, setRoadStyleWidths, getRoadStyleWidths, clearFeatureSelection, resize, destroy`를 제공합니다. 프레임워크의 버튼 상태는 `onModeChange`, 클릭 객체는 `onFeatureSelect`/`onFeatureClear` 콜백으로 전달됩니다. 모달은 `web/main.js`, 선택·강조는 `web/feature-inspector.js`가 담당합니다.
- React/Vue/Svelte에서는 마운트 이후 `createMap`을 호출하고 언마운트에서 `destroy()`를 호출하면 됩니다.
- 현재 `web/main.js`만 버튼/UI 이벤트를 연결하므로 화면 프레임워크를 바꿀 때 `map.js`와 스타일 JSON은 재사용 가능합니다.
- Flutter 등 다른 렌더러에서는 동일한 **MapLibre Style JSON**과 타일 출처를 사용할 수 있지만, JS 렌더러 코드를 그대로 실행하는 것은 아닙니다.

## 서버 DB와 분리
공용 `DATABASE_URL` 및 독립 PostGIS `MAP_DATABASE_URL`은 지도 미리보기에 필요하지 않습니다. 향후 자체 데이터 제공 시 스타일의 source URL을 점진적으로 바꿀 수 있도록 스타일은 별도 JSON으로 유지합니다.

## 출처
- OpenFreeMap · OpenMapTiles · © OpenStreetMap contributors
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- 버스타이머 원본 스타일: https://github.com/bluehawhy/busstop_timer/blob/main/assets/map/bus_transit_style.json
