"use client";

import { useState } from "react";
import styles from "@/app/page.module.css";
import { SearchIcon } from "@/components/icons";
import {
  JUDGMENT_SEARCH_QUERY_MAX_LENGTH,
  LEGAL_RESEARCH_QUERY_MAX_LENGTH,
} from "@/lib/input-limits";

const exampleQuestions = [
  "인터넷 장터에서 물품 대금을 먼저 송금했는데 판매자가 물건을 보내지 않고 계정을 탈퇴했습니다. 경찰서에 사기 혐의로 신고하는 절차와 피해 금액을 배상받는 방법이 궁금합니다.",
  "지인에게 수백만 원을 빌려주었으나 별도의 차용증을 작성하지 않았습니다. 현재 은행 송금 기록과 문자 메시지 대화 본만 가지고도 민사 소송을 제기하여 돈을 받아낼 수 있을까요?",
  "고블린이 편의점에서 현금 대신 포션으로 거래하자는데 가능한가요?",
  "중고나라에서 물건값을 입금했는데 판매자가 연락을 끊고 잠적했습니다. 돈은 찾을 수 있나요?",
  "엘프가 마력을 다 소진한 채로 응급실에 실려왔는데, 의사는 엘프를 보자 마자 치료를 포기했습니다. 의사는 처벌을 받나요?",
] as const;

export function LandingSearch() {
  const [isQuestionMode, setIsQuestionMode] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <div className={styles.searchExperience}>
      <div className={styles.searchModeRow}>
        <div>
          <strong>
            {isQuestionMode ? "상황을 자연어로 질문하기" : "판결문 검색"}
          </strong>
          <span>
            {isQuestionMode
              ? "일상적인 말로 상황과 궁금한 점을 적어보세요."
              : "사건번호, 법원명 또는 판결문 제목으로 찾아보세요."}
          </span>
        </div>
        <button
          aria-checked={isQuestionMode}
          aria-label="자연어 질문 모드"
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
          aria-label={isQuestionMode ? "법률 상황 질문" : "판결문 검색"}
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
        <button type="submit">{isQuestionMode ? "질문하기" : "검색"}</button>
      </form>

      {isQuestionMode && (
        <section
          aria-label="자연어 질문 예시"
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
