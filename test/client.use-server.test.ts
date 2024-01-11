import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "vitest";

import { serverAction } from "./client.action";

test("transformModuleId file should get full filepath", () => {
  const cwd = process.cwd();
  const id = "./test/client.action.ts";
  const transformed = new Map(
    JSON.parse(fs.readFileSync("./transformed-modules-client.json", "utf-8"))
  );
  expect(transformed.get(path.resolve(cwd, id))).toBe("use server");
});

test("should replace server functions on the client", () => {
  expect(serverAction).toBeTypeOf("object");
  expect(serverAction.$$typeof).toBe(Symbol.for("server.reference"));
  expect(serverAction.module).toBe("./test/client.action.ts");
  expect(serverAction.export).toBe("serverAction");
});
