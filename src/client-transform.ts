import type { BabelFileResult, PluginObj } from "@babel/core";
import { transform } from "@babel/core";
import { addNamed as addNamedImport } from "@babel/helper-module-imports";
import type { BabelAPI } from "@babel/helper-plugin-utils";

export type TransformResult = {
  code: string;
  map?: BabelFileResult["map"];
};

export type ClientTransformOptions = {
  id(filename: string, directive: "use server"): string;
  importFrom: string;
  importServer: string;
};

export function clientTransform(
  code: string,
  filename: string,
  { id: _id, importFrom, importServer }: ClientTransformOptions
): TransformResult {
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

  let didSkip = false;
  let moduleUseClient = false;
  let moduleUseServer = false;
  let hasUseServer = false;
  const namedExports = new Map<string, string>();

  const parsed = transform(code, {
    configFile: false,
    filename,
    plugins: [
      (api: BabelAPI): PluginObj => {
        const { types: t } = api;

        return {
          name: "rsc-client-transform",
          pre(file) {
            if (
              !file.code.includes("use client") &&
              !file.code.includes("use server")
            ) {
              didSkip = true;
              file.path.skip();
              return;
            }
          },
          post(file) {
            if (didSkip) return;

            if (moduleUseClient && hasUseServer) {
              throw new Error(
                'Cannot have both "use client" and "use server" in the same module'
              );
            }

            if (moduleUseServer) {
              file.ast.program.directives = file.ast.program.directives.filter(
                (d) => d.value.value !== "use server"
              );
              file.ast.program.body = [];
              for (const [publicName, localName] of namedExports) {
                once(`export:${localName}`, () => {
                  const toCall = once(
                    `import { ${importServer} } from "${importFrom}"`,
                    () => addNamedImport(file.path, importServer, importFrom)
                  );

                  if (publicName === "default") {
                    throw new Error(
                      "Cannot use default export with 'use server' at module scope."
                    );
                  }

                  file.ast.program.body.push(
                    t.exportNamedDeclaration(
                      t.variableDeclaration("const", [
                        t.variableDeclarator(
                          t.identifier(publicName),
                          t.callExpression(toCall, [
                            t.objectExpression([]),
                            t.stringLiteral(id("use server")),
                            t.stringLiteral(publicName),
                          ])
                        ),
                      ])
                    )
                  );
                });
              }
            }
          },
          visitor: {
            Program(path) {
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
                  'Cannot have both "use client" and "use server" in the same module'
                );
              }
              if (moduleUseServer) {
                path.node.directives = path.node.directives.filter(
                  (d) => d.value.value !== "use server"
                );
              }
              if (moduleUseClient) {
                path.node.directives = path.node.directives.filter(
                  (d) => d.value.value !== "use client"
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
                    path.node.declaration.id.name
                  );
                }
              }
            },
          },
        };
      },
    ],
  });

  if (!parsed) {
    return {
      code,
    };
  }

  return {
    code: parsed.code || code,
    map: parsed.map,
  };
}
