import * as assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ParseResult } from "@babel/core";
import { parse } from "@babel/core";
import _generate from "@babel/generator";

import type { ServerTransformOptions } from "./server-transform.js";
import { serverTransform } from "./server-transform.js";

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

const transformOptions: ServerTransformOptions = {
	id: (filename, directive) => `${directive}:${filename}`,
	importClient: "$$client",
	importFrom: "mwap/runtime/server",
	importServer: "$$server",
};

const transformOptionsWithEncryption: ServerTransformOptions = {
	...transformOptions,
	encryption: {
		importSource: "mwap/runtime/server",
		decryptFn: "decrypt",
		encryptFn: "encrypt",
	},
};

const wrapBoundArgs = js`
	var _wrapBoundArgs = thunk => {
		let cache = undefined;
		return {
			get value() {
				if (!cache) {
					cache = thunk();
				}
				return cache;
			}
		};
	};
`;

describe("use client replaces modules", () => {
	test("with annotated exports", () => {
		const ast = parse(js`
			"use client";
			import { Imported } from "third-party-imported";
			export { Exported } from "third-party-exported";
			export { Imported };
			export const varDeclaration = "varDeclaration";
			export const functionDeclaration = function functionDeclaration() {};
			export function Component() {}
			export default function DefaultComponent() {}
		`);

		serverTransform(ast, "use-client.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$client as _$$client } from "mwap/runtime/server";
				export const Exported = _$$client({}, "use client:use-client.js", "Exported");
				export const Imported = _$$client({}, "use client:use-client.js", "Imported");
				export const varDeclaration = _$$client({}, "use client:use-client.js", "varDeclaration");
				export const functionDeclaration = _$$client({}, "use client:use-client.js", "functionDeclaration");
				export const Component = _$$client({}, "use client:use-client.js", "Component");
				export default _$$client({}, "use client:use-client.js", "default");
			`,
		);
	});
});

describe("use server module arrow functions", () => {
	test("annotates direct export arrow function", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = (a) => {
				return "Hello, " + a + "!";
			}
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = (a) => {
					return "Hello, " + a + "!";
				}
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates later export arrow function", () => {
		const ast = parse(js`
			"use server";
			const sayHello = (a) => {
				return "Hello, " + a + "!";
			}
			export { sayHello };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				const sayHello = (a) => {
					return "Hello, " + a + "!";
				}
				export { sayHello };
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates later rename export arrow function", () => {
		const ast = parse(js`
			"use server";
			const sayHello = (a) => {
				return "Hello, " + a + "!";
			}
			export { sayHello as sayHello2 };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				const sayHello = (a) => {
					return "Hello, " + a + "!";
				}
				export { sayHello as sayHello2 };
				_$$server(sayHello, "use server:use-server.js", "sayHello2");
			`,
		);
	});

	test("annotates later rename export of already exported arrow function", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = (a) => {
				return "Hello, " + a + "!";
			};
			export { sayHello as sayHello2 };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = (a) => {
					return "Hello, " + a + "!";
				};
				export { sayHello as sayHello2 };
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates direct export arrow function while ignoring local", () => {
		const ast = parse(js`
			"use server";
			const sayHelloLocal = (a) => {
				return "Hello, " + a + "!";
			};
			export const sayHello = (a) => sayHelloLocal(a);
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				const sayHelloLocal = (a) => {
					return "Hello, " + a + "!";
				};
				export const sayHello = (a) => sayHelloLocal(a);
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates direct export arrow function while ignoring function level", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = (a) => {
				const sayHelloLocal = (a) => {
					return "Hello, " + a + "!";
				};
				return sayHelloLocal(a);
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = (a) => {
					const sayHelloLocal = (a) => {
						return "Hello, " + a + "!";
					};
					return sayHelloLocal(a);
				};
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});
});

describe("use server module function declarations", () => {
	test("annotates direct export function declaration", () => {
		const ast = parse(js`
			"use server";
			export function sayHello(a) {
				return "Hello, " + a + "!";
			}
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export function sayHello(a) {
					return "Hello, " + a + "!";
				}
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates later export function declaration", () => {
		const ast = parse(js`
			"use server";
			function sayHello(a) {
				return "Hello, " + a + "!";
			}
			export { sayHello };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				function sayHello(a) {
					return "Hello, " + a + "!";
				}
				export { sayHello };
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates later rename export of already exported function declaration", () => {
		const ast = parse(js`
			"use server";
			export function sayHello(a) {
				return "Hello, " + a + "!";
			}
			export { sayHello as sayHello2 };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export function sayHello(a) {
					return "Hello, " + a + "!";
				}
				export { sayHello as sayHello2 };
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates direct export function declaration while ignoring local", () => {
		const ast = parse(js`
			"use server";
			function sayHelloLocal(a) {
				return "Hello, " + a + "!";
			}
			export function sayHello(a) {
				return sayHelloLocal(a);
			}
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				function sayHelloLocal(a) {
					return "Hello, " + a + "!";
				}
				export function sayHello(a) {
					return sayHelloLocal(a);
				}
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates direct export function declaration while ignoring function level", () => {
		const ast = parse(js`
			"use server";
			export function sayHello(a) {
				function sayHelloLocal(a) {
					return "Hello, " + a + "!";
				};
				return sayHelloLocal(a);
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export function sayHello(a) {
					function sayHelloLocal(a) {
						return "Hello, " + a + "!";
					};
					return sayHelloLocal(a);
				};
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("hoists scoped function declaration", () => {
		const ast = parse(js`
			import * as React from "react";
			export function SayHello({ name }) {
				function formAction() {
					"use server";
					console.log(name);
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name] = _$$CLOSURE.value;
						{
							console.log(name);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export function SayHello({ name }) {
					var formAction = _$$INLINE_ACTION.bind(
						null,
						_wrapBoundArgs(() => [name])
					);
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists scoped function declaration with multiple arguments", () => {
		const ast = parse(js`
			import * as React from "react";
			export function SayHello({ name, age }) {
				function formAction() {
					"use server";
					console.log(name, age);
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name, age] = _$$CLOSURE.value;
						{
							console.log(name, age);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export function SayHello({ name, age }) {
					var formAction = _$$INLINE_ACTION.bind(
						null,
						_wrapBoundArgs(() => [name, age])
					);
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists scoped function declaration with argument and closure", () => {
		const ast = parse(js`
			import * as React from "react";
			export function SayHello({ name, age }) {
				function formAction(formData) {
					"use server";
					console.log({ name, age, formData });
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async (_$$CLOSURE, formData) => {
						var [name, age] = _$$CLOSURE.value;
						{
							console.log({ name, age, formData });
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export function SayHello({ name, age }) {
					var formAction = _$$INLINE_ACTION.bind(
						null,
						_wrapBoundArgs(() => [name, age])
					);
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists scoped function declaration with no arguments", () => {
		const ast = parse(js`
			import * as React from "react";
			export function SayHello() {
				function formAction() {
					"use server";
					console.log("Hello, world!");
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async () => {
						{
							console.log("Hello, world!");
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export function SayHello() {
					var formAction = _$$INLINE_ACTION;
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists multiple scoped function declaration", () => {
		const ast = parse(js`
			import * as React from "react";

			export function SayHello({ name, age }) {
				return React.createElement(
					React.Fragment,
					null,
					React.createElement(
						"button",
						{
							formAction: () => {
								"use server";
								console.log(name);
							}
						},
						"Say name"
					),
					React.createElement(
						"button",
						{
							formAction: () => {
								"use server";
								console.log(age);
							}
						},
						"Say age"
					)
				);
			}
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION2 = _$$server(
					async _$$CLOSURE2 => {
						var [age] = _$$CLOSURE2.value;
						{
							console.log(age);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION2"
				);
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name] = _$$CLOSURE.value;
						{
							console.log(name);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export function SayHello({ name, age }) {
					return React.createElement(
						React.Fragment,
						null,
						React.createElement("button", { formAction: _$$INLINE_ACTION.bind(null, _wrapBoundArgs(() => [name])) }, "Say name"),
						React.createElement("button", { formAction: _$$INLINE_ACTION2.bind(null, _wrapBoundArgs(() => [age])) }, "Say age")
					);
				}
			`,
		);
	});
});

describe("use server module function expressions", () => {
	test("annotates direct export function expression", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = function(a) {
				return "Hello, " + a + "!";
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = function(a) {
					return "Hello, " + a + "!";
				};
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates later export function expression", () => {
		const ast = parse(js`
			"use server";
			const sayHello = function(a) {
				return "Hello, " + a + "!";
			};
			export { sayHello };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				const sayHello = function(a) {
					return "Hello, " + a + "!";
				};
				export { sayHello };
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates later rename export of already exported function expression", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = function(a) {
				return "Hello, " + a + "!";
			};
			export { sayHello as sayHello2 };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = function(a) {
					return "Hello, " + a + "!";
				};
				export { sayHello as sayHello2 };
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates direct export function expression while ignoring local", () => {
		const ast = parse(js`
			"use server";
			const sayHelloLocal = function(a) {
				return "Hello, " + a + "!";
			};
			export const sayHello = function(a) {
				return sayHelloLocal(a);
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				const sayHelloLocal = function(a) {
					return "Hello, " + a + "!";
				};
				export const sayHello = function(a) {
					return sayHelloLocal(a);
				};
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates direct export function expression while ignoring function level", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = function(a) {
				const sayHelloLocal = function(a) {
					return "Hello, " + a + "!";
				};
				return sayHelloLocal(a);
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = function(a) {
					const sayHelloLocal = function(a) {
						return "Hello, " + a + "!";
					};
					return sayHelloLocal(a);
				};
				_$$server(sayHello, "use server:use-server.js", "sayHello");
				`,
		);
	});

	test("hoists scoped function expression", () => {
		const ast = parse(js`
			import * as React from "react";
			export const SayHello = function({ name }) {
				const formAction = function() {
					"use server";
					console.log(name);
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name] = _$$CLOSURE.value;
						{
							console.log(name);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export const SayHello = function({ name }) {
					const formAction = _$$INLINE_ACTION.bind(
						null,
						_wrapBoundArgs(() => [name])
					);
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists scoped function expression with multiple arguments", () => {
		const ast = parse(js`
			import * as React from "react";
			export const SayHello = function({ name, age }) {
				const formAction = function() {
					"use server";
					console.log(name, age);
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name, age] = _$$CLOSURE.value;
						{
							console.log(name, age);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export const SayHello = function({ name, age }) {
					const formAction = _$$INLINE_ACTION.bind(
						null,
						_wrapBoundArgs(() => [name, age])
					);
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists scoped function expression with no arguments", () => {
		const ast = parse(js`
			import * as React from "react";
			export const SayHello = function() {
				const formAction = function() {
					"use server";
					console.log("Hello, world!");
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async () => {
						{
							console.log("Hello, world!");
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export const SayHello = function() {
					const formAction = _$$INLINE_ACTION;
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists multiple scoped function expression", () => {
		const ast = parse(js`
			import * as React from "react";

			export const SayHello = function({ name, age }) {
				return React.createElement(
					React.Fragment,
					null,
					React.createElement(
						"button",
						{
							formAction: function() {
								"use server";
								console.log(name);
							}
						},
						"Say name"
					),
					React.createElement(
						"button",
						{
							formAction: function() {
								"use server";
								console.log(age);
							}
						},
						"Say age"
					)
				);
			}
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION2 = _$$server(
					async _$$CLOSURE2 => {
						var [age] = _$$CLOSURE2.value;
						{
							console.log(age);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION2"
				);
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name] = _$$CLOSURE.value;
						{
							console.log(name);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export const SayHello = function({ name, age }) {
					return React.createElement(
						React.Fragment,
						null,
						React.createElement("button", { formAction: _$$INLINE_ACTION.bind(null, _wrapBoundArgs(() => [name])) }, "Say name"),
						React.createElement("button", { formAction: _$$INLINE_ACTION2.bind(null, _wrapBoundArgs(() => [age])) }, "Say age")
					);
				}
			`,
		);
	});
});

describe("use server function arrow functions", () => {
	test("annotates direct export arrow function", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = (a) => {
				return "Hello, " + a + "!";
			}
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = (a) => {
					return "Hello, " + a + "!";
				}
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates later export arrow function", () => {
		const ast = parse(js`
			"use server";
			const sayHello = (a) => {
				return "Hello, " + a + "!";
			}
			export { sayHello };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				const sayHello = (a) => {
					return "Hello, " + a + "!";
				}
				export { sayHello };
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates later rename export of already exported arrow function", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = (a) => {
				return "Hello, " + a + "!";
			};
			export { sayHello as sayHello2 };
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = (a) => {
					return "Hello, " + a + "!";
				};
				export { sayHello as sayHello2 };
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates direct export arrow function while ignoring local", () => {
		const ast = parse(js`
			"use server";
			const sayHelloLocal = (a) => {
				return "Hello, " + a + "!";
			};
			export const sayHello = (a) => sayHelloLocal(a);
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				const sayHelloLocal = (a) => {
					return "Hello, " + a + "!";
				};
				export const sayHello = (a) => sayHelloLocal(a);
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("annotates direct export arrow function while ignoring function level", () => {
		const ast = parse(js`
			"use server";
			export const sayHello = (a) => {
				const sayHelloLocal = (a) => {
					return "Hello, " + a + "!";
				};
				return sayHelloLocal(a);
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				import { $$server as _$$server } from "mwap/runtime/server";
				export const sayHello = (a) => {
					const sayHelloLocal = (a) => {
						return "Hello, " + a + "!";
					};
					return sayHelloLocal(a);
				};
				_$$server(sayHello, "use server:use-server.js", "sayHello");
			`,
		);
	});

	test("hoists scoped arrow function", () => {
		const ast = parse(js`
			import * as React from "react";
			export const SayHello = ({ name }) => {
				const formAction = () => {
					"use server";
					console.log(name);
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name] = _$$CLOSURE.value;
						{
							console.log(name);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export const SayHello = ({ name }) => {
					const formAction = _$$INLINE_ACTION.bind(
						null,
						_wrapBoundArgs(() => [name])
					);
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists scoped arrow function with multiple arguments", () => {
		const ast = parse(js`
			import * as React from "react";
			export const SayHello = ({ name, age }) => {
				const formAction = () => {
					"use server";
					console.log(name, age);
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name, age] = _$$CLOSURE.value;
						{
							console.log(name, age);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export const SayHello = ({ name, age }) => {
					const formAction = _$$INLINE_ACTION.bind(
						null,
						_wrapBoundArgs(() => [name, age])
					);
					return React.createElement("button", { formAction }, "Say hello!");
				};
			`,
		);
	});

	test("hoists scoped arrow function with no arguments", () => {
		const ast = parse(js`
			import * as React from "react";
			export const SayHello = () => {
				const formAction = () => {
					"use server";
					console.log("Hello, world!");
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
    		import { $$server as _$$server } from "mwap/runtime/server";
    		import * as React from "react";
    		export const _$$INLINE_ACTION = _$$server(
    			async () => {
    				{
    					console.log("Hello, world!");
    				}
    			},
    			"use server:use-server.js",
    			"_$$INLINE_ACTION"
    		);
    		export const SayHello = () => {
    			const formAction = _$$INLINE_ACTION;
    			return React.createElement("button", { formAction }, "Say hello!");
    		};
    	`,
		);
	});

	test("hoists multiple scoped arrow functions", () => {
		const ast = parse(js`
			import * as React from "react";

			export function SayHello({ name, age }) {
				return React.createElement(
					React.Fragment,
					null,
					React.createElement(
						"button",
						{
							formAction: () => {
								"use server";
								console.log(name);
							}
						},
						"Say name"
					),
					React.createElement(
						"button",
						{
							formAction: () => {
								"use server";
								console.log(age);
							}
						},
						"Say age"
					)
				);
			}
		`);

		serverTransform(ast, "use-server.js", transformOptions);

		assertAST(
			ast,
			js`
				${wrapBoundArgs}
				import { $$server as _$$server } from "mwap/runtime/server";
				import * as React from "react";
				export const _$$INLINE_ACTION2 = _$$server(
					async _$$CLOSURE2 => {
						var [age] = _$$CLOSURE2.value;
						{
							console.log(age);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION2"
				);
				export const _$$INLINE_ACTION = _$$server(
					async _$$CLOSURE => {
						var [name] = _$$CLOSURE.value;
						{
							console.log(name);
						}
					},
					"use server:use-server.js",
					"_$$INLINE_ACTION"
				);
				export function SayHello({ name, age }) {
					return React.createElement(
						React.Fragment,
						null,
						React.createElement("button", { formAction: _$$INLINE_ACTION.bind(null, _wrapBoundArgs(() => [name])) }, "Say name"),
						React.createElement("button", { formAction: _$$INLINE_ACTION2.bind(null, _wrapBoundArgs(() => [age])) }, "Say age")
					);
				}
			`,
		);
	});
});

describe("use server variable encryption", () => {
	test("hoists scoped arrow function", () => {
		const ast = parse(js`
			import * as React from "react";
			export const SayHello = ({ name }) => {
				const formAction = () => {
					"use server";
					console.log(name);
				}
				return React.createElement("button", { formAction }, "Say hello!");
			};
		`);

		serverTransform(ast, "use-server.js", transformOptionsWithEncryption);

		assertAST(
			ast,
			js`
			${wrapBoundArgs}
			import { decrypt as _decrypt, encrypt as _encrypt, $$server as _$$server } from "mwap/runtime/server";
			import * as React from "react";
			export const _$$INLINE_ACTION = _$$server(async _$$CLOSURE => {
				var [name] = await _decrypt(await _$$CLOSURE.value, "use server:use-server.js", "_$$INLINE_ACTION");
				{
					console.log(name);
				}
			}, "use server:use-server.js", "_$$INLINE_ACTION");
			export const SayHello = ({
				name
			}) => {
				const formAction = _$$INLINE_ACTION.bind(null, _wrapBoundArgs(() => _encrypt([name], "use server:use-server.js", "_$$INLINE_ACTION")));
				return React.createElement("button", {
					formAction
				}, "Say hello!");
			};
		`,
		);
	});
});
