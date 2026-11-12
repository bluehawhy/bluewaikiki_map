# BlueWaikiki Map: 하이브리드 데이터베이스 아키텍처

## DB 구분 (확정)

| 역할 | 실행 위치 | 연결 정보 | 접근 범위 |
|---|---|---|---|
| 지도 수집/변환/조회 API | 지도 프로젝트 `map` Docker | `MAP_DATABASE_URL` 또는 `PG*` | **독립 PostGIS만** |
| 지도 원본/버전/공간 인덱스 | 지도 프로젝트 `postgis` Docker + 영구 볼륨 | 내부 Docker 네트워크 | 지도 서비스 전용 |
| 향후 사용자/인증/A기능/B기능 | 대시보드 Function(추가 시) | 플랫폼 제공 `DATABASE_URL` | 대시보드 **공용 PostgreSQL의 프로젝트 전용 DB** |

- 공유 DB와 독립 PostGIS는 동시에 사용할 수 있으나 **같은 데이터베이스가 아닙니다.**
- 지도 코드 `app/db.py`는 공유 `DATABASE_URL`을 **읽지 않습니다.** 명시된 지도 DB 연결만 허용합니다.
- 향후 일반 기능용 접점 `app/shared_db.py`는 `DATABASE_URL`만 읽고, 지도 기능은 이 모듈을 사용하지 않습니다. 사용자/인증 API 자체는 아직 구현하지 않았습니다.
- 공용 PostgreSQL 서버의 PostGIS 설치·이미지 교체는 **불필요**하며 시행하지 않습니다.
- 대시보드 DB 생성 버튼/모달은 기존처럼 공용 PostgreSQL 프로젝트 DB만 생성합니다. 독립 PostGIS는 **해당 프로젝트 자체 Compose**로 만듭니다.

## 데이터 수집 구조

```text
[정밀도로지도 제공처] -> (추후 공식 다운로드 어댑터)
  -> data/inbox/<dataset>.zip + <dataset>.json
  -> 야간 01~05시 / 저부하 / 순차 적재
  -> ZIP SHA-256 / SHP sidecar / 좌표계/유효 도형 검사
  -> GDAL ogr2ogr (EPSG:4326) -> PostGIS 임시 스키마
  -> 원본 ZIP data/raw 불변 보관 -> 지도 판본 원자적 전환
  -> GiST 공간 인덱스 -> 인증된 GeoJSON/MVT API
```

실패하면 새 판본을 공개하지 않고, 기존 활성 데이터셋을 계속 제공합니다. `dataset_key` 단위로 지역/제공본을 나누어 갱신합니다. 원본 ZIP과 이전 판본은 자동 삭제하지 않습니다.

## 운영 형태

**독립 Compose(권장):** `compose.yaml`에서 `map` API/수집기와 `postgis` DB 두 컨테이너가 함께 동작합니다. `MAP_API_TOKEN`은 필수이며 DB는 외부 포트로 공개하지 않습니다. 영구 저장소는 지도 데이터용 `./data`와 DB용 named volume을 분리합니다.

**BlueWaikiki 프로젝트 대시보드:** 현행 Functions는 Dockerfile 단위 배포이며, 저장소의 Compose 추가 서비스와 영구 볼륨을 자동으로 배포하지 않습니다. 따라서 대시보드에 지도 API Function을 올리기 전에 **별도 PostGIS Docker의 지속 실행, 네트워크 연결, ZIP 영구 저장 경로**를 갖춰야 합니다. 지도 Function에는 `MAP_DATABASE_URL`을 비밀값으로 따로 주입하고, 공용 `DATABASE_URL`은 미래 일반 API 기능에서만 사용합니다. 이 준비가 없다면 대시보드 등록만으로 지도 DB와 수집 작업이 동작한다고 간주하지 않습니다.

향후 A/B 기능을 추가하면 별도 Function 또는 서비스로 분리하고 `app/shared_db.py`의 연결을 사용합니다. 공유 DB와 PostGIS 사이에 분산 트랜잭션은 없으므로 결합 데이터가 필요하면 ID 기반 조회/애플리케이션 조합을 사용합니다.
