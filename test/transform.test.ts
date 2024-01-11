import { expect, test } from "vitest";

import { replaceExports, wrapExports } from "../src/transform";

test("replaceExports generates a new module with the exports replaced", () => {
  const code = replaceExports(
    {
      directive: "use client",
      exports: new Map([
        ["a", "a"],
        ["b", "b"],
      ]),
    },
    {
      function: "registerClientReference",
      module: "#test-runtime",
    },
    "test_id"
  );

  expect(code.split("\n")).toEqual([
    `import { registerClientReference as ___REPLACE_RUNTIME___ } from "#test-runtime";`,
    ``,
    `export const a = ___REPLACE_RUNTIME___(`,
    `  {},`,
    `  "test_id",`,
    `  "a"`,
    `);`,
    ``,
    `export const b = ___REPLACE_RUNTIME___(`,
    `  {},`,
    `  "test_id",`,
    `  "b"`,
    `);`,
    ``,
  ]);
});

test("wrapExports generates a new module with the exports wrapped", () => {
  const ogCode = `export const a = () => {}; export const b = () => {};`;
  const code = wrapExports(
    ogCode,
    {
      directive: "use client",
      exports: new Map([
        ["a", "a"],
        ["b", "b"],
      ]),
    },
    {
      function: "registerClientReference",
      module: "#test-runtime",
    },
    "test_id"
  );

  expect(code.split("\n")).toEqual([
    `import { registerClientReference as ___WRAP_RUNTIME___ } from "#test-runtime";`,
    ogCode,
    `if (typeof a === "function") ___WRAP_RUNTIME___(a, "test_id", "a");`,
    `if (typeof b === "function") ___WRAP_RUNTIME___(b, "test_id", "b");`,
    ``,
  ]);
});
