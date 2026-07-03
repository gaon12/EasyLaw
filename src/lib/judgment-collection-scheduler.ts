import { getDatabase } from "./db";
import {
  resumeInterruptedJudgmentCollection,
  runDueJudgmentCollection,
} from "./judgment-collection";

const CHECK_INTERVAL_MS = 60_000;

type SchedulerState = {
  isChecking: boolean;
  started: boolean;
  timer?: ReturnType<typeof setInterval>;
};

const globalScheduler = globalThis as typeof globalThis & {
  __easylawJudgmentCollectionScheduler?: SchedulerState;
};

export function ensureJudgmentCollectionScheduler() {
  if (process.env.EASYLAW_TEST_MODE === "1") {
    return;
  }

  const state =
    globalScheduler.__easylawJudgmentCollectionScheduler ??
    ({
      isChecking: false,
      started: false,
    } satisfies SchedulerState);
  globalScheduler.__easylawJudgmentCollectionScheduler = state;

  if (state.started) {
    return;
  }

  state.started = true;
  state.timer = setInterval(() => {
    void checkDueCollection(state);
  }, CHECK_INTERVAL_MS);
  if (typeof state.timer === "object" && "unref" in state.timer) {
    state.timer.unref();
  }
  void checkDueCollection(state);
}

async function checkDueCollection(state: SchedulerState) {
  if (state.isChecking) {
    return;
  }

  state.isChecking = true;
  try {
    // 서버 재시작으로 끊긴 수집이 있으면 주기와 무관하게 먼저 이어받는다.
    const resumed = await resumeInterruptedJudgmentCollection(getDatabase());
    if (!resumed) {
      await runDueJudgmentCollection(getDatabase());
    }
  } catch (error) {
    console.error("[EasyLaw] Judgment collection scheduler failed.", error);
  } finally {
    state.isChecking = false;
  }
}
