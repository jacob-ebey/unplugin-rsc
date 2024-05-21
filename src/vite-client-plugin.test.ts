import * as assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import type { UserConfig } from "vite";
import { createServer } from "vite";

import path from "node:path";
import type { ClientTransformOptions, FilterOptions } from "./index.js";
import { rscClientPlugin } from "./index.js";

const js = String.raw;

const transformOptions: ClientTransformOptions & FilterOptions = {
	include: /.*/,
	id: (filename, directive) =>
		`${directive}:${path.relative(process.cwd(), filename)}`,
	importFrom: "mwap/runtime/client",
	importServer: "$$server",
};

const virtualModuleId = "mwap/runtime/client";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

const viteConfig: UserConfig = {
	plugins: [
		rscClientPlugin().vite(transformOptions),
		{
			name: "runtime",
			resolveId(id) {
				if (id === virtualModuleId) {
					return resolvedVirtualModuleId;
				}
			},
			load(id) {
				if (id === resolvedVirtualModuleId) {
					return js`
					  export function $$server(proxy, id, exp) {
							Object.defineProperties(proxy, {
							  $$typeof: { value: Symbol.for("reference.server") },
							  $$id: { value: id + "#" + exp },
								$$server: { value: true }
							});
							return proxy;
						}
					`;
				}
			},
		},
	],
};

describe("rscClientPlugin vite", async () => {
	const server = await createServer(viteConfig);
	after(() => server.close());

	test("can import `use server` module", async () => {
		const serverModule = await server.ssrLoadModule(
			path.resolve(process.cwd(), "fixture/server-module.ts"),
		);
		assert.strictEqual(
			serverModule.sayHello.$$id,
			"use server:fixture/server-module.ts#sayHello",
		);
		assert.strictEqual(serverModule.sayHello.$$server, true);
	});
});
