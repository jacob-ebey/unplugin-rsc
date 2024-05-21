import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parse } from "@babel/core";

import type { ClientTransformOptions } from "./client-transform.js";
import { clientTransform } from "./client-transform.js";

const js = String.raw;

function assertAST(actual: string, expected: string, log?: boolean) {
	function replacer(key: string, value: unknown) {
		if (key === "start" || key === "end" || key === "loc") {
			return undefined;
		}
		return value;
	}

	if (log) {
		console.log("---------- ACTUAL ----------");
		console.log(actual);
		console.log("----------------------------");
	}

	assert.deepEqual(
		JSON.parse(JSON.stringify(parse(actual)?.program, replacer)),
		JSON.parse(JSON.stringify(parse(expected)?.program, replacer)),
	);
}

const transformOptions: ClientTransformOptions = {
	id: (filename, directive) => `${directive}:${filename}`,
	importFrom: "mwap/runtime/client",
	importServer: "$$server",
};

describe("use server replaces modules", () => {
	test("with annotated exports", () => {
		const code = js`
			"use server";
			import { Imported } from "third-party-imported";
			export { Exported } from "third-party-exported";
			export { Imported };
			export const varDeclaration = "varDeclaration";
			export const functionDeclaration = function functionDeclaration() {};
			export function Component() {}
		`;

		assertAST(
			clientTransform(code, "use-server.js", transformOptions).code,
			js`
        import { $$server as _$$server } from "mwap/runtime/client";
        export const Exported = _$$server({}, "use server:use-server.js", "Exported");
        export const Imported = _$$server({}, "use server:use-server.js", "Imported");
        export const varDeclaration = _$$server({}, "use server:use-server.js", "varDeclaration");
        export const functionDeclaration = _$$server({}, "use server:use-server.js", "functionDeclaration");
        export const Component = _$$server({}, "use server:use-server.js", "Component");
			`,
		);
	});
});
