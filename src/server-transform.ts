// Adapted from @lubieowoce https://github.com/lubieowoce/tangle/blob/main/packages/babel-rsc/src/babel-rsc-actions.ts

import type { NodePath, ParseResult } from "@babel/core";
import { types as t, template, traverse } from "@babel/core";
import { addNamed as addNamedImport } from "@babel/helper-module-imports";

type FnPath =
	| NodePath<t.ArrowFunctionExpression>
	| NodePath<t.FunctionDeclaration>
	| NodePath<t.FunctionExpression>;

type Scope = NodePath["scope"];

export type ServerTransformOptions = {
	id(filename: string, directive: "use client" | "use server"): string;
	importClient: string;
	importFrom: string;
	importServer: string;
	encryption?: {
		importSource: string;
		decryptFn: string;
		encryptFn: string;
	};
};

const LAZY_WRAPPER_VALUE_KEY = "value";

// React doesn't like non-enumerable properties on serialized objects (see `isSimpleObject`),
// so we have to use closure scope for the cache (instead of a non-enumerable `this._cache`)
const _buildLazyWrapperHelper = template(`(thunk) => {
  let cache = undefined;
  return {
    get ${LAZY_WRAPPER_VALUE_KEY}() {
      if (!cache) {
        cache = thunk();
      }
      return cache;
    }
  }
}`);

const buildLazyWrapperHelper = () => {
	return (_buildLazyWrapperHelper({}) as t.ExpressionStatement).expression;
};

