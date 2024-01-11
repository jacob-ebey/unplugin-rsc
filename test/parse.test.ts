import { expect, test } from "vitest";

import { parse } from "../src/parse";

test("parses all exports for a program with a directive at the module scope", async () => {
  const result = await parse(
    `
      "use server";

      export function a() {      
        return "";
      }
      
      function b() {
      }
      
      export const c = async () => {
      };
      
      const d = function d1 () {
      };
      
      export { b, d }
      
      export const e = () => {
      }, f = () => {
      };
      
      import { g } from "e";
      
      export { g, g as h };
      
      export default b;

      export const i = "";
      export const j = "";
      function k() {}
    `,
    "test.ts"
  );
  if (!result.directive) {
    throw new Error("Expected a directive");
  }
  expect(result.directive).toBe("use server");
  expect(Object.fromEntries(result.exports?.entries() ?? [])).toEqual({
    a: "a",
    b: "b",
    c: "c",
    d: "d",
    e: "e",
    f: "f",
    g: "g",
    h: "g",
    default: "b",
    i: "i",
    j: "j",
  });
});

test("parses exports for a program with a directive at the function scope", async () => {
  const result = await parse(
    `
      export function a() {
        "use server";
      
        return "";
      }
      
      function b() {
        "use server";
      }
      
      export const c = async () => {
        "use server";
      };
      
      const d = function d1 () {
        "use server";
      };
      
      export { b, d }
      
      export const e = () => {
        "use server";
      }, f = () => {
        "use server";
      };
      
      import { g } from "e";
      
      export { g, g as h };
      
      export default b;

      export const i = "";
      export const j = "";
      function k() {}
    `,
    "test.ts"
  );
  if (!result.directive) {
    throw new Error("Expected a directive");
  }
  expect(result.directive).toBe("use server");
  expect(Object.fromEntries(result.exports?.entries() ?? [])).toEqual({
    a: "a",
    b: "b",
    c: "c",
    d: "d",
    e: "e",
    f: "f",
    g: "g",
    h: "g",
    default: "b",
  });
});
