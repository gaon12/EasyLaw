# EasyLaw Project Status

갱신일: 2026-07-03

## 제품

EasyLaw는 판결의 결론, 판단 이유, 중요한 용어와 주의점을 쉬운 말로 나누어
보여주는 법률 문서 이해 보조 서비스입니다. 법률 자문을 대체하지 않습니다.
구성과 설계 결정은 [ARCHITECTURE.md](ARCHITECTURE.md)를 참고하세요.

## 현재 구조

- Next 16 App Router와 Node runtime
- `better-sqlite3`, WAL, 코드 기반 migration
- **DB 2파일 분리**: 서비스(easylaw.sqlite) + 코퍼스(legal-corpus.sqlite,
  판결문 원문·사전·API 캐시, ATTACH 방식)
- VPS/컨테이너 persistent volume
- Resend 이메일 발송
- 이메일 인증, 인증 앱 기반 2차 인증, 해시된 복구 코드
- 개인, 조직, 서비스 운영 관리 화면
- 생성 작업 중복 방지와 알림 발송 멱등성

## AI

- **Easy-Read 생성 파이프라인 구현 완료**: 큐에 쌓인 작업을 30초 주기
  스케줄러가 LLM으로 처리(`easyread-generation.ts`), 3회 재시도 후 실패 처리
- **검토 큐**: `easyread_review_required` 설정 시 승인 전 비공개,
  `/admin/reviews`에서 승인·반려·재생성, prompt version 등록·활성화 관리
- AI 리서치 하네스: MCP 도구 + 내부 코퍼스 검색(FTS5 trigram + LIKE 폴백),
  근거 인용 강제, SSE 스트리밍
- LLM 전송 계층: 항상 스트리밍, 유휴 기반 타임아웃(connect/first_chunk/
  idle/total), 관리자 설정 `llm_timeout_seconds`로 조정 — 느린 로컬 모델
  (Ollama/LM Studio) 지원
- 관리자 연결 진단: LLM 왕복 테스트, MCP 서버별 도구 목록/실패 사유

## 디자인

- Wanted × KRDS 조합 토큰 시스템(`globals.css`): 회색 canvas + 흰 카드
  서피스, 알파 텍스트 계층, 단일 블루 CTA, radius 사다리, 4단 그림자
- Pretendard Variable 번들, 본문 17px/1.55
- 라이트/다크 모드, 글자 크기 3단, 포커스 링, reduced-motion 대응
- 다국어(ko/en/ja)는 크롬 영역 사전 치환 방식 — 본문 i18n은 다음 작업

## 최초 설치와 보안

- 빈 DB에서는 OOBE를 완료하기 전 일반 페이지와 API가 잠깁니다.
- 설치 코드는 암호화해 저장하고 서버 로그에서만 표시합니다.
- 최초 계정은 이메일 확인과 2차 인증 후 `super_admin`이 됩니다.
- 서비스 설정과 API 자격 증명은 DB에 암호화해 저장합니다.
- 작업 상태 전환 API는 관리자 전용, 알림 신청은 이메일/IP rate limit.

## 문서·공유

- PDF 텍스트 추출 업로드(unpdf, 15MB, 텍스트 레이어 필요)
- 조직 생성(하루 5개)·이메일 초대(하루 30명)·구성원 내보내기(`/api/org`)
- 비공개 문서의 조직 공유: `/cp/[id]` 공유 컨트롤, 조직 구성원 열람,
  `/org`는 세션 사용자의 조직으로 스코프
- i18n: `easylaw_locale` 쿠키 + 서버사이드 `translate()` 기반 —
  공개 홈, 카탈로그, 가이드, 공지, 고객센터 헤더 적용
- 검색: FTS5 trigram(3자+) + unicode61 단어 접두(2자) 병행, LIKE 폴백

## 다음 작업

- i18n 본문 상세 번역(가이드 문서 내용, FAQ, 관리자 화면)
- 스캔 PDF OCR(네이티브 canvas 래스터 파이프라인 필요로 보류)
- FTS5 한국어 형태소 토크나이저 검토