export function serverTransform(
	ast: ParseResult,
	filename: string,
	{
		encryption,
		id: _id,
		importClient,
		importFrom,
		importServer,
	}: ServerTransformOptions,
): void {
	const onceCache = new Map<string, unknown>();
	function once<T>(key: string, todo: () => T) {
		if (onceCache.has(key)) {
			return onceCache.get(key) as T;
		}
		const r = todo();
		onceCache.set(key, r);
		return r;
	}

	let programPath: NodePath<t.Program>;
	let moduleUseClient = false;
	let moduleUseServer = false;
	let hasUseServer = false;
	const namedExports = new Map<string, string>();
	const topLevelFunctions = new Set<string>();

	const hasUseServerDirective = (path: FnPath) => {
		const { body } = path.node;
		if (!t.isBlockStatement(body)) {
			return false;
		}
		if (
			!(
				body.directives.length >= 1 &&
				body.directives.some((d) => d.value.value === "use server")
			)
		) {
			return false;
		}
		// remove the use server directive
		body.directives = body.directives.filter(
			(d) => d.value.value !== "use server",
		);
		return true;
	};

	const defineBoundArgsWrapperHelper = () =>
		once("defineBoundArgsWrapperHelper", () => {
			const id = programPath.scope.generateUidIdentifier("wrapBoundArgs");
			programPath.scope.push({
				id,
				kind: "var",
				init: buildLazyWrapperHelper(),
			});
			return id;
		});

	const id = (directive: "use client" | "use server") =>
		once(`id:${filename}:${directive}`, () => _id(filename, directive));

	const addCryptImport = (): {
		decryptFn: t.Identifier;
		encryptFn: t.Identifier;
	} | null => {
		if (!encryption) return null;
		return {
			decryptFn: once(
				`import { ${encryption.decryptFn} } from "${encryption.importSource}"`,
				() =>
					addNamedImport(
						programPath,
						encryption.decryptFn,
						encryption.importSource,
					),
			),
			encryptFn: once(
				`import { ${encryption.encryptFn} } from "${encryption.importSource}"`,
				() =>
					addNamedImport(
						programPath,
						encryption.encryptFn,
						encryption.importSource,
					),
			),
		};
	};

	traverse(ast, {
		Program(path) {
			programPath = path;

			for (const directive of path.node.directives) {
				const value = directive.value.value;
				switch (value) {
					case "use client":
						moduleUseClient = true;
						break;
					case "use server":
						hasUseServer = moduleUseServer = true;
						break;
				}
			}
			if (moduleUseClient && moduleUseServer) {
				throw new Error(
					'Cannot have both "use client" and "use server" in the same module',
				);
			}
			if (moduleUseServer) {
				path.node.directives = path.node.directives.filter(
					(d) => d.value.value !== "use server",
				);
			}
			if (moduleUseClient) {
				path.node.directives = path.node.directives.filter(
					(d) => d.value.value !== "use client",
				);
			}
		},
		ExportDefaultDeclaration() {
			if (!moduleUseClient) return false;
			namedExports.set("default", "default");
		},
		ExportDefaultSpecifier() {
			if (!moduleUseClient) return false;
			namedExports.set("default", "default");
		},
		ExportNamedDeclaration(path) {
			for (const specifier of path.node.specifiers) {
				if (t.isExportSpecifier(specifier)) {
					const exp = t.isIdentifier(specifier.exported)
						? specifier.exported.name
						: specifier.exported.value;
					namedExports.set(exp, specifier.local.name);
				}
			}

			if (t.isVariableDeclaration(path.node.declaration)) {
				for (const declaration of path.node.declaration.declarations) {
					if (t.isIdentifier(declaration.id)) {
						namedExports.set(declaration.id.name, declaration.id.name);
					}
				}
			} else if (t.isFunctionDeclaration(path.node.declaration)) {
				if (path.node.declaration.id) {
					namedExports.set(
						path.node.declaration.id.name,
						path.node.declaration.id.name,
					);
				}
			}
		},
		ArrowFunctionExpression(path) {
			if (moduleUseClient) return false;
			const tlb = getTopLevelBinding(path);
			if (tlb && tlb.scope === path.scope.getProgramParent()) {
				topLevelFunctions.add(tlb.identifier.name);
			}
			if (!tlb && hasUseServerDirective(path)) {
				const vars = getNonLocalVariables(path);
				const { getReplacement } = extractInlineActionToTopLevel(path, {
					addCryptImport,
					addRSDServerImport() {
						return once(`import { ${importServer} } from "${importFrom}"`, () =>
							addNamedImport(programPath, importServer, importFrom),
						);
					},
					id: id("use server"),
					vars: Array.from(vars),
					wrapBoundArgs(expr) {
						const wrapperFn = t.cloneNode(defineBoundArgsWrapperHelper());
						return t.callExpression(wrapperFn, [
							t.arrowFunctionExpression([], expr),
						]);
					},
				});

				path.replaceWith(getReplacement());
			}
		},
		FunctionDeclaration(path) {
			if (moduleUseClient) return false;
			const tlb = getTopLevelBinding(path);
			if (tlb && tlb.scope === path.scope.getProgramParent()) {
				topLevelFunctions.add(tlb.identifier.name);
			}
			if (!tlb && hasUseServerDirective(path)) {
				const vars = getNonLocalVariables(path);
				const { extractedIdentifier, getReplacement } =
					extractInlineActionToTopLevel(path, {
						addCryptImport,
						addRSDServerImport() {
							return once(
								`import { ${importServer} } from "${importFrom}"`,
								() => addNamedImport(programPath, importServer, importFrom),
							);
						},
						id: id("use server"),
						vars: Array.from(vars),
						wrapBoundArgs(expr) {
							const wrapperFn = t.cloneNode(defineBoundArgsWrapperHelper());
							return t.callExpression(wrapperFn, [
								t.arrowFunctionExpression([], expr),
							]);
						},
					});

				const tlb = getTopLevelBinding(path);
				const fnId = path.node.id;
				if (!fnId) {
					throw new Error("Expected a function with an id");
				}
				if (tlb) {
					// we're at the top level, and we might be enclosed within a `export` decl.
					// we have to keep the export in place, because it might be used elsewhere,
					// so we can't just remove this node.
					// replace the function decl with a (hopefully) equivalent var declaration
					// `var [name] = $$INLINE_ACTION_{N}`
					// TODO: this'll almost certainly break when using default exports,
					// but tangle's build doesn't support those anyway
					const bindingKind = "var";
					const [inserted] = path.replaceWith(
						t.variableDeclaration(bindingKind, [
							t.variableDeclarator(fnId, extractedIdentifier),
						]),
					);
					tlb.scope.registerBinding(bindingKind, inserted);
				} else {
					// note: if we do this *after* adding the new declaration, the bindings get messed up
					path.remove();
					// add a declaration in the place where the function decl would be hoisted to.
					// (this avoids issues with functions defined after `return`, see `test-cases/named-after-return.jsx`)
					path.scope.push({
						id: fnId,
						init: getReplacement(),
						kind: "var",
						unique: true,
					});
				}
			}
		},
		FunctionExpression(path) {
			if (moduleUseClient) return false;
			const tlb = getTopLevelBinding(path);
			if (tlb && tlb.scope === path.scope.getProgramParent()) {
				topLevelFunctions.add(tlb.identifier.name);
			}

			if (!tlb && hasUseServerDirective(path)) {
				const vars = getNonLocalVariables(path);
				const { getReplacement } = extractInlineActionToTopLevel(path, {
					addCryptImport,
					addRSDServerImport() {
						return once(`import { ${importServer} } from "${importFrom}"`, () =>
							addNamedImport(programPath, importServer, importFrom),
						);
					},
					id: id("use server"),
					vars: Array.from(vars),
					wrapBoundArgs(expr) {
						const wrapperFn = t.cloneNode(defineBoundArgsWrapperHelper());
						return t.callExpression(wrapperFn, [
							t.arrowFunctionExpression([], expr),
						]);
					},
				});

				path.replaceWith(getReplacement());
			}
		},
	});

	if (moduleUseClient && hasUseServer) {
		throw new Error(
			'Cannot have both "use client" and "use server" in the same module',
		);
	}

	if (moduleUseServer) {
		for (const [publicName, localName] of namedExports) {
			if (!topLevelFunctions.has(localName)) {
				continue;
			}
			if (publicName === "default") {
				throw new Error(
					"Cannot use default export with 'use server' at module scope.",
				);
			}

			once(`export:${localName}`, () => {
				const toCall = once(
					`import { ${importServer} } from "${importFrom}"`,
					() => addNamedImport(programPath, importServer, importFrom),
				);

				ast.program.body.push(
					t.expressionStatement(
						t.callExpression(toCall, [
							t.identifier(localName),
							t.stringLiteral(id("use server")),
							t.stringLiteral(publicName),
						]),
					),
				);
			});
		}
	} else if (moduleUseClient) {
		ast.program.directives = ast.program.directives.filter(
			(d) => d.value.value !== "use client",
		);
		ast.program.body = [];
		for (const [publicName, localName] of namedExports) {
			once(`export:${localName}`, () => {
				const toCall = once(
					`import { ${importClient} } from "${importFrom}"`,
					() => addNamedImport(programPath, importClient, importFrom),
				);

				if (publicName === "default") {
					ast.program.body.push(
						t.exportDefaultDeclaration(
							t.callExpression(toCall, [
								t.objectExpression([]),
								t.stringLiteral(id("use client")),
								t.stringLiteral(publicName),
							]),
						),
					);
				} else {
					ast.program.body.push(
						t.exportNamedDeclaration(
							t.variableDeclaration("const", [
								t.variableDeclarator(
									t.identifier(publicName),
									t.callExpression(toCall, [
										t.objectExpression([]),
										t.stringLiteral(id("use client")),
										t.stringLiteral(publicName),
									]),
								),
							]),
						),
					);
				}
			});
		}
	}
}

