import * as oxy from "@oxidation-compiler/napi";

export type DirectiveParseResult = {
  directive: "use client" | "use server";
  exports: Map<string, string>;
};

export type ParseResult = { directive: false } | DirectiveParseResult;

// parse the program AST for exports:
// - if a directive exists at the program scope for "use server" or "use client" store all the exports in the "results" map
// - if one does not exist at the program scope, walk the AST and look for a directive at the function scope of the exports
export async function parse(
  source: string,
  filePath: string
): Promise<ParseResult> {
  if (!source.match(/["']use (server|client)["']/)) {
    return { directive: false };
  }

  const parseResult = await oxy.parseAsync(source, {
    sourceFilename: filePath,
  });
  const program = JSON.parse(parseResult.program);

  const directivesAtProgramScope = new Set<"use client" | "use server">();

  function hasDirective(directives: any[] | undefined, storeIn: Set<string>) {
    for (const directive of directives ?? []) {
      if (
        directive.directive === "use client" ||
        directive.directive === "use server"
      ) {
        storeIn.add(directive.directive);
      }
    }
  }

  hasDirective(program.directives, directivesAtProgramScope);
  if (directivesAtProgramScope.size > 1) {
    throw new Error(
      `Cannot have both "use client" and "use server" directives in the same module`
    );
  }

  const directives = new Set<"use client" | "use server">(
    directivesAtProgramScope
  );

  // A map where the keys are the public name of the export and the value is the internal name of the export for access withing the scope of the program
  const annotatedExports = new Map<string, string>();

  for (const node of program.body) {
    if (node.type === "ExportNamedDeclaration") {
      if (node.declaration) {
        if (node.declaration.id) {
          const directivesAtFunctionScope = new Set<"use client" | "use server">(
            directivesAtProgramScope
          );
          hasDirective(
            node.declaration.body?.directives,
            directivesAtFunctionScope
          );
          if (directivesAtFunctionScope.size > 0) {
            directivesAtFunctionScope.forEach((directive) => {
              directives.add(directive);
            });
            if (node.declaration.id.name) {
              annotatedExports.set(
                node.declaration.id.name,
                node.declaration.id.name
              );
            } else {
              throw new Error(
                `Local name does not exist for export ${node.declaration.id.name}`
              );
            }
          }
        } else if (node.declaration.declarations) {
          node.declaration.declarations.forEach((declaration: any) => {
            const directivesAtFunctionScope = new Set<"use client" | "use server">(
              directivesAtProgramScope
            );
            hasDirective(
              declaration.init?.body?.directives,
              directivesAtFunctionScope
            );
            if (directivesAtFunctionScope.size > 0) {
              directivesAtFunctionScope.forEach((directive) => {
                directives.add(directive);
              });
              if (declaration.id.kind.name) {
                annotatedExports.set(
                  declaration.id.kind.name,
                  declaration.id.kind.name
                );
              } else {
                throw new Error(
                  `Local name does not exist for export ${declaration.id.kind.name}`
                );
              }
            }
          });
        }
      }
      if (node.specifiers) {
        node.specifiers.forEach((specifier: any) => {
          if (specifier.local.name) {
            annotatedExports.set(specifier.exported.name, specifier.local.name);
          } else {
            throw new Error(
              `Local name does not exist for export ${specifier.exported.name}`
            );
          }
        });
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      if (node.declaration.name) {
        annotatedExports.set(node.exported.name, node.declaration.name);
      } else {
        throw new Error(
          `Local name does not exist for default export ${node.exported.name}`
        );
      }
    }
  }

  if (directives.size === 0) {
    return { directive: false };
  }

  if (directives.size > 1) {
    throw new Error(
      `Cannot have both "use client" and "use server" directives in the same module`
    );
  }

  return {
    directive: [...directives][0],
    exports: annotatedExports,
  };
}
