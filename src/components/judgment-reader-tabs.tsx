"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import styles from "@/app/page.module.css";
import { XIcon } from "@/components/icons";
import {
  defaultReaderView,
  getReaderViewTitle,
  isReaderView,
  type LegalDocumentFamiliarity,
  type LongTextComfort,
  type PreferredReading,
  type ReaderView,
  recommendReaderView,
} from "@/lib/reading-onboarding";

type ReaderTab = "document" | "explanation" | "easyread";
type OnboardingStep =
  | "reading"
  | "familiarity"
  | "length"
  | "recommendation"
  | "choose";

const tabHashes: Record<string, ReaderTab> = {
  "#original-document": "document",
  "#easy-explanation": "explanation",
  "#easy-read": "easyread",
};
const tabToReaderView: Record<ReaderTab, ReaderView> = {
  document: "original",
  easyread: "easy_read",
  explanation: "plain_language",
};
const readerViewToTab: Record<ReaderView, ReaderTab> = {
  easy_read: "easyread",
  original: "document",
  plain_language: "explanation",
};
const readerViewStorageKey = "easylaw_reader_view";
const onboardingStorageKey = "easylaw_reader_onboarding_complete";

export function JudgmentReaderTabs({
  documentLabel = "판결문",
  documentPanel,
  explanationPanel,
  easyReadPanel,
}: {
  documentLabel?: string;
  documentPanel: ReactNode;
  explanationPanel: ReactNode;
  easyReadPanel: ReactNode;
}) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<ReaderTab>(
    readerViewToTab[defaultReaderView],
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] =
    useState<OnboardingStep>("reading");
  const [noticeView, setNoticeView] = useState<ReaderView | null>(null);
  const [preferredReading, setPreferredReading] =
    useState<PreferredReading | null>(null);
  const [legalDocumentFamiliarity, setLegalDocumentFamiliarity] =
    useState<LegalDocumentFamiliarity | null>(null);
  const [longTextComfort, setLongTextComfort] =
    useState<LongTextComfort | null>(null);
  const [manualView, setManualView] = useState<ReaderView>(defaultReaderView);

  const answers = {
    legalDocumentFamiliarity,
    longTextComfort,
    preferredReading,
  };
  const recommendation = recommendReaderView(answers);

  const completeOnboarding = useCallback((view: ReaderView) => {
    localStorage.setItem(readerViewStorageKey, view);
    localStorage.setItem(onboardingStorageKey, "1");
    setActiveTab(readerViewToTab[view]);
    setManualView(view);
    setNoticeView(view);
    setOnboardingOpen(false);
    setOnboardingStep("reading");
  }, []);

  const closeWithDefault = useCallback(() => {
    completeOnboarding(defaultReaderView);
  }, [completeOnboarding]);

  useEffect(() => {
    function syncTabWithHash() {
      const tab = tabHashes[window.location.hash];
      if (tab) {
        setActiveTab(tab);
      }
    }

    const storedView = localStorage.getItem(readerViewStorageKey);
    const storedTab = isReaderView(storedView)
      ? readerViewToTab[storedView]
      : readerViewToTab[defaultReaderView];
    const hashTab = tabHashes[window.location.hash];
    setActiveTab(hashTab ?? storedTab);
    setManualView(tabToReaderView[hashTab ?? storedTab]);
    setOnboardingOpen(localStorage.getItem(onboardingStorageKey) !== "1");
    window.addEventListener("hashchange", syncTabWithHash);
    return () => window.removeEventListener("hashchange", syncTabWithHash);
  }, []);

  useEffect(() => {
    if (!onboardingOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeWithDefault();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeWithDefault, onboardingOpen]);

  function activateTab(tab: ReaderTab) {
    setActiveTab(tab);
  }

  function goToPreviousOnboardingStep() {
    if (onboardingStep === "familiarity") {
      setOnboardingStep("reading");
      return;
    }
    if (onboardingStep === "length") {
      setOnboardingStep("familiarity");
      return;
    }
    if (onboardingStep === "recommendation") {
      setOnboardingStep("length");
      return;
    }
    if (onboardingStep === "choose") {
      setOnboardingStep("recommendation");
    }
  }

  function goToNextOnboardingStep() {
    if (onboardingStep === "reading" && preferredReading) {
      setOnboardingStep("familiarity");
      return;
    }
    if (onboardingStep === "familiarity" && legalDocumentFamiliarity) {
      setOnboardingStep("length");
      return;
    }
    if (onboardingStep === "length" && longTextComfort) {
      setOnboardingStep("recommendation");
    }
  }

  return (
    <div className={styles.viewerTabs} id="reader-tabs">
      {noticeView && (
        <output className={styles.readerPreferenceNotice}>
          <p>
            {`앞으로 ${documentLabel}을 '${getReaderViewTitle(noticeView)}'로 먼저 보여드리겠습니다. 언제든지 상단에서 원문이나 이지리드로 바꿀 수 있습니다.`}
          </p>
          <button onClick={() => setNoticeView(null)} type="button">
            확인
          </button>
        </output>
      )}
      <div
        aria-label="본문 읽기 방식"
        className={styles.viewerTabList}
        role="tablist"
      >
        <button
          aria-controls="original-document"
          aria-selected={activeTab === "document"}
          id={`${baseId}-document-tab`}
          onClick={() => activateTab("document")}
          role="tab"
          type="button"
        >
          원문
        </button>
        <button
          aria-controls="easy-explanation"
          aria-selected={activeTab === "explanation"}
          id={`${baseId}-explanation-tab`}
          onClick={() => activateTab("explanation")}
          role="tab"
          type="button"
        >
          쉬운 해설
        </button>
        <button
          aria-controls="easy-read"
          aria-selected={activeTab === "easyread"}
          id={`${baseId}-easyread-tab`}
          onClick={() => activateTab("easyread")}
          role="tab"
          type="button"
        >
          이지리드
        </button>
      </div>
      <div hidden={activeTab !== "document"}>{documentPanel}</div>
      <div hidden={activeTab !== "explanation"}>{explanationPanel}</div>
      <div hidden={activeTab !== "easyread"}>{easyReadPanel}</div>
      {onboardingOpen && (
        <div className={styles.readerOnboardingBackdrop}>
          <section
            aria-labelledby={`${baseId}-reader-onboarding-title`}
            aria-modal="true"
            className={styles.readerOnboardingModal}
            role="dialog"
          >
            <button
              aria-label="기본값으로 닫기"
              className={styles.readerOnboardingClose}
              onClick={closeWithDefault}
              title="닫기"
              type="button"
            >
              <XIcon size={18} />
            </button>
            <div className={styles.readerOnboardingIntro}>
              <span className={styles.badge}>보기 설정</span>
              <h2 id={`${baseId}-reader-onboarding-title`}>
                {documentLabel}을 더 편하게 볼 수 있도록 기본 화면을
                골라드릴게요
              </h2>
              <p>
                답을 고르지 않고 닫아도 괜찮습니다. 그때는 쉬운 해설을 먼저
                보여드립니다.
              </p>
            </div>

            {onboardingStep === "reading" ? (
              <>
                <OnboardingProgress currentStep={1} />
                <OnboardingQuestion
                  legend={`${documentLabel}을 어떤 방식으로 보고 싶으신가요?`}
                  name={`${baseId}-preferred-reading`}
                  onChange={setPreferredReading}
                  options={[
                    {
                      label: `원래 ${documentLabel} 그대로 보고 싶어요`,
                      value: "original",
                    },
                    {
                      label: "쉽게 풀어쓴 설명으로 보고 싶어요",
                      value: "plain_language",
                    },
                    {
                      label: "짧은 문장과 큰 글씨로 보고 싶어요",
                      value: "easy_read",
                    },
                  ]}
                  value={preferredReading}
                />
                <div className={styles.readerOnboardingActions}>
                  <button
                    className={styles.primaryButton}
                    disabled={!preferredReading}
                    onClick={goToNextOnboardingStep}
                    type="button"
                  >
                    다음
                  </button>
                </div>
              </>
            ) : onboardingStep === "familiarity" ? (
              <>
                <OnboardingProgress currentStep={2} />
                <OnboardingQuestion
                  legend="법률 문서를 읽는 것이 익숙하신가요?"
                  name={`${baseId}-legal-familiarity`}
                  onChange={setLegalDocumentFamiliarity}
                  options={[
                    { label: "익숙합니다", value: "familiar" },
                    { label: "어렵습니다", value: "difficult" },
                    {
                      label: "매우 어렵습니다",
                      value: "very_difficult",
                    },
                  ]}
                  value={legalDocumentFamiliarity}
                />
                <div className={styles.readerOnboardingActions}>
                  <button
                    className={styles.secondaryButton}
                    onClick={goToPreviousOnboardingStep}
                    type="button"
                  >
                    이전
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={!legalDocumentFamiliarity}
                    onClick={goToNextOnboardingStep}
                    type="button"
                  >
                    다음
                  </button>
                </div>
              </>
            ) : onboardingStep === "length" ? (
              <>
                <OnboardingProgress currentStep={3} />
                <OnboardingQuestion
                  legend="긴 글을 읽는 것이 부담스럽나요?"
                  name={`${baseId}-long-text`}
                  onChange={setLongTextComfort}
                  options={[
                    { label: "괜찮습니다", value: "fine" },
                    {
                      label: "조금 부담스럽습니다",
                      value: "some",
                    },
                    { label: "많이 부담스럽습니다", value: "high" },
                  ]}
                  value={longTextComfort}
                />
                <div className={styles.readerOnboardingActions}>
                  <button
                    className={styles.secondaryButton}
                    onClick={goToPreviousOnboardingStep}
                    type="button"
                  >
                    이전
                  </button>
                  <button
                    className={styles.primaryButton}
                    disabled={!longTextComfort}
                    onClick={goToNextOnboardingStep}
                    type="button"
                  >
                    추천 보기 확인
                  </button>
                </div>
              </>
            ) : onboardingStep === "recommendation" ? (
              <>
                <div className={styles.readerRecommendation}>
                  <span>추천 보기: {recommendation.title}</span>
                  <p>{recommendation.description}</p>
                  {recommendation.summaryFirst && (
                    <small>핵심 요약을 먼저 볼 수 있게 맞춰둘게요.</small>
                  )}
                </div>
                <div className={styles.readerOnboardingActions}>
                  <button
                    className={styles.secondaryButton}
                    onClick={goToPreviousOnboardingStep}
                    type="button"
                  >
                    이전
                  </button>
                  <button
                    className={styles.primaryButton}
                    onClick={() => completeOnboarding(recommendation.view)}
                    type="button"
                  >
                    이대로 시작하기
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={() => {
                      setManualView(recommendation.view);
                      setOnboardingStep("choose");
                    }}
                    type="button"
                  >
                    직접 선택하기
                  </button>
                </div>
              </>
            ) : (
              <>
                <fieldset className={styles.readerManualChoice}>
                  <legend>먼저 볼 화면을 직접 선택해주세요</legend>
                  {readerViewOptions.map((option) => (
                    <label key={option.value}>
                      <input
                        checked={manualView === option.value}
                        name={`${baseId}-manual-reader-view`}
                        onChange={() => setManualView(option.value)}
                        type="radio"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>
                <div className={styles.readerOnboardingActions}>
                  <button
                    className={styles.primaryButton}
                    onClick={() => completeOnboarding(manualView)}
                    type="button"
                  >
                    선택한 보기로 시작하기
                  </button>
                  <button
                    className={styles.secondaryButton}
                    onClick={goToPreviousOnboardingStep}
                    type="button"
                  >
                    추천으로 돌아가기
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const readerViewOptions = [
  { label: "원문", value: "original" },
  { label: "쉬운 해설", value: "plain_language" },
  { label: "이지리드", value: "easy_read" },
] as const;

function OnboardingProgress({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <div aria-hidden className={styles.readerOnboardingProgress}>
      {[1, 2, 3].map((step) => (
        <span
          data-active={currentStep === step ? "true" : undefined}
          key={step}
        />
      ))}
    </div>
  );
}

function OnboardingQuestion<Value extends string>({
  legend,
  name,
  onChange,
  options,
  value,
}: {
  legend: string;
  name: string;
  onChange: (value: Value) => void;
  options: ReadonlyArray<{ label: string; value: Value }>;
  value: Value | null;
}) {
  return (
    <fieldset className={styles.readerOnboardingQuestion}>
      <legend>{legend}</legend>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              checked={value === option.value}
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
