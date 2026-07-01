import { AdminSettingsForm } from "@/components/admin-settings-form";
import { SearchableTable } from "@/components/list-explorer";
import { AppShell } from "@/components/site-chrome";
import { CAPTCHA_ALGORITHMS, getCaptchaSettings } from "@/lib/captcha";
import { getDatabase } from "@/lib/db";
import { listIntegrationEvents } from "@/lib/integration-events";
import { pageMetadata } from "@/lib/metadata";
import styles from "../../page.module.css";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "CAPTCHA 설정",
  description: "비회원 남용 방지를 위한 ALTCHA 보안 확인 수준을 설정합니다.",
  robots: { index: false, follow: false },
});

export default function AdminCaptchaPage() {
  const db = getDatabase();
  const settings = getCaptchaSettings(db);
  const events = listIntegrationEvents(db, "captcha");

  return (
    <AppShell variant="admin">
      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <div>
              <h1>CAPTCHA 설정</h1>
              <p>
                비회원 이용 한도에 도달한 요청은 ALTCHA로 한 번 더 확인해요.
                개인정보를 묻지 않고 브라우저의 작업 증명만 검증합니다.
              </p>
            </div>
            <span className={styles.badge}>ALTCHA</span>
          </div>
          <div className={styles.contentCard}>
            <AdminSettingsForm
              description="기본값은 표준입니다. 엄격하게 설정하면 자동화 남용을 더 강하게 늦추고, 꺼짐은 캡챠 우회를 제공하지 않습니다."
              fields={[
                {
                  key: "captcha_level",
                  label: "캡챠 수준",
                  options: [
                    {
                      label: "꺼짐 - 한도 초과 시 로그인 안내만 표시",
                      value: "off",
                    },
                    {
                      label: "부드럽게 - 정상 사용자의 대기 시간을 최소화",
                      value: "gentle",
                    },
                    {
                      label: "표준 - 일반적인 비회원 남용 방지",
                      value: "standard",
                    },
                    {
                      label: "엄격 - 반복·자동화 의심 트래픽에 강하게 대응",
                      value: "strict",
                    },
                  ],
                  placeholder: "표준",
                  type: "select",
                  value: settings.level,
                },
                {
                  key: "captcha_algorithm",
                  label: "알고리즘",
                  options: CAPTCHA_ALGORITHMS.map((algorithm) => ({
                    label: algorithm,
                    value: algorithm,
                  })),
                  placeholder: "SHA-256",
                  type: "select",
                  value: settings.algorithm,
                },
                {
                  key: "captcha_cost",
                  label: "난이도 cost",
                  placeholder: "1-200000",
                  value: String(settings.cost),
                },
                {
                  key: "captcha_expires_minutes",
                  label: "만료 시간(분)",
                  placeholder: "1-60",
                  value: String(settings.expiresMinutes),
                },
                {
                  key: "captcha_min_duration_ms",
                  label: "최소 표시 시간(ms)",
                  placeholder: "0-3000",
                  value: String(settings.minDurationMs),
                },
              ]}
              scope="captcha"
            />
          </div>
        </section>
        <section className={styles.section}>
          <div className={styles.contentCard}>
            <h2 className={styles.panelTitle}>최근 검증 기록</h2>
            <SearchableTable
              columns={["시각", "동작", "상태", "메시지"]}
              emptyMessage="표시할 CAPTCHA 기록이 없어요."
              rows={events.map((event) => ({
                cells: [
                  { kind: "datetime", value: event.createdAt },
                  event.action,
                  event.status,
                  event.message,
                ],
                id: `${event.createdAt}-${event.action}`,
                searchText: `${event.createdAt} ${event.action} ${event.status} ${event.message ?? ""}`,
              }))}
              searchLabel="검증 기록 검색"
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
