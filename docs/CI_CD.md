# CI/CD

EasyLaw의 GitHub Actions는 pull request와 `main` 브랜치 push에서 다음 검사를
실행합니다.

1. `npm ci`
2. Playwright Chromium 설치
3. `npm run lint`
4. `npm test`
5. `npm run build`
6. `npm run test:browser`

## 배포 방향

배포 환경은 VPS 또는 컨테이너와 SQLite persistent volume을 기준으로 합니다.
애플리케이션 `.env`에는 `PORT`만 지정합니다. 나머지 서비스 설정은 최초 실행
OOBE에서 입력하고 암호화된 SQLite 설정으로 관리합니다.

`data/easylaw.sqlite`, WAL 파일과 `data/.master-key`를 동일한 보안 경계에서
보관하고 함께 백업해야 합니다. 운영 서비스는 TLS 리버스 프록시 뒤에서
실행해야 합니다.

현재 파이프라인은 검증까지만 수행합니다. 배포 대상과 컨테이너 레지스트리가
정해지면 별도 배포 작업을 추가할 수 있습니다.
