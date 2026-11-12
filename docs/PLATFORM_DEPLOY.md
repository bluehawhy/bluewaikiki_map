# BlueWaikiki 대시보드 연동 시 제약과 순서

## 결정 사항

1. **대시보드 DB 생성 메뉴는 수정하지 않습니다.** 기존 공용 PostgreSQL에서 프로젝트별 DB/계정만 생성합니다.
2. `bluewaikiki_map` 지도 데이터는 **프로젝트 소유 별도 `postgis` 컨테이너**에서만 보관합니다. 지도 API는 공용 PostgreSQL에 접근하지 않습니다.
3. 별도 개발할 사용자/인증 등 A/B 기능만 플랫폼의 `DATABASE_URL`에 연결합니다. 현재는 그 API가 없으며 가짜 인증 경로도 만들지 않습니다.

## 지도 전용 단독 Compose (현 시점 실행 가능한 배포 단위)

- `bash scripts/init-env.sh`로 비밀값 생성 -> `docker compose up -d --build`로 **지도 API와 PostGIS 2개 컨테이너** 생성
- `map` API는 `127.0.0.1:${API_HOST_PORT:-18083}`에만 바인딩
- `postgis`는 호스트 포트 없이 내부 네트워크에서만 접근
- DB 자료는 `map_postgres_data` 볼륨, ZIP은 `./data`에 보관
- API/지도 DB는 다른 공유 프로젝트 DB/스키마에 영향 없음

## 대시보드의 현재 기능 제한 (2026-11 기준)

대시보드 프로젝트 플랫폼은 `bluewaikiki.functions.json`의 `api` Dockerfile을 자동 탐색하지만, **Compose에 선언된 `postgis` 서비스/볼륨은 자동 시작하지 않습니다.** 따라서 플랫폼 화면에서 API Function만 배포해도 전용 PostGIS/영구 원본 저장소가 만들어지지 않습니다.

현재 플랫폼에서 Function을 별도로 운영하려면 아래 인프라가 **별도로** 확보되어야 합니다.

- 독립 PostGIS 컨테이너와 영구 볼륨, 영속성 있는 전용 Docker 네트워크
- Function 재배포에도 유지되는 지도 DB 접근 경로 및 `MAP_DATABASE_URL` Runtime Secret
- ZIP 수집/보관을 위한 `/data` 영구 마운트(미지원 상태라면 `MAP_RUN_SCHEDULER=0`)
- 지도 API용 `MAP_API_TOKEN` Runtime Secret
- Function의 포트 `8080`, 경로 prefix는 `PUBLIC_API_URL`/`BASE_PATH`로 처리

**주의:** 플랫폼이 자동 주입하는 `DATABASE_URL`은 공용 PostgreSQL 프로젝트 DB를 가리킵니다. `app/db.py`는 이 값을 의도적으로 무시합니다. 지도 Function에서 `MAP_DATABASE_URL` 없이 공유 DB로 대체 연결하지 않습니다. DB 호스트를 Function에서 실제 접근 가능하게 만든 후에만 배포합니다.

저장소만 추가하면 모든 Docker가 자동 배포된다고 안내하지 않습니다. 온전한 대시보드 일괄 배포를 위해서는 대시보드의 프로젝트별 Compose + 네트워크/볼륨 관리 지원이 별도로 필요합니다. 공용 PostgreSQL의 PostGIS 설치는 요청하지 않습니다.
