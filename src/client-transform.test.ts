import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ParseResult } from "@babel/core";
import { parse } from "@babel/core";
import _generate from "@babel/generator";

import type { ClientTransformOptions } from "./client-transform.js";
import { clientTransform } from "./client-transform.js";

const generate = _generate.default;
const js = String.raw;

function assertAST(
	actual: string | ParseResult,
	expected: string | ParseResult,
	log?: boolean,
) {
	function generateCode(code: string | ParseResult) {
		const ast = typeof code === "string" ? parse(code) : code;
		return generate(ast).code;
	}

	const actualCode = generateCode(actual);
	const expectedCode = generateCode(expected);

	if (log) {
		console.log("---------- ACTUAL ----------");
		console.log(actualCode);
		console.log("----------------------------");
	}

	assert.deepEqual(actualCode, expectedCode);
}

const transformOptions: ClientTransformOptions = {
	id: (filename, directive) => `${directive}:${filename}`,
	importFrom: "mwap/runtime/client",
	importServer: "$$server",
};

describe("use server replaces modules", () => {
	test("with annotated exports", () => {
		const ast = parse(js`
			"use server";
			import { Imported } from "third-party-imported";
			export { Exported } from "third-party-exported";
			export { Imported };
			export const varDeclaration = "varDeclaration";
			export const functionDeclaration = function functionDeclaration() {};
			export function Component() {}
		`);

		clientTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
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
