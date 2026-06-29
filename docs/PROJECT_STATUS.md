# EasyLaw Project Status

## 제품

EasyLaw는 판결의 결론, 판단 이유, 중요한 용어와 주의점을 쉬운 말로 나누어
보여주는 법률 문서 이해 보조 서비스입니다. 법률 자문을 대체하지 않습니다.

## 현재 구조

- Next 16 App Router와 Node runtime
- `better-sqlite3`, WAL, 코드 기반 migration
- VPS/컨테이너 persistent volume
- Resend 이메일 발송
- 이메일 인증, 인증 앱 기반 2차 인증, 해시된 복구 코드
- 개인, 조직, 서비스 운영 관리 화면
- 생성 작업 중복 방지와 알림 발송 멱등성

## 최초 설치와 보안

- 빈 DB에서는 OOBE를 완료하기 전 일반 페이지와 API가 잠깁니다.
- 설치 코드는 암호화해 저장하고 서버 로그에서만 표시합니다.
- 최초 계정은 이메일 확인과 2차 인증 후 `super_admin`이 됩니다.
- 서비스 설정과 API 자격 증명은 DB에 암호화해 저장합니다.
- DB 암호화용 마스터 키는 `data/.master-key`에 별도로 자동 생성합니다.
- 설치 코드, 이메일 코드와 2차 인증 코드에는 시도 횟수 제한을 적용합니다.

## 다음 작업

- 로그인과 회원가입 폼을 실제 사용자 세션에 연결
- 텍스트 PDF 추출과 비공개 문서 업로드 경계 구현
- 결과 검토와 prompt version 승인 흐름 구현
- 실제 판결문 제공자 연동
- GitHub Packages 접근 후 Montage 컴포넌트 적용
