export const supportedLocales = ["ko", "en", "ja"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const translations = {
  ko: {
    "action.theme": "테마",
    "admin.captcha": "CAPTCHA",
    "admin.ai": "AI 설정",
    "admin.dictionary": "용어 사전",
    "admin.judgments": "판결문 데이터",
    "admin.home": "관리 개요",
    "admin.reviews": "결과 검토",
    "admin.jobs": "사용자·작업",
    "admin.llm": "LLM API",
    "admin.mcp": "MCP 설정",
    "admin.openLaw": "공개법령 API",
    "footer.disclaimer":
      "EasyLaw는 판결문 이해를 돕는 서비스예요. 법률 자문을 대체하지 않으며, 중요한 판단은 변호사 등 전문가와 확인해 주세요.",
    "home.hero.lede":
      "어려운 판결문을 결론, 판단 이유, 법률 용어, 주의할 점으로 나눠 쉽게 읽을 수 있어요. 궁금한 법률 상황은 AI에게 바로 물어보세요.",
    "home.rail.label": "지금 바로 시작",
    "home.rail.primary": "AI 질문 시작",
    "home.rail.secondary": "쉬운 판결문 예시 열기",
    "home.rail.note":
      "로그인 전에는 공개 예시와 검색 흐름을 먼저 확인하고, 개인/조직 문서는 인증 후 별도 화면에서 다룹니다.",
    "home.tabs.preview": "미리보기",
    "home.tabs.workflow": "이용 흐름",
    "home.tabs.paths": "시작 경로",
    "home.tabs.privacy": "보안",
    "home.preview.title": "핵심은 먼저, 근거는 바로 옆에",
    "home.preview.description":
      "판결문 원문 옆에서 결론과 쉬운 설명을 나란히 확인할 수 있어요.",
    "home.preview.action": "전체 예시 보기",
    "home.preview.original": "판결문 원문",
    "home.preview.easy": "쉬운 설명",
    "home.workflow.title": "판결문을 이해하는 세 단계",
    "home.workflow.description":
      "찾고, 읽고, 궁금증을 이어가는 세 단계로 도와드려요.",
    "home.paths.title": "지금 하려는 일로 이동하세요",
    "home.paths.description": "지금 필요한 기능을 바로 시작해 보세요.",
    "home.privacy.title": "민감한 내용은 필요한 화면에서만 다룹니다.",
    "home.privacy.description":
      "공개 판결문은 출처를 남기고, 사용자가 붙여넣은 문서는 로그인한 본인만 접근할 수 있는 비공개 주소로 관리합니다.",
    "home.privacy.action": "개인정보처리방침",
    "research.title": "AI 법률 질문",
    "research.description":
      "궁금한 상황을 검색하듯 입력하면 AI 답변과 출처를 함께 보여줘요.",
    "catalog.title": "판결문·법령 검색",
    "catalog.titleResults": "판결문·법령 검색 결과",
    "catalog.titleRecent": "공개 판결문 전체 보기",
    "catalog.description":
      "사건번호, 법원명, 제목으로 공개 판결문과 법령을 바로 찾아요. 직접 붙여넣은 내 문서는 로그인 후 비공개로 저장할 수 있어요.",
    "catalog.descriptionRecent":
      "최근 공개된 판결문을 최신순으로 모아 볼 수 있어요.",
    "guide.title": "쉬운 판결문 위키",
    "guide.description":
      "판결문을 읽고, 설명하고, 안전하게 다루기 위한 기준을 문서처럼 이어서 정리합니다. 게시판이 아니라 계속 고쳐 쓰는 지식 대문이에요.",
    "support.title": "고객센터",
    "support.description":
      "판결문 검색, AI 질문, 생성 알림, 조직 문서함 이용을 도와요.",
    "notice.title": "공지사항",
    "notice.description": "EasyLaw의 새로운 소식과 운영 안내를 확인하세요.",
    "home.meta.read": "판결문 쉽게 읽기",
    "home.meta.ask": "AI 법률 질문",
    "home.meta.free": "무료",
    "home.eyebrow.preview": "화면 미리보기",
    "home.eyebrow.workflow": "이용 방법",
    "home.eyebrow.paths": "바로가기",
    "home.eyebrow.privacy": "개인정보 보호",
    "meta.home.title": "판결문을 이해하기 쉽게 | EasyLaw",
    "nav.admin": "관리센터",
    "nav.catalog": "판결문·법령 검색",
    "nav.guide": "쉬운 판결문",
    "nav.home": "홈",
    "nav.login": "로그인",
    "nav.me": "내 문서함",
    "nav.notice": "공지사항",
    "nav.org": "조직",
    "nav.privacy": "개인정보처리방침",
    "nav.research": "AI 질문",
    "nav.service": "서비스 소개",
    "nav.signup": "회원가입",
    "nav.support": "지원",
    "nav.terms": "이용약관",
  },
  en: {
    "action.theme": "Theme",
    "admin.captcha": "CAPTCHA",
    "admin.ai": "AI Settings",
    "admin.dictionary": "Dictionary",
    "admin.judgments": "Judgment Data",
    "admin.home": "Admin",
    "admin.reviews": "Reviews",
    "admin.jobs": "Users & Jobs",
    "admin.llm": "LLM API",
    "admin.mcp": "MCP",
    "admin.openLaw": "Open Law API",
    "footer.disclaimer":
      "EasyLaw helps you understand court decisions. It does not replace legal advice; please confirm important decisions with a qualified professional.",
    "home.hero.lede":
      "Read difficult court decisions as conclusions, reasoning, legal terms, and cautions — and ask the AI about your own situation.",
    "home.rail.label": "Start now",
    "home.rail.primary": "Ask the AI",
    "home.rail.secondary": "Open an easy-read example",
    "home.rail.note":
      "Before signing in, explore the public examples and search flow. Personal and organization documents open on separate screens after signing in.",
    "home.tabs.preview": "Preview",
    "home.tabs.workflow": "How it works",
    "home.tabs.paths": "Where to start",
    "home.tabs.privacy": "Privacy",
    "home.preview.title": "The conclusion first, sources right beside it",
    "home.preview.description":
      "See the conclusion and an easy explanation right next to the original decision.",
    "home.preview.action": "See the full example",
    "home.preview.original": "Original decision",
    "home.preview.easy": "Easy explanation",
    "home.workflow.title": "Three steps to understand a decision",
    "home.workflow.description":
      "Find it, read it, and keep asking — three simple steps.",
    "home.paths.title": "Jump to what you want to do",
    "home.paths.description": "Jump straight to what you need right now.",
    "home.privacy.title":
      "Sensitive content stays on the screens that need it.",
    "home.privacy.description":
      "Public decisions keep their sources, and pasted documents live at private addresses only the signed-in owner can reach.",
    "home.privacy.action": "Privacy policy",
    "research.title": "AI legal questions",
    "research.description":
      "Describe your situation like a search query and get an AI answer with sources.",
    "catalog.title": "Judgment & law search",
    "catalog.titleResults": "Search results",
    "catalog.titleRecent": "All public judgments",
    "catalog.description":
      "Find public judgments and statutes by case number, court, or title. Documents you paste yourself are stored privately after signing in.",
    "catalog.descriptionRecent":
      "Browse recently published judgments, newest first.",
    "guide.title": "Easy-read judgment wiki",
    "guide.description":
      "Living documents on how to read, explain, and safely handle judgments — a knowledge home page that keeps being revised, not a bulletin board.",
    "support.title": "Support",
    "support.description":
      "Help with judgment search, AI questions, generation alerts, and organization documents.",
    "notice.title": "Notices",
    "notice.description": "News and service announcements from EasyLaw.",
    "home.meta.read": "Easy-read judgments",
    "home.meta.ask": "AI legal Q&A",
    "home.meta.free": "Free",
    "home.eyebrow.preview": "Preview",
    "home.eyebrow.workflow": "How it works",
    "home.eyebrow.paths": "Shortcuts",
    "home.eyebrow.privacy": "Privacy",
    "meta.home.title": "Understand Judgments Clearly | EasyLaw",
    "nav.admin": "Admin",
    "nav.catalog": "Judgment & Law Search",
    "nav.guide": "Easy Judgments",
    "nav.home": "Home",
    "nav.login": "Log in",
    "nav.me": "My documents",
    "nav.notice": "Notices",
    "nav.org": "Organization",
    "nav.privacy": "Privacy",
    "nav.research": "AI Q&A",
    "nav.service": "Overview",
    "nav.signup": "Sign up",
    "nav.support": "Support",
    "nav.terms": "Terms",
  },
  ja: {
    "action.theme": "テーマ",
    "admin.captcha": "CAPTCHA",
    "admin.ai": "AI設定",
    "admin.dictionary": "用語辞典",
    "admin.judgments": "判決文データ",
    "admin.home": "管理概要",
    "admin.reviews": "結果レビュー",
    "admin.jobs": "利用者・作業",
    "admin.llm": "LLM API",
    "admin.mcp": "MCP設定",
    "admin.openLaw": "公開法令API",
    "footer.disclaimer":
      "EasyLawは判決文の理解を助けるサービスです。法律相談の代わりにはならないため、重要な判断は弁護士など専門家にご確認ください。",
    "home.hero.lede":
      "難しい判決文を、結論・判断理由・法律用語・注意点に分けてやさしく読めます。気になる状況はAIにそのまま質問できます。",
    "home.rail.label": "今すぐはじめる",
    "home.rail.primary": "AIに質問する",
    "home.rail.secondary": "やさしい判決文の例を開く",
    "home.rail.note":
      "ログイン前は公開の例と検索の流れを確認できます。個人・組織の文書は認証後に別画面で扱います。",
    "home.tabs.preview": "プレビュー",
    "home.tabs.workflow": "利用の流れ",
    "home.tabs.paths": "はじめる場所",
    "home.tabs.privacy": "プライバシー",
    "home.preview.title": "結論が先、根拠はすぐ隣に",
    "home.preview.description":
      "判決文の原文のすぐ隣で、結論とやさしい説明を確認できます。",
    "home.preview.action": "例の全体を見る",
    "home.preview.original": "判決文の原文",
    "home.preview.easy": "やさしい説明",
    "home.workflow.title": "判決文を理解する3つのステップ",
    "home.workflow.description":
      "探して、読んで、続けて質問する3ステップです。",
    "home.paths.title": "やりたいことへ移動",
    "home.paths.description": "いま必要な機能からすぐに始められます。",
    "home.privacy.title": "機微な内容は必要な画面だけで扱います。",
    "home.privacy.description":
      "公開判決文は出典を残し、貼り付けた文書はログインした本人だけが開ける非公開アドレスで管理します。",
    "home.privacy.action": "プライバシーポリシー",
    "research.title": "AI法律質問",
    "research.description":
      "気になる状況を検索のように入力すると、AIの回答と出典を一緒に表示します。",
    "catalog.title": "判決文・法令検索",
    "catalog.titleResults": "判決文・法令の検索結果",
    "catalog.titleRecent": "公開判決文の一覧",
    "catalog.description":
      "事件番号・裁判所名・タイトルで公開判決文と法令をすぐに探せます。貼り付けた文書はログイン後に非公開で保存できます。",
    "catalog.descriptionRecent":
      "最近公開された判決文を新しい順に確認できます。",
    "guide.title": "やさしい判決文ウィキ",
    "guide.description":
      "判決文を読み、説明し、安全に扱うための基準を文書として整理します。掲示板ではなく、書き直し続ける知識のホームです。",
    "support.title": "サポート",
    "support.description":
      "判決文検索、AI質問、生成通知、組織ドキュメントの利用をサポートします。",
    "notice.title": "お知らせ",
    "notice.description": "EasyLawの新しいニュースと運営のお知らせです。",
    "home.meta.read": "判決文をやさしく",
    "home.meta.ask": "AI法律質問",
    "home.meta.free": "無料",
    "home.eyebrow.preview": "プレビュー",
    "home.eyebrow.workflow": "利用の流れ",
    "home.eyebrow.paths": "ショートカット",
    "home.eyebrow.privacy": "プライバシー",
    "meta.home.title": "判決文をわかりやすく | EasyLaw",
    "nav.admin": "管理センター",
    "nav.catalog": "判決文・法令検索",
    "nav.guide": "やさしい判決文",
    "nav.home": "ホーム",
    "nav.login": "ログイン",
    "nav.me": "マイドキュメント",
    "nav.notice": "お知らせ",
    "nav.org": "組織",
    "nav.privacy": "プライバシー",
    "nav.research": "AI質問",
    "nav.service": "サービス紹介",
    "nav.signup": "会員登録",
    "nav.support": "サポート",
    "nav.terms": "利用規約",
  },
} satisfies Record<SupportedLocale, Record<string, string>>;

export function resolveLocale(
  value: string | null | undefined,
): SupportedLocale {
  return supportedLocales.find((locale) => locale === value) ?? "ko";
}

export function translate(locale: SupportedLocale, key: string) {
  const dictionary: Readonly<Record<string, string>> = translations[locale];
  return (
    dictionary[key] ??
    translations.ko[key as keyof typeof translations.ko] ??
    key
  );
}

export const LOCALE_COOKIE = "easylaw_locale";
