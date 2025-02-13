import type { NodePath, ParseResult } from "@babel/core";
import { types as t, traverse } from "@babel/core";
import { addNamed as addNamedImport } from "@babel/helper-module-imports";

export type ClientTransformOptions = {
	id(filename: string, directive: "use server"): string;
	importFrom: string;
	importServer: string;
};

export function clientTransform(
	ast: ParseResult,
	filename: string,
	{ id: _id, importFrom, importServer }: ClientTransformOptions,
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

	const id = (directive: "use server") =>
		once(`id:${filename}:${directive}`, () => _id(filename, directive));

	let programPath: NodePath<t.Program>;
	let moduleUseClient = false;
	let moduleUseServer = false;
	let hasUseServer = false;
	const namedExports = new Map<string, string>();

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
	});

	if (moduleUseClient && hasUseServer) {
		throw new Error(
			'Cannot have both "use client" and "use server" in the same module',
		);
	}

	if (moduleUseServer) {
		ast.program.directives = ast.program.directives.filter(
			(d) => d.value.value !== "use server",
		);
		ast.program.body = [];
		for (const [publicName, localName] of namedExports) {
			once(`export:${localName}`, () => {
				const toCall = once(
					`import { ${importServer} } from "${importFrom}"`,
					() => addNamedImport(programPath, importServer, importFrom),
				);

				if (publicName === "default") {
					throw new Error(
						"Cannot use default export with 'use server' at module scope.",
					);
				}

				ast.program.body.push(
					t.exportNamedDeclaration(
						t.variableDeclaration("const", [
							t.variableDeclarator(
								t.identifier(publicName),
								t.callExpression(toCall, [
									t.objectExpression([]),
									t.stringLiteral(id("use server")),
									t.stringLiteral(publicName),
								]),
							),
						]),
					),
				);
			});
		}
	}
}