function getNonLocalVariables(path: FnPath) {
	const nonLocalVariables = new Set<string>();
	const programScope = path.scope.getProgramParent();

	path.traverse({
		Identifier(identPath) {
			const { name } = identPath.node;
			if (nonLocalVariables.has(name) || !identPath.isReferencedIdentifier()) {
				return;
			}

			const binding = identPath.scope.getBinding(name);
			if (!binding) {
				// probably a global, or an unbound variable. ignore it.
				return;
			}
			if (binding.scope === programScope) {
				// module-level declaration. no need to close over it.
				return;
			}

			if (
				// function args or a var at the top-level of its body
				binding.scope === path.scope ||
				// decls from blocks within the function
				isChildScope({
					parent: path.scope,
					child: binding.scope,
					root: programScope,
				})
			) {
				// the binding came from within the function = it's not closed-over, so don't add it.
				return;
			}

			nonLocalVariables.add(name);
		},
	});

	return nonLocalVariables;
}

function isChildScope({
	root,
	parent,
	child,
}: {
	root: Scope;
	parent: Scope;
	child: Scope;
}) {
	let curScope = child;
	while (curScope !== root) {
		if (curScope.parent === parent) {
			return true;
		}
		curScope = curScope.parent;
	}
	return false;
}

function findImmediatelyEnclosingDeclaration(path: FnPath) {
	let currentPath: NodePath = path;
	while (!currentPath.isProgram()) {
		if (
			// const foo = async () => { ... }
			//       ^^^^^^^^^^^^^^^^^^^^^^^^^
			currentPath.isVariableDeclarator() ||
			// async function foo() { ... }
			// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			currentPath.isDeclaration()
		) {
			return currentPath;
		}
		// if we encounter an expression on the way, this isn't a top level decl, and needs to be hoisted.
		// e.g. `export const foo = withAuth(async () => { ... })`
		if (currentPath !== path && currentPath.isExpression()) {
			return null;
		}
		if (!currentPath.parentPath) {
			return null;
		}
		currentPath = currentPath.parentPath;
	}
	return null;
}

function getTopLevelBinding(path: FnPath) {
	const decl = findImmediatelyEnclosingDeclaration(path);
	if (!decl) {
		return null;
	}

	if (!("id" in decl.node) || !decl.node.id) {
		return null;
	}
	if (!("name" in decl.node.id)) {
		return null;
	}

	const declBinding = decl.scope.getBinding(decl.node.id.name);
	if (!declBinding) return null;
	const isTopLevel = declBinding.scope === path.scope.getProgramParent();

	return isTopLevel ? declBinding : null;
}

