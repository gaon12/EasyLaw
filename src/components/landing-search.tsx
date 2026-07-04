"use client";

import { useState } from "react";
import styles from "@/app/page.module.css";
import { SearchIcon } from "@/components/icons";
import {
  JUDGMENT_SEARCH_QUERY_MAX_LENGTH,
  LEGAL_RESEARCH_QUERY_MAX_LENGTH,
} from "@/lib/input-limits";

const exampleQuestions = [
  "전세보증금을 못 받고 있어요.",
  "중고거래 사기를 당했어요.",
  "차용증 없이 돈을 빌려줬어요.",
  "야근수당을 못 받았어요.",
  "계약 해지 위약금이 걱정돼요.",
] as const;

export function LandingSearch() {
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <div className={styles.searchExperience}>
      <div className={styles.searchModeRow}>
        <div>
          <strong>
            {isQuestionMode ? "생활 법률 질문" : "판결문·법령 검색"}
          </strong>
          <span>
            {isQuestionMode
              ? "겪은 일과 궁금한 점을 편하게 적어보세요."
              : "사건번호, 법원명 또는 제목으로 판결문과 법령을 찾아보세요."}
          </span>
        </div>
        <button
          aria-checked={isQuestionMode}
          aria-label="법률 질문 모드"
          className={styles.searchModeToggle}
          onClick={() => {
            setIsQuestionMode((current) => !current);
            setQuery("");
          }}
          role="switch"
          type="button"
        >
          <span />
        </button>
      </div>

      <form
        className={styles.heroSearch}
        action={isQuestionMode ? "/research" : "/catalog"}
      >
        <SearchIcon size={22} />
        <input
          aria-label={isQuestionMode ? "법률 상황 질문" : "판결문·법령 검색"}
          name="q"
          maxLength={
            isQuestionMode
              ? LEGAL_RESEARCH_QUERY_MAX_LENGTH
              : JUDGMENT_SEARCH_QUERY_MAX_LENGTH
          }
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            isQuestionMode
              ? "어떤 일이 있었고 무엇이 궁금한지 적어보세요"
              : "사건번호, 법원명, 판결문 제목을 입력하세요"
          }
          value={query}
        />
        <button type="submit">{isQuestionMode ? "질문" : "검색"}</button>
      </form>

      {isQuestionMode && (
        <section
          aria-label="법률 질문 예시"
          className={styles.exampleQuestions}
        >
          <span>이런 질문을 할 수 있어요</span>
          <div>
            {exampleQuestions.map((question) => (
              <button
                key={question}
                onClick={() => setQuery(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
