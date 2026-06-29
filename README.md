# EasyLaw

EasyLaw는 판결문과 법률문서를 일반 사용자가 이해하기 쉬운 설명으로 바꾸는 Beta 서비스입니다. 공개 판결문은 외부 법률 API 값을 우선하고, 아직 생성되지 않은 판결문은 목록에 남긴 뒤 이메일 알림을 받을 수 있게 합니다.

## Product Goal

- 판결문 이해 보조와 Easy-Read 변환을 제공한다.
- 공개 판결문과 사용자/조직 문서를 분리한다.
- 사건번호, 법원, 선고일 같은 메타데이터는 LLM보다 외부 API 값을 우선한다.
- 로그인은 이메일 매직링크로 시작하고, 일반 사용자는 TOTP를 권장한다.
- 운영 관리자와 조직 소유자는 TOTP를 필수로 한다.

## Current Status

- Next 16 App Router 기반 화면과 Route Handler가 구성되어 있다.
- `better-sqlite3` 기반 SQLite WAL, migration, seed, 작업 큐, 감사 로그가 있다.
- 공개 판결문 카탈로그, 내 문서함, 조직 문서함, 운영 관리센터가 있다.
- 매직링크, TOTP 등록/검증, 복구코드, rate limit의 서버 로직이 있다.
- Resend 키가 있으면 생성 완료 알림을 보내고, 없으면 no-op으로 동작한다.
- Montage/Wanted 패키지는 GitHub Packages 인증이 필요해, 현재는 `DESIGN.md`의 Wanted 토큰을 내부 CSS/컴포넌트 레이어로 구현했다.

## Development

```bash
npm ci
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## Validation

```bash
npm run lint
npm test
npm run build
npm run test:browser
npm run format
```

`npm run test:browser`는 Playwright Chromium으로 홈, 판결문 찾기, 로그인, 회원가입, 관리 화면의 기본 렌더링을 확인합니다.

## Deployment Notes

- 기본 배포 형태는 VPS/컨테이너 + persistent volume입니다.
- SQLite 파일은 `EASYLAW_DATABASE_PATH`로 지정할 수 있고, 기본값은 `data/easylaw.sqlite`입니다.
- 운영 환경에서는 `EASYLAW_ENCRYPTION_KEY`, `RESEND_API_KEY`를 설정해야 합니다.
- CI/CD는 GitHub Actions의 `.github/workflows/ci.yml`을 사용합니다.

자세한 프로젝트 진행 상황은 [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)를 참고하세요.
