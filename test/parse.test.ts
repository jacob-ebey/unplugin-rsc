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
    d: "d1",
    e: "e",
    f: "f",
    default: "b",
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
    d: "d1",
    e: "e",
    f: "f",
    default: "b",
  });
});

test("parses all exports for a program with a directive at the module scope for commonjs module", async () => {
  const result = await parse(
    `
      "use server";

      exports.a = function a() {      
        return "";
      }
      
      function b() {
      }
      
      exports.c = async () => {
      };
      
      const d = function d1 () {
      };
      
      exports.b = b;
      exports.d = d;
      
      exports.e = () => {
      }, exports.f = () => {
      };
      
      const g = require("e");
      
      exports.g = g;
      exports.h = g;
      
      exports.default = b;

      exports.i = "";
      exports.j = "";
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
    d: "d1",
    default: "b",
  });
});

test("parses exports for a program with a directive at the function scope for commonjs module", async () => {
  const result = await parse(
    `
      exports.a = function a() {
        "use server";
      
        return "";
      }
      
      function b() {
        "use server";
      }
      
      const c = async () => {
        "use server";
      };
      exports.c = c;
      
      const d = function d1 () {
        "use server";
      };
      
      exports.b = b;
      exports.d = d;
      
      exports.e = () => {
        "use server";
      }, exports.f = () => {
        "use server";
      };
      
      const g = require("e");
      
      exports.g = g;
      exports.h = g;

      exports.i = "";
      exports.j = "";
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
    d: "d1",
  });
});

test.only("parses tsx exports", async () => {
  const result = await parse(
    `
      "use client";

      import * as React from "react";
      import * as AvatarPrimitive from "@radix-ui/react-avatar";
      
      import { cn } from "@/lib/utils";
      
      const Avatar = ({
        className,
        ...props
      }: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>) => (
        <AvatarPrimitive.Root
          className={cn(
            "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
            className,
          )}
          {...props}
        />
      );
      Avatar.displayName = AvatarPrimitive.Root.displayName;
      
      const AvatarImage = ({
        className,
        ...props
      }: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>) => (
        <AvatarPrimitive.Image
          className={cn("aspect-square h-full w-full", className)}
          {...props}
        />
      );
      AvatarImage.displayName = AvatarPrimitive.Image.displayName;
      
      const AvatarFallback = ({
        className,
        ...props
      }: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>) => (
        <AvatarPrimitive.Fallback
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full bg-muted",
            className,
          )}
          {...props}
        />
      );
      AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;
      
      export { Avatar, AvatarImage, AvatarFallback };    
    `,
    "test.ts"
  );
  if (!result.directive) {
    throw new Error("Expected a directive");
  }
  expect(result.directive).toBe("use client");
  expect(Object.fromEntries(result.exports?.entries() ?? [])).toEqual({
    Avatar: "Avatar",
    AvatarImage: "AvatarImage",
    AvatarFallback: "AvatarFallback",
  });
});
