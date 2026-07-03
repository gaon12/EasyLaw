# EasyLaw 아키텍처와 목표

작성일: 2026-07-03. 이 문서는 서비스 목표, 시스템 구성, 설계 결정과 남은
과제를 기록합니다. 상태 요약은 [PROJECT_STATUS.md](PROJECT_STATUS.md)를
함께 보세요.

## 제품 목표

1. **쉬운 판결문**: 판결문·법령 원문을 결론, 판단 이유, 용어, 주의점으로
   나눈 Easy-Read 설명으로 변환한다. 법률 자문을 대체하지 않는다.
2. **AI 법률 질문(리서치)**: 질문을 받아 LLM 에이전트가 MCP 검색 도구와
   내부 코퍼스를 사용해 근거 인용([E1])이 달린 오버뷰를 작성한다.
3. **문서 보관**: 공개 판결문 검색, 비공개 문서 붙여넣기, 개인/조직
   문서함, 북마크를 제공한다.
4. **자가 호스팅**: 단일 서버 + SQLite + persistent volume으로 운영 가능한
   오픈소스 서비스.

## 시스템 구성

```
Next 16 App Router (Node runtime)
├─ src/proxy.ts            설치 게이트, 관리자/인증 경로 접근 제어
├─ src/app/**              페이지(App Router) + API 라우트
├─ src/lib/**              도메인 로직 (아래)
└─ data/
   ├─ easylaw.sqlite       서비스 DB: 사용자, 세션, 설정, 작업, 메타데이터
   ├─ legal-corpus.sqlite  코퍼스 DB: 판결문 원문, 사전, 외부 API 캐시
   └─ .master-key          설정 암호화 마스터 키 (AES-256-GCM 유도)
```

### 두 개의 SQLite 파일

대용량 참조 데이터(판결문 원문 `judgment_texts`, 표준/법률 사전
`dictionary_*`, 공개법령 API 캐시 `external_api_cache`)는
`legal-corpus.sqlite`에 두고, 서비스 DB에 `ATTACH`해서 사용한다
(`src/lib/db/index.ts`).

- 서비스 DB 백업이 가볍고, 코퍼스는 삭제 후 재수집 가능하다.
- SQLite는 unqualified 테이블 이름을 main → attached 순으로 찾으므로
  기존 쿼리는 그대로 동작한다. 원문은 `judgment_texts`와의 LEFT JOIN으로
  읽고, 쓰기는 `src/lib/judgment-texts.ts` 헬퍼를 쓴다.
- 두 파일 모두 WAL. 마이그레이션은 corpus(`corpusMigrations`) 먼저,
  서비스(`migrations`) 다음 순서로 적용된다. 서비스 마이그레이션 14가
  기존 데이터를 코퍼스로 옮긴다.
- **백업은 easylaw.sqlite + legal-corpus.sqlite + .master-key를 함께.**

### AI 스택 (answer-first)

리서치는 latency 우선 설계다. LLM에게 JSON 계획을 먼저 만들게 하는
단계가 없고, 규칙 기반 라우터가 즉시 경로를 정한다.

```
사용자 질문
  → POST /api/research/stream (SSE, 15초 heartbeat)
  → buildResearchPlan (legal-research.ts)
      ├─ routeResearchQuery (규칙 기반, LLM 호출 없음)
      ├─ quick    : 즉시 스트리밍 답변, 검색 없음
      ├─ overview : ★기본값 — 초안 스트리밍을 즉시 시작
      │             + 검색형 도구(코퍼스 FTS·MCP) 병렬 호출
      │             → 검색 완료 시 "근거 확인" 섹션 이어서 스트리밍
      └─ deep     : 고위험 신호(형사·소송 등)만 —
                    에이전트 루프 + 근거 강제 + 심층 검증 유지
                    (루프 내 도구 호출은 병렬)
  → llm-client.ts (OpenAI SDK)                  전송 계층
```

