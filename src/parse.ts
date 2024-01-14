import * as oxy from "@oxidation-compiler/napi";
import * as esbuild from "esbuild";

import type {
  FunctionExpression,
  Directive,
  FunctionDeclaration,
  Program,
  ArrowExpression,
} from "./ast";

export type DirectiveParseResult = {
  directive: "use client" | "use server";
  exports: Map<string, string>;
};

export type ParseResult = { directive: false } | DirectiveParseResult;

export async function parse(
  source: string,
  filePath: string
): Promise<ParseResult> {
  if (!source.match(/["']use (server|client)["']/)) {
    return { directive: false };
  }

  if (filePath.match(/\.tsx?$/) || filePath.endsWith("x")) {
    const transformed = await esbuild.transform(source, {
      loader: filePath.endsWith("x") ? "ts" : "tsx",
    });
    source = transformed.code;
  }

  const parseResult = await oxy.parseAsync(source, {
    sourceFilename: filePath,
  });
  const program = JSON.parse(parseResult.program) as Program;

  const directives = new Set<"use client" | "use server">();

  const processDirectives = (
    dirs: Directive[] | undefined,
    storeIn: Set<"use client" | "use server">
  ) => {
    for (const directive of dirs ?? []) {
      if (
        directive.directive === "use client" ||
        directive.directive === "use server"
      ) {
        storeIn.add(directive.directive);
        directives.add(directive.directive);
      }
    }

    if (storeIn.size > 1) {
      throw new Error(
        'Cannot have both "use client" and "use server" directives in the same module'
      );
    }

    return storeIn.size == 1;
  };

  const directivesAtProgramScope = new Set<"use client" | "use server">();
  processDirectives(program.directives, directivesAtProgramScope);

  const annotatedFunctions = new Set<string>();
  const aliasedExports = new Map<string, string>();
  const potentialExports = new Map<string, string>();
  const annotatedExports = new Map<string, string>();

  const processFunctionDeclaration = (declaration: FunctionDeclaration) => {
    const localName = declaration.id?.name;
    if (!localName) return;
    const localDirectives = new Set(directivesAtProgramScope);
    if (processDirectives(declaration.body?.directives, localDirectives)) {
      annotatedFunctions.add(localName);
    }
    return localName;
  };

  const processFunctionExpression = (
    expression: FunctionExpression,
    assignedTo?: string
  ) => {
    const localName = expression.id?.name ?? assignedTo;
    if (!localName) return;
    const localDirectives = new Set(directivesAtProgramScope);
    if (processDirectives(expression.body?.directives, localDirectives)) {
      annotatedFunctions.add(localName);
    }
    return localName;
  };

  const processArrowExpression = (
    expression: ArrowExpression,
    localName: string
  ) => {
    if (!localName) return;
    const localDirectives = new Set(directivesAtProgramScope);
    if (processDirectives(expression.body?.directives, localDirectives)) {
      annotatedFunctions.add(localName);
    }
    return localName;
  };

  for (const node of program.body ?? []) {
    switch (node.type) {
      case "ExportNamedDeclaration": {
        switch (node.declaration?.type) {
          case "FunctionDeclaration": {
            const localName = processFunctionDeclaration(node.declaration);
            if (localName) {
              annotatedExports.set(localName, localName);
            }
            break;
          }
          case "VariableDeclaration": {
            for (const declaration of node.declaration.declarations) {
              switch (declaration.init?.type) {
                case "ArrowExpression": {
                  const localName = processArrowExpression(
                    declaration.init,
                    declaration.id.kind.name
                  );
                  if (localName) {
                    potentialExports.set(declaration.id.kind.name, localName);
                  }
                  break;
                }
                case "FunctionExpression": {
                  const localName = processFunctionExpression(
                    declaration.init,
                    declaration.id.kind.name
                  );
                  if (localName) {
                    potentialExports.set(declaration.id.kind.name, localName);
                  }
                  break;
                }
                case "CallExpression": {
                  switch (declaration.init.callee.type) {
                    case "IdentifierReference": {
                      if (declaration.init.callee.name === "forwardRef") {
                        annotatedFunctions.add(declaration.id.kind.name);
                        potentialExports.set(
                          declaration.id.kind.name,
                          declaration.id.kind.name
                        );
                      }
                      break;
                    }
                    case "StaticMemberExpression": {
                      if (
                        declaration.init.callee.object.type ===
                          "IdentifierReference" &&
                        declaration.init.callee.object.name === "React" &&
                        declaration.init.callee.property.type ===
                          "IdentifierName" &&
                        declaration.init.callee.property.name === "forwardRef"
                      ) {
                        annotatedFunctions.add(declaration.id.kind.name);
                        potentialExports.set(
                          declaration.id.kind.name,
                          declaration.id.kind.name
                        );
                      }
                    }
                  }
                }
              }
            }
            break;
          }
        }

        for (const specifier of node.specifiers ?? []) {
          potentialExports.set(specifier.exported.name, specifier.local.name);
          break;
        }
        break;
      }
      case "ExportDefaultDeclaration": {
        switch (node.declaration.type) {
          case "FunctionDeclaration": {
            const localName = processFunctionDeclaration(node.declaration);
            if (localName) {
              aliasedExports.set(node.exported.name, localName);
            }
            break;
          }
          case "VariableDeclaration": {
            for (const declaration of node.declaration.declarations) {
              switch (declaration.init?.type) {
                case "FunctionExpression": {
                  const localName = processFunctionExpression(
                    declaration.init,
                    declaration.id.kind.name
                  );
                  if (localName) {
                    annotatedExports.set(node.exported.name, localName);
                  }
                  break;
                }
              }
            }
            break;
          }
          case "IdentifierReference": {
            potentialExports.set(node.exported.name, node.declaration.name);
            break;
          }
        }
        break;
      }
      case "FunctionDeclaration": {
        processFunctionDeclaration(node);
        break;
      }
      case "VariableDeclaration": {
        for (const declaration of node.declarations) {
          switch (declaration.init?.type) {
            case "ArrowExpression": {
              const localName = processArrowExpression(
                declaration.init,
                declaration.id.kind.name
              );
              if (localName) {
                potentialExports.set(localName, localName);
              }
              break;
            }
            case "FunctionExpression": {
              const localName = processFunctionExpression(
                declaration.init,
                declaration.id.kind.name
              );
              if (localName) {
                annotatedExports.set(declaration.id.kind.name, localName);
              }
              break;
            }
            case "CallExpression": {
              switch (declaration.init.callee.type) {
                case "IdentifierReference": {
                  if (declaration.init.callee.name === "forwardRef") {
                    annotatedFunctions.add(declaration.id.kind.name);
                    potentialExports.set(
                      declaration.id.kind.name,
                      declaration.id.kind.name
                    );
                  }
                  break;
                }
                case "StaticMemberExpression": {
                  if (
                    declaration.init.callee.object.type ===
                      "IdentifierReference" &&
                    declaration.init.callee.object.name === "React" &&
                    declaration.init.callee.property.type ===
                      "IdentifierName" &&
                    declaration.init.callee.property.name === "forwardRef"
                  ) {
                    annotatedFunctions.add(declaration.id.kind.name);
                    potentialExports.set(
                      declaration.id.kind.name,
                      declaration.id.kind.name
                    );
                  }
                }
              }
            }
          }
        }
        break;
      }
      case "ExpressionStatement": {
        if (
          node.expression.type === "AssignmentExpression" &&
          node.expression.left.type === "StaticMemberExpression" &&
          node.expression.left.object.type === "IdentifierReference" &&
          node.expression.left.object.name === "exports" &&
          node.expression.operator === "=" &&
          node.expression.left.property.type === "IdentifierName" &&
          node.expression.left.property.name
        ) {
          switch (node.expression.right.type) {
            case "IdentifierReference": {
              potentialExports.set(
                node.expression.left.property.name,
                node.expression.right.name
              );
              break;
            }
            case "FunctionExpression": {
              const localName = processFunctionExpression(
                node.expression.right
              );
              if (localName) {
                annotatedExports.set(
                  node.expression.left.property.name,
                  localName
                );
              }
              break;
            }
          }
        }
      }
    }
  }

  for (const [publicName, localName] of potentialExports) {
    let baseLocalName = localName;
    while (aliasedExports.has(baseLocalName)) {
      baseLocalName = aliasedExports.get(baseLocalName)!;
    }

    if (annotatedFunctions.has(localName)) {
      annotatedExports.set(publicName, localName);
    }
  }

  if (directives.size === 0) {
    return { directive: false };
  }

  if (directives.size > 1) {
    throw new Error(
      'Cannot have both "use client" and "use server" directives in the same module'
    );
  }

  return {
    directive: [...directives][0],
    exports: annotatedExports,
  };
}
