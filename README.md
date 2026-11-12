# bluewaikiki_map

BlueWaikiki의 **지도 데이터 수집·보관·조회 전용 프로젝트**. 이 저장소의 독립 PostGIS와 BlueWaikiki 대시보드의 공용 PostgreSQL을 역할별로 병행할 수 있는 **하이브리드 DB 설계**입니다. 지도 기능에 공용 PostgreSQL을 사용하지 않습니다.

## 확정 구조

```text
bluewaikiki_map (프로젝트)
├─ map Docker (FastAPI + GDAL/OGR + 야간 순차 수집기)
│  └─ 전용 MAP_DATABASE_URL 또는 PG* -> postgis Docker
├─ postgis Docker (PostgreSQL 16 + PostGIS, 프로젝트 전용)
│  └─ map_postgres_data 영구 볼륨
├─ data/ (ZIP inbox/raw, 임시 변환 작업: 호스트 영구 경로)
└─ 향후 A/B 기능 API (현재 미구현)
   └─ 대시보드 공용 PostgreSQL의 프로젝트 DB: DATABASE_URL
```

- **공용 PostgreSQL**: 대시보드의 기존 DB 생성 기능 그대로 유지. 사용자·인증·일반 API용. 지도 공간 데이터는 저장하지 않음.
- **독립 PostgreSQL + PostGIS**: `bluewaikiki_map` 프로젝트의 지도 Docker가 자체 생성/관리. 다른 DB에 영향 없이 PostGIS 설치·갱신 가능.
- **선택 모달 없음**: 공유/독립은 프로젝트 생성 시 한쪽을 선택하는 정책이 아니며, 용도별 DB를 동시에 연결할 수 있음.
- **API·수집기는 지도 PostGIS만 접속**: `MAP_DATABASE_URL` 또는 `PG*` 사용; `DATABASE_URL`로 자동 폴백하지 않음. 추후 일반 기능은 `app/shared_db.py`로 공용 DB 연결.

## 초기 실행 (독립 Docker Compose)

```bash
cd bluewaikiki_map
bash scripts/init-env.sh
docker compose up -d --build
```

2개 컨테이너(`map`, `postgis`)가 생성됩니다. `postgis`는 외부 포트를 열지 않으며, API만 `127.0.0.1:18083`으로 바인딩합니다. `.env`는 랜덤 DB 비밀번호/API 토큰을 생성하며 Git에 올리지 않습니다. 실제 서버 실행은 별도로 해야 합니다.

초기부터 자동 로그인을 시도하거나 정밀도로지도 ZIP을 자동 다운로드하지는 않습니다. **공식 다운로드 방식·이용 조건 확인 후** `app/downloader.py`에 어댑터를 연결합니다. 현재는 `data/inbox`에 승인된 ZIP + manifest를 넣으면 야간/저부하 시간대에 처리하는 구조입니다.

### ZIP 파일 투입

	a) `data/inbox/busan-sector-01.zip`을 보관합니다. ZIP에는 적어도 하나의 `.shp/.shx/.dbf/.prj` 세트가 있어야 합니다.
	b) 동일 폴더에 다음 `busan-sector-01.json`을 작성합니다 (SHA-256은 ZIP 실제값).

```json
{
  "dataset_key": "busan-sector-01",
  "version": "2026-11",
  "archive": "busan-sector-01.zip",
  "sha256": "<실제 SHA-256 64자리로 변경>",
  "source_name": "국토지리정보원 정밀도로지도",
  "source_url": "https://map.ngii.go.kr/",
  "attribution": "국토지리정보원",
  "usage_rights": "개별 파일의 이용 조건 확인 후 기재"
}
```

성공하면 원본 ZIP은 `data/raw/<dataset_key>/<version>/<sha256>.zip`으로 보관합니다. DB는 신규 자료 전체 적재/검증 후 dataset_key별 활성 버전 포인터만 트랜잭션으로 전환합니다. 실패한 자료는 활성화하지 않으므로 이전 지도는 계속 제공됩니다.

### 조회 API

`MAP_API_TOKEN`을 `Authorization: Bearer ...`로 넣어야 `/v1/*`를 호출할 수 있습니다. `/health`는 DB 연결·PostGIS·스키마 준비 여부를 표시합니다.

| 경로 | 데이터 |
|---|---|
| `/health` | DB 준비 상태 (미준비 시 503) |
| `/v1/datasets` | 활성 자료 버전 |
| `/v1/datasets/versions?dataset_key=...` | 자료 버전 이력 |
| `/v1/layers` | 활성 레이어 |
| `/v1/features?layer=...&bbox=minLon,minLat,maxLon,maxLat` | GeoJSON |
| `/v1/tiles/{z}/{x}/{y}.mvt?layer=...` | 벡터 타일 |

## BlueWaikiki 대시보드 연동 주의

현재 대시보드 **Functions는 Dockerfile 단일 서비스만 배포**하며, 저장소 Compose의 `postgis` 컨테이너와 영구 볼륨을 자동 생성하지 않습니다. 이 저장소의 `bluewaikiki.functions.json`은 지도 API를 탐색할 수 있게 하는 설정일 뿐입니다. 완전한 대시보드 원클릭 배포를 위해서는 대시보드에 **프로젝트 Compose·영구 볼륨·네트워크 지원 추가**가 필요합니다.

별도 지도 PostGIS가 준비된 환경에서 지도 API Function에는 **`MAP_DATABASE_URL`**(독립 PostGIS 연결), **`MAP_API_TOKEN`**(비밀값), **`MAP_RUN_SCHEDULER=0`**(영구 파일 마운트 전)을 설정합니다. 대시보드 기본 `DATABASE_URL`은 공용 DB용으로 남겨두며 지도 코드가 읽지 않습니다.

설계: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · 배포 제약: [docs/PLATFORM_DEPLOY.md](docs/PLATFORM_DEPLOY.md) · [다운로드 연동](docs/DOWNLOADER_INTEGRATION.md) · [데이터 정책](docs/DATA_POLICY.md).