overview에서 첫 토큰은 라우팅(수 ms) 직후 초안 스트리밍으로 나온다.
근거 없는 단정을 막는 `rejectUngroundedAnswer` 루프는 deep 전용이다.
초안 프롬프트는 "근거 확인 전"임을 명시해 단정을 피하고, 검색 근거가
없으면 경고와 함께 일반 안내로만 남는다.

`llm-client.ts`는 **OpenAI SDK + provider별 base URL**로 모든 공급자를
통일한다(Anthropic도 OpenAI 호환 엔드포인트 사용). 요청은 항상
스트리밍이며 타임아웃은 4단계: connect(응답 시작), first_chunk(첫 토큰),
idle(토큰 간), total(전체). 토큰이 계속 오는 동안에는 끊지 않으므로
느린 로컬 모델(Ollama, LM Studio)도 안전하다. 전체 상한은 관리자 설정
`llm_timeout_seconds`(기본: 클라우드 180초, 로컬 600초).

Easy-Read 생성은 `easyread-generation.ts`가 담당한다.
`judgment_generation_jobs` 큐를 30초 주기 스케줄러
(`easyread-generation-scheduler.ts`)가 소비하고, 결과는
`analysis_results`(confidence `ai_generated`, 활성 prompt version 스탬프)에
저장된다. 실패 시 3회까지 재시도 후 `failed`로 남는다.

검토 흐름: 관리자 설정 `easyread_review_required`가 켜져 있으면 생성
결과는 `needs_review` 상태로 남고 사용자에게 노출되지 않는다
(`getLatestAnalysis`는 job이 `ready`인 결과만 반환). `/admin/reviews`에서
승인(공개 + 알림 발송), 반려(분석 삭제 + pending 복귀), 재생성(requeue)을
처리한다. prompt version 등록·활성화도 같은 화면에서 관리한다.

관리자 진단: `POST /api/admin/llm/test`(실제 모델 왕복),
`POST /api/admin/mcp/test`(서버별 도구 목록/실패 사유).

### MCP 서버 노출

수집된 공개 코퍼스는 외부 MCP 클라이언트에도 제공된다. `/api/mcp`가
stateless Streamable HTTP MCP 서버(`src/lib/mcp-server.ts`)로 동작하며
도구는 읽기 전용 2개: `search_legal_corpus`(FTS 전문 검색),
`get_legal_document`(공개 문서 메타+원문). 공개 데이터만 노출되고 IP당
시간당 300회로 제한된다. 세션·SSE 스트림은 지원하지 않는다(GET 405).

### 데이터 수집 (초기 대량 수집 포함)

공개법령 API 수집은 HTTP 요청에 묶이지 않는다. 관리자의 "지금 수집"은
`startJudgmentCollection`으로 백그라운드 실행을 시작하고 즉시 202를
반환하며, UI는 진행 상황을 폴링한다. 수집 루프는 페이지 단위로 커서
(`cursor_target`, `cursor_page`)와 `last_progress_at`을 run 행에
남기므로, 최초 전체 수집 중 서버가 재시작돼도 스케줄러가 2분 이상
진행이 멈춘 running 상태 run을 감지해 저장된 커서부터 이어서 실행한다
(`resumeInterruptedJudgmentCollection`). 외부 API 호출은 페이지당
15초 타임아웃이라 개별 요청이 길어질 일은 없다.

### 보안 모델

- 설정 값은 전부 AES-256-GCM으로 암호화해 `service_settings`에 저장.
  키는 `.master-key`에서 유도(HKDF 유사, sha256 도메인 분리).
- 세션·매직링크·복구코드는 HMAC-SHA256 해시로만 저장.
- proxy.ts: OOBE 완료 전 전체 잠금, /admin·/me·/org·/cp 인증 요구,
  관리자 경로는 role + TOTP 요구.
- 익명 사용자는 rate_limits 테이블 기반 다중 신호(쿠키, IP, UA,
  핑거프린트) 한도 + ALTCHA 캡차.
