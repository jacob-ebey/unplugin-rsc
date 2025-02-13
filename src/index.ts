import { type Node, parse as babelParse } from "@babel/core";
import type { GeneratorResult } from "@babel/generator";
import _babelGenerate from "@babel/generator";
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { createUnplugin } from "unplugin";

import type { ClientTransformOptions } from "./client-transform.js";
import { clientTransform } from "./client-transform.js";

import type { ServerTransformOptions } from "./server-transform.js";
import { serverTransform } from "./server-transform.js";

const babelGenerate = _babelGenerate.default;

function parseCode(code: string) {
	return babelParse(code, {
		configFile: false,
		babelrc: false,
		parserOpts: { sourceType: "module" },
	});
}

function generateCode(ast: Node): GeneratorResult {
	return babelGenerate(ast, {
		sourceMaps: true,
	});
}

export type { ClientTransformOptions, ServerTransformOptions };
export { clientTransform, serverTransform };

export interface FilterOptions {
	include?: FilterPattern;
	exclude?: FilterPattern;
}

export function rscClientPlugin() {
	return createUnplugin<FilterOptions & ClientTransformOptions>(
		({ exclude, include, ...options }) => {
			const filter = createFilter(include, exclude);

			return {
				name: "rsc-client",
				transformInclude(id) {
					return filter(id);
				},
				async transform(code, id) {
					if (!code.includes("use server") && !code.includes("use client")) {
						return;
					}

					const ast = parseCode(code);
					clientTransform(ast, id, options);
					return generateCode(ast);
				},
			};
		},
	);
}

export function rscServerPlugin() {
	return createUnplugin<FilterOptions & ServerTransformOptions>(
		({ exclude, include, ...options }) => {
			const filter = createFilter(include, exclude);

			return {
				name: "rsc-server",
				transformInclude(id) {
					return filter(id);
				},
				async transform(code, id) {
					if (!code.includes("use server") && !code.includes("use client")) {
						return;
					}

					const ast = parseCode(code);
					serverTransform(ast, id, options);
					return generateCode(ast);
				},
			};
		},
	);
}
