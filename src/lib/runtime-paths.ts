import path from "node:path";

export function dataDirectory() {
  if (
    process.env.EASYLAW_TEST_MODE === "1" &&
    process.env.EASYLAW_TEST_DATA_DIR
  ) {
    return path.resolve(process.env.EASYLAW_TEST_DATA_DIR);
  }

  return path.join(process.cwd(), "data");
}

export function databasePath() {
  if (
    process.env.EASYLAW_TEST_MODE === "1" &&
    process.env.EASYLAW_TEST_DATABASE_PATH
  ) {
    return path.resolve(process.env.EASYLAW_TEST_DATABASE_PATH);
  }

  return path.join(dataDirectory(), "easylaw.sqlite");
}

export function masterKeyPath() {
  return path.join(dataDirectory(), ".master-key");
}

/**
 * 법령·판결문 원문, 사전, 외부 API 캐시처럼 용량이 큰 참조 데이터는
 * 서비스 DB와 분리된 파일에 저장한다. 서비스 DB 백업이 가벼워지고
 * 코퍼스는 통째로 버리고 다시 수집할 수 있다.
 */
export function corpusDatabasePathFor(mainDatabasePath: string) {
  return path.join(path.dirname(mainDatabasePath), "legal-corpus.sqlite");
}