- 작업 상태 전환(POST /api/jobs/[id])은 관리자 전용. 알림 신청
  (POST /api/judgments/[id]/notify)은 이메일/IP 기준 rate limit.

### 디자인 시스템

Wanted × KRDS 조합. 토큰은 `src/app/globals.css` 한 곳에서 정의한다.

- 서피스 2단: 회색 canvas 위 흰 surface 카드(1px 헤어라인, 그림자 없음).
  그림자(shadow-1~4)는 팝오버/모달 등 떠 있는 UI 전용.
- 텍스트는 단일 잉크의 알파 계층(88/66/48%). 본문 17px/1.55.
- 단일 브랜드 블루 CTA(oklch 0.563 0.232 257 ≈ #0066FF). 빨강은 위험
  상태 전용.
- radius 사다리 4/6/8/12/16/full. 폰트 Pretendard Variable(번들).
- 라이트/다크는 `data-theme` + prefers-color-scheme, 글자 크기 3단.
- 페이지 패턴: 섹션 = eyebrow(라벨) + 제목 + 설명 + 본문 카드.

### 검색 (FTS5)

판결문 원문은 corpus DB의 FTS5 가상 테이블 두 개로 색인되며 트리거가
자동 동기화한다: `judgment_texts_fts`(trigram, 3자 이상 부분 문자열
매칭)와 `judgment_words_fts`(unicode61, 2자 토큰의 접두 매칭 — 한국어
조사는 단어 뒤에 붙어 접두 검색이 잘 맞는다). `searchJudgmentTexts`가
두 결과를 병합하고, 그래도 비면 `local-legal-toolbox`가 LIKE로 폴백한다.
메타데이터(사건번호·법원·제목·요지)는 LIKE로 찾아 FTS 결과와 합친다.

### 조직 공유

조직은 `/org`에서 직접 만들 수 있고(하루 5개 제한), 소유자는 이메일로
구성원을 초대(계정이 없으면 생성, 매직링크 로그인으로 합류)하거나
내보낼 수 있다(하루 30명 초대 제한, `/api/org`). 비공개 문서
(`visibility='private'`)는 작성자가 `/cp/[id]` 화면의 조직 공유
컨트롤로 소속 조직에 공유(`visibility='organization'`)할 수 있다.
접근 판정은 `getAccessibleUserJudgmentById`(본인 또는 조직 구성원),
`/org`는 세션 사용자의 조직·공유 문서·구성원만 보여준다.

### PDF 업로드

`POST /api/custom-judgments/extract`(unpdf 기반)가 텍스트 레이어가 있는
PDF에서 본문을 추출한다(15MB 한도, 스캔 PDF 미지원). 판결문 검색 화면의
"PDF에서 불러오기" 버튼이 사용한다.

### i18n

언어(ko/en/ja)는 보기 설정에서 바꾸면 localStorage + 쿠키
(`easylaw_locale`)에 저장된다. 서버 컴포넌트는 `getRequestLocale()` +
`translate()`로 첫 페인트부터 번역을 렌더링하고(공개 홈 적용),
클라이언트 전환은 `data-i18n` 치환이 이어받는다. 사전은
`src/lib/i18n.ts` 한 곳에 있다.

## 남은 과제 (우선순위순)

1. i18n 커버리지 확대: 페이지 헤더(홈·카탈로그·가이드·공지·고객센터)는
   번역됨. 본문 상세(가이드 문서 내용, 고객센터 FAQ, 관리자 화면)는
   아직 한국어 전용.
2. 스캔 PDF OCR: PDF→이미지 래스터화에 네이티브 canvas 의존성이 필요해
   보류(텍스트 레이어 PDF만 추출 가능).
3. FTS5 한국어 형태소 토크나이저: 현재 trigram+단어 접두 병행으로 충분히
   동작하나, 조사 앞 어간 변형까지 다루려면 외부 토크나이저 필요.
