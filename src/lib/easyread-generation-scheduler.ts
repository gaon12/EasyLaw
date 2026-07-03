import { getDatabase } from "./db";
import { processDueGenerationJobs } from "./easyread-generation";

const CHECK_INTERVAL_MS = 30_000;

type SchedulerState = {
  isProcessing: boolean;
  started: boolean;
  timer?: ReturnType<typeof setInterval>;
};

const globalScheduler = globalThis as typeof globalThis & {
  __easylawEasyReadGenerationScheduler?: SchedulerState;
};

/** 대기 중인 Easy-Read 생성 작업을 백그라운드에서 LLM으로 처리한다. */
export function ensureEasyReadGenerationScheduler() {
  if (process.env.EASYLAW_TEST_MODE === "1") {
    return;
  }

  const state =
    globalScheduler.__easylawEasyReadGenerationScheduler ??
    ({
      isProcessing: false,
      started: false,
    } satisfies SchedulerState);
  globalScheduler.__easylawEasyReadGenerationScheduler = state;

  if (state.started) {
    return;
  }

  state.started = true;
  state.timer = setInterval(() => {
    void processDue(state);
  }, CHECK_INTERVAL_MS);
  if (typeof state.timer === "object" && "unref" in state.timer) {
    state.timer.unref();
  }
  void processDue(state);
}

async function processDue(state: SchedulerState) {
  if (state.isProcessing) {
    return;
  }

  state.isProcessing = true;
  try {
    await processDueGenerationJobs(getDatabase());
  } catch (error) {
    console.error("[EasyLaw] Easy-Read generation scheduler failed.", error);
  } finally {
    state.isProcessing = false;
  }
}
