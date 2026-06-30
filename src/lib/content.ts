export type WikiDocument = {
  slug: string;
  title: string;
  summary: string;
  updatedOn: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

export const guideDocuments: WikiDocument[] = [
  {
    slug: "쉬운말-작성-원칙",
    title: "쉬운말 작성 원칙",
    summary: "판결의 의미를 바꾸지 않으면서 이해하기 쉽게 설명하는 기준입니다.",
    updatedOn: "2026-06-30",
    sections: [
      {
        heading: "결론을 먼저 씁니다",
        paragraphs: [
          "독자가 판결의 결과를 먼저 파악한 뒤 이유를 읽을 수 있도록 결론을 앞에 배치합니다.",
          "누가 무엇을 해야 하는지 주어와 행동을 분명하게 씁니다.",
        ],
      },
      {
        heading: "원문과 설명을 구분합니다",
        paragraphs: [
          "법원이 실제로 판단한 내용과 EasyLaw의 설명을 섞지 않습니다.",
          "확인할 수 없는 내용은 추측하지 않고 ‘확인 필요’로 표시합니다.",
        ],
      },
    ],
  },
  {
    slug: "판결문-읽는-순서",
    title: "판결문 읽는 순서",
    summary: "주문, 이유, 법률 용어를 차근차근 확인하는 방법입니다.",
    updatedOn: "2026-06-30",
    sections: [
      {
        heading: "1. 주문",
        paragraphs: [
          "주문에는 재판의 최종 결론이 담겨 있습니다. 청구가 받아들여졌는지, 누가 비용을 부담하는지 먼저 확인합니다.",
        ],
      },
      {
        heading: "2. 이유",
        paragraphs: [
          "법원이 어떤 사실을 인정했고 어떤 법을 적용했는지 살펴봅니다. 결론과 이어지는 핵심 문장을 중심으로 읽습니다.",
        ],
      },
    ],
  },
  {
    slug: "개인정보와-비공개-문서",
    title: "개인정보와 비공개 문서",
    summary: "직접 붙여넣은 판결문을 안전하게 다루기 위한 안내입니다.",
    updatedOn: "2026-06-30",
    sections: [
      {
        heading: "공개되지 않는 문서",
        paragraphs: [
          "직접 붙여넣은 판결문은 커스텀 판결문으로 저장되며 작성한 계정만 열 수 있습니다.",
          "주소의 고유 ID만으로 접근 권한이 생기지는 않습니다. 로그인 세션과 소유권을 함께 확인합니다.",
        ],
      },
    ],
  },
];

export const notices = [
  {
    id: "2026-001",
    title: "EasyLaw 베타 서비스 안내",
    publishedOn: "2026-06-30",
    body: [
      "EasyLaw 베타 서비스를 시작합니다.",
      "공개 판결문과 직접 입력한 비공개 판결문을 구분해 제공하며, 쉬운 설명은 법률 자문을 대신하지 않습니다.",
    ],
  },
  {
    id: "2026-002",
    title: "커스텀 판결문 URL 정책 안내",
    publishedOn: "2026-06-30",
    body: [
      "사용자가 직접 입력한 판결문은 /cp/{고유 ID} 주소를 사용합니다.",
      "중복되지 않는 ID와 로그인한 사용자의 소유권을 모두 확인합니다.",
    ],
  },
] as const;

export function getGuideDocument(slug: string) {
  return guideDocuments.find((document) => document.slug === slug);
}

export function getNotice(id: string) {
  return notices.find((notice) => notice.id === id);
}
