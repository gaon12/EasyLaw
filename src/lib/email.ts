type EmailDetail = {
  label: string;
  value: string;
};

type EmailAction = {
  label: string;
  url: string;
};

export type TransactionalEmailInput = {
  serviceName?: string;
  previewText: string;
  eyebrow: string;
  title: string;
  body: string[];
  code?: string;
  details?: EmailDetail[];
  action?: EmailAction;
  notice?: string;
};

export type RenderedEmail = {
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDetails(details: EmailDetail[]) {
  if (details.length === 0) {
    return "";
  }

  const rows = details
    .map(
      ({ label, value }) => `
        <tr>
          <td style="padding: 8px 0; color: #8A8F98; font-size: 13px; line-height: 20px; vertical-align: top;">${escapeHtml(label)}</td>
          <td align="right" style="padding: 8px 0 8px 20px; color: #17191C; font-size: 13px; font-weight: 700; line-height: 20px; vertical-align: top;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px; border-top: 1px solid #E8EAED;">
      ${rows}
    </table>`;
}

function renderAction(action: EmailAction | undefined) {
  if (!action) {
    return "";
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 28px;">
      <tr>
        <td bgcolor="#0066FF" style="border-radius: 8px;">
          <a href="${escapeHtml(action.url)}" style="display: inline-block; padding: 13px 22px; color: #FFFFFF; font-size: 15px; font-weight: 700; line-height: 20px; text-decoration: none;">${escapeHtml(action.label)}</a>
        </td>
      </tr>
    </table>`;
}

function renderText(input: TransactionalEmailInput) {
  const serviceName = input.serviceName ?? "EasyLaw";
  const sections = [
    serviceName,
    "",
    input.title,
    "",
    ...input.body,
    input.code ? `\n확인 코드: ${input.code}` : "",
    ...(input.details ?? []).map(({ label, value }) => `${label}: ${value}`),
    input.action ? `\n${input.action.label}: ${input.action.url}` : "",
    input.notice ? `\n안내: ${input.notice}` : "",
    "",
    "본 메일은 요청에 따라 자동으로 발송되었습니다.",
  ];
  return sections.filter((section, index) => section || index < 4).join("\n");
}

export function renderTransactionalEmail(
  input: TransactionalEmailInput,
): RenderedEmail {
  const serviceName = escapeHtml(input.serviceName ?? "EasyLaw");
  const body = input.body
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 12px; color: #4B5058; font-size: 15px; line-height: 24px;">${escapeHtml(paragraph)}</p>`,
    )
    .join("");
  const code = input.code
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px;">
        <tr>
          <td align="center" bgcolor="#F0F6FF" style="border: 1px solid #D8E8FF; border-radius: 8px; padding: 22px 16px;">
            <div style="margin-bottom: 6px; color: #667085; font-size: 12px; font-weight: 700; line-height: 18px;">확인 코드</div>
            <div style="color: #0066FF; font-family: Consolas, Monaco, monospace; font-size: 30px; font-weight: 700; letter-spacing: 8px; line-height: 38px;">${escapeHtml(input.code)}</div>
          </td>
        </tr>
      </table>`
    : "";
  const notice = input.notice
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px;">
        <tr>
          <td bgcolor="#F6F7F8" style="border-radius: 8px; padding: 14px 16px; color: #667085; font-size: 13px; line-height: 20px;">
            ${escapeHtml(input.notice)}
          </td>
        </tr>
      </table>`
    : "";

  return {
    text: renderText(input),
    html: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F6F7F8; color: #17191C; font-family: Arial, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${escapeHtml(input.previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F6F7F8">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px;">
            <tr>
              <td style="padding: 0 4px 18px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td bgcolor="#0066FF" width="32" height="32" align="center" style="width: 32px; height: 32px; border-radius: 8px; color: #FFFFFF; font-size: 16px; font-weight: 800;">E</td>
                    <td style="padding-left: 10px; color: #17191C; font-size: 20px; font-weight: 800; letter-spacing: -0.4px;">${serviceName}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="#FFFFFF" style="border: 1px solid #E8EAED; border-radius: 8px; padding: 40px 36px;">
                <div style="margin-bottom: 10px; color: #0066FF; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; line-height: 18px;">${escapeHtml(input.eyebrow)}</div>
                <h1 style="margin: 0 0 18px; color: #17191C; font-size: 28px; font-weight: 800; letter-spacing: -0.7px; line-height: 38px;">${escapeHtml(input.title)}</h1>
                ${body}
                ${code}
                ${renderDetails(input.details ?? [])}
                ${notice}
                ${renderAction(input.action)}
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 4px 0; color: #9AA0A9; font-size: 12px; line-height: 19px;">
                본 메일은 요청에 따라 자동으로 발송되었습니다.<br>
                © ${new Date().getUTCFullYear()} ${serviceName}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

export function renderEmailTest(serviceName = "EasyLaw") {
  return renderTransactionalEmail({
    serviceName,
    previewText: "이메일 발송 설정이 정상적으로 연결되었습니다.",
    eyebrow: "EMAIL TEST",
    title: "이메일 연결이 확인됐어요",
    body: [
      `${serviceName}가 이 주소로 이메일을 보낼 수 있습니다.`,
      "설치 화면으로 돌아가 다음 단계를 계속해 주세요.",
    ],
    details: [{ label: "발송 상태", value: "정상" }],
    notice: "이 메일은 최초 설치 중 발송한 테스트 메일입니다.",
  });
}

export function renderSetupVerificationEmail(
  code: string,
  serviceName = "EasyLaw",
) {
  return renderTransactionalEmail({
    serviceName,
    previewText: `설치를 계속하려면 확인 코드 ${code}를 입력하세요.`,
    eyebrow: "ADMIN VERIFICATION",
    title: "관리자 이메일을 확인해 주세요",
    body: [
      `${serviceName} 최고 관리자 설정을 계속하려면 아래 확인 코드를 설치 화면에 입력하세요.`,
    ],
    code,
    details: [{ label: "유효 시간", value: "10분" }],
    notice: "직접 요청하지 않았다면 이 메일을 무시해 주세요.",
  });
}

export function renderJudgmentReadyEmail(input: {
  serviceName?: string;
  caseNumber: string;
  title: string;
}) {
  return renderTransactionalEmail({
    serviceName: input.serviceName,
    previewText: `${input.title}의 쉬운 판결문이 준비되었습니다.`,
    eyebrow: "DOCUMENT READY",
    title: "쉬운 판결문이 준비됐어요",
    body: [
      "요청하신 판결문의 분석과 쉬운 설명 생성이 완료되었습니다.",
      "EasyLaw에 로그인해 결과와 원문 근거를 함께 확인해 주세요.",
    ],
    details: [
      { label: "사건번호", value: input.caseNumber },
      { label: "문서", value: input.title },
    ],
    notice: "EasyLaw의 설명은 법률 자문을 대신하지 않습니다.",
  });
}

export function renderMagicLinkEmail(input: {
  serviceName?: string;
  loginUrl: string;
}) {
  return renderTransactionalEmail({
    serviceName: input.serviceName,
    previewText: "EasyLaw 로그인 링크가 도착했어요.",
    eyebrow: "LOGIN",
    title: "로그인을 계속해 주세요",
    body: [
      "아래 버튼을 누르면 EasyLaw에 로그인됩니다.",
      "이 링크는 짧은 시간 동안만 사용할 수 있어요.",
    ],
    action: {
      label: "EasyLaw 로그인",
      url: input.loginUrl,
    },
    notice: "직접 요청하지 않았다면 이 메일을 무시해 주세요.",
  });
}
