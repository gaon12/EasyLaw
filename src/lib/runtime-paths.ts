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
