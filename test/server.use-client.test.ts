import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "vitest";

import { ClientComponent } from "./server.component";

test("transformModuleId file should get full filepath", () => {
  const cwd = process.cwd();
  const id = "./test/server.component.ts";
  const transformed = new Map(
    JSON.parse(fs.readFileSync("./transformed-modules-server.json", "utf-8"))
  );
  expect(transformed.get(path.resolve(cwd, id))).toBe("use client");
});

test("should replace client references on the server", () => {
  expect(ClientComponent).toBeTypeOf("object");
  expect(ClientComponent.$$typeof).toBe(Symbol.for("client.reference"));
  expect(ClientComponent.module).toBe("./test/server.component.ts");
  expect(ClientComponent.export).toBe("ClientComponent");
});
