import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "vitest";

export const serverAction: (() => Promise<string>) & {
  $$typeof?: symbol;
  module?: string;
  export?: string;
} = async () => {
  "use server";
  return "server";
};

test("transformModuleId file should get full filepath", () => {
  const cwd = process.cwd();
  const id = "./test/server.use-server.test.ts";
  const transformed = new Map(
    JSON.parse(fs.readFileSync("./transformed-modules-server.json", "utf-8"))
  );
  expect(transformed.get(path.resolve(cwd, id))).toBe("use server");
});

test("should annotate server functions on the server", () => {
  expect(serverAction).toBeTypeOf("function");
  expect(serverAction.$$typeof).toBe(Symbol.for("server.action"));
  expect(serverAction.module).toBe("./test/server.use-server.test.ts");
  expect(serverAction.export).toBe("serverAction");
});

test("should still be callable on the server", async () => {
  expect(await serverAction()).toBe("server");
});