function extractInlineActionToTopLevel(
	path: NodePath<
		t.ArrowFunctionExpression | t.FunctionDeclaration | t.FunctionExpression
	>,
	ctx: {
		addCryptImport(): {
			decryptFn: t.Identifier;
			encryptFn: t.Identifier;
		} | null;
		addRSDServerImport(): t.Identifier;
		id: string;
		vars: string[];
		wrapBoundArgs(boundArgs: t.Expression): t.Expression;
	},
) {
	const { addCryptImport, addRSDServerImport, id, vars } = ctx;

	const moduleScope = path.scope.getProgramParent();
	const extractedIdentifier =
		moduleScope.generateUidIdentifier("$$INLINE_ACTION");

	let extractedFunctionParams = [...path.node.params];
	let extractedFunctionBody: t.Statement[] = [path.node.body] as t.Statement[];

	if (vars.length > 0) {
		// only add a closure object if we're not closing over anything.
		// const [x, y, z] = await _decryptActionBoundArgs(await $$CLOSURE.value);

		const encryption = addCryptImport();

		const closureParam = path.scope.generateUidIdentifier("$$CLOSURE");
		const freeVarsPat = t.arrayPattern(
			vars.map((variable) => t.identifier(variable)),
		);

		const closureExpr = encryption
			? t.awaitExpression(
					t.callExpression(encryption.decryptFn, [
						t.awaitExpression(
							t.memberExpression(
								closureParam,
								t.identifier(LAZY_WRAPPER_VALUE_KEY),
							),
						),
						t.stringLiteral(id),
						t.stringLiteral(extractedIdentifier.name),
					]),
				)
			: t.memberExpression(closureParam, t.identifier(LAZY_WRAPPER_VALUE_KEY));

		extractedFunctionParams = [closureParam, ...path.node.params];
		extractedFunctionBody = [
			t.variableDeclaration("var", [
				t.variableDeclarator(t.assignmentPattern(freeVarsPat, closureExpr)),
			]),
			...extractedFunctionBody,
		];
	}

	const wrapInRegister = (expr: t.Expression, exportedName: string) => {
		const registerServerReferenceId = addRSDServerImport();

		return t.callExpression(registerServerReferenceId, [
			expr,
			t.stringLiteral(id),
			t.stringLiteral(exportedName),
		]);
	};

	const extractedFunctionExpr = wrapInRegister(
		t.arrowFunctionExpression(
			extractedFunctionParams,
			t.blockStatement(extractedFunctionBody),
			true /* async */,
		),
		extractedIdentifier.name,
	);

	// Create a top-level declaration for the extracted function.
	const bindingKind = "const";
	const functionDeclaration = t.exportNamedDeclaration(
		t.variableDeclaration(bindingKind, [
			t.variableDeclarator(extractedIdentifier, extractedFunctionExpr),
		]),
	);

	// TODO: this is cacheable, no need to recompute
	const programBody = moduleScope.path.get("body");
	const lastImportPath = findLast(
		Array.isArray(programBody) ? programBody : [programBody],
		(stmt) => stmt.isImportDeclaration(),
	);
	if (!lastImportPath) {
		throw new Error("Could not find last import declaration");
	}

	const [inserted] = lastImportPath.insertAfter(functionDeclaration);
	moduleScope.registerBinding(bindingKind, inserted);

	return {
		extractedIdentifier,
		getReplacement: () =>
			getInlineActionReplacement(extractedIdentifier, vars, ctx),
	};
}

function getInlineActionReplacement(
	actionId: t.Identifier,
	vars: string[],
	{
		addCryptImport,
		id,
		wrapBoundArgs,
	}: {
		addCryptImport(): {
			decryptFn: t.Identifier;
			encryptFn: t.Identifier;
		} | null;
		addRSDServerImport(): t.Identifier;
		id: string;
		wrapBoundArgs(boundArgs: t.Expression): t.Expression;
	},
) {
	if (vars.length === 0) {
		return actionId;
	}
	const encryption = addCryptImport();

	const capturedVarsExpr = t.arrayExpression(
		vars.map((variable) => t.identifier(variable)),
	);
	const boundArgs = wrapBoundArgs(
		encryption
			? t.callExpression(encryption.encryptFn, [
					capturedVarsExpr,
					t.stringLiteral(id),
					t.stringLiteral(actionId.name),
				])
			: capturedVarsExpr,
	);

	// _ACTION.bind(null, { get value() { return _encryptActionBoundArgs([x, y, z]) } })

	return t.callExpression(t.memberExpression(actionId, t.identifier("bind")), [
		t.nullLiteral(),
		boundArgs,
	]);
}

function findLastIndex<T>(
	arr: T[],
	pred: (el: T) => boolean,
): number | undefined {
	for (let i = arr.length - 1; i >= 0; i--) {
		const el = arr[i];
		if (pred(el)) {
			return i;
		}
	}
	return undefined;
}

function findLast<T>(arr: T[], pred: (el: T) => boolean): T | undefined {
	const index = findLastIndex(arr, pred);
	if (index === undefined) {
		return undefined;
	}
	return arr[index];
}
