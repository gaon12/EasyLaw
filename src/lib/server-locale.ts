import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type SupportedLocale } from "./i18n";

/**
 * 서버 컴포넌트에서 현재 요청의 언어를 읽는다. 언어는 보기 설정에서
 * 바꿀 때 쿠키(easylaw_locale)로 저장되며, 첫 페인트부터 번역된 화면을
 * 렌더링하는 데 쓴다. 클라이언트 전환은 data-i18n 치환이 이어받는다.
 */
export async function getRequestLocale(): Promise<SupportedLocale> {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
