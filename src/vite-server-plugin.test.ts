import * as assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import type { UserConfig } from "vite";
import { createServer } from "vite";

import path from "node:path";
import type { FilterOptions, ServerTransformOptions } from "./index.js";
import { rscServerPlugin } from "./index.js";

const js = String.raw;

const transformOptions: FilterOptions & ServerTransformOptions = {
	include: /.*/,
	id: (filename, directive) =>
		`${directive}:${path.relative(process.cwd(), filename)}`,
	importClient: "$$client",
	importFrom: "mwap/runtime/server",
	importServer: "$$server",
};

const virtualModuleId = "mwap/runtime/server";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

const viteConfig: UserConfig = {
	plugins: [
		rscServerPlugin().vite(transformOptions),
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
     			  export function $$client(proxy, id, exp) {
     					Object.defineProperties(proxy, {
     					  $$typeof: { value: Symbol.for("reference.server") },
     					  $$id: { value: id + "#" + exp },
                $$client: { value: true }
     					});
     					return proxy;
    				}
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

describe("rscServerPlugin vite", async () => {
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
		assert.strictEqual(serverModule.sayHello("world"), "Hello, world!");
	});

	test("can bind non locals for `use server`", async () => {
		const serverModule = await server.ssrLoadModule(
			path.resolve(process.cwd(), "fixture/server-inline.ts"),
		);
		assert.strictEqual(serverModule.hasSub.$$id, undefined);
		assert.strictEqual(serverModule.hasSub.$$server, undefined);
		assert.strictEqual(typeof serverModule._$$INLINE_ACTION, "function");
		assert.strictEqual(
			serverModule._$$INLINE_ACTION.$$id,
			"use server:fixture/server-inline.ts#_$$INLINE_ACTION",
		);
		assert.strictEqual(serverModule._$$INLINE_ACTION.$$server, true);
		assert.strictEqual(
			await serverModule._$$INLINE_ACTION({
				value: ["world"],
			}),
			"Hello, world!",
		);
	});
});
