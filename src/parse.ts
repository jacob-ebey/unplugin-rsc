import * as oxy from "@oxidation-compiler/napi";
import * as esbuild from "esbuild";

import type {
  FunctionExpression,
  FunctionDeclaration,
  Program,
  VariableDeclarator,
  ExpressionStatement,
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
  let directiveMatches = Array.from(
    source.matchAll(/["']use (server|client)["']/g)
  );
  if (!directiveMatches.length) return { directive: false };

  let format: null | "cjs" | "esm" = null;
  if (source.match(/\bexport\b/g)) format = "esm";
  else if (source.match(/\bexports\./g)) format = "cjs";

  if (!format) {
    return { directive: false };
  }

  if (filePath.match(/\.tsx?$/) || filePath.endsWith("x")) {
    const transformed = await esbuild.transform(source, {
      loader: filePath.endsWith("x") ? "ts" : "tsx",
      minify: false,
      format,
      minifyIdentifiers: false,
      minifySyntax: false,
      minifyWhitespace: false,
      keepNames: true,
    });
    source = transformed.code;
  }

  directiveMatches = Array.from(
    source.matchAll(/["']use (server|client)["']/g)
  );
  if (!directiveMatches.length) return { directive: false };

  const parseResult = await oxy.parseAsync(source, {
    sourceFilename: filePath,
  });
  const program = JSON.parse(parseResult.program) as Program;

  const directives = new Set<"use client" | "use server">();

  const annotatedExports = new Map<string, string>();

  const parseDirective = (directive: any) => {
    if (directive.parent?.type !== "FunctionBody") {
      return;
    }

    const names = [];
    let current = directive.parent.parent;
    while (current) {
      switch (current.type) {
        case "FunctionDeclaration": {
          const dec = current as FunctionDeclaration;
          if (dec.id?.name) {
            names.push(current.id.name);
          }
          break;
        }
        case "FunctionExpression": {
          const exp = current as FunctionExpression;
          if (exp.id?.name) {
            names.push(current.id.name);
          }
          break;
        }
        case "VariableDeclarator": {
          const dec = current as VariableDeclarator;
          if (dec.id.kind.name) {
            names.push(dec.id.kind.name);
          }
          break;
        }
      }
      current = current.parent;
    }

    if (!names.length) return;

    return {
      names,
      directive: directive.directive,
    };
  };

  let allExports = false;
  const annotatedFunctions = new Set<string>();
  const baseNames = new Map<string, string>();

  const getBaseName = (name: string): string => {
    const next = baseNames.get(name);
    if (next) {
      return getBaseName(next);
    }
    return name;
  };

  for (const directiveMatch of directiveMatches) {
    const index = directiveMatch.index;
    if (typeof index !== "number") continue;
    let foundNode = findNodeAtPosition(program, {
      start: index,
      end: index + directiveMatch[0].length,
    });
    foundNode = foundNode?.parent;
    if (foundNode?.type !== "Directive") continue;
    directives.add(foundNode.directive as "use client" | "use server");

    switch (foundNode.parent.type) {
      case "Program":
        allExports = true;
        break;
      default:
        const parsed = parseDirective(foundNode);
        if (!parsed) break;
        let i = 0;
        for (const name of parsed.names) {
          if (i++ > 0) {
            baseNames.set(name, parsed.names[0]);
          }
          annotatedFunctions.add(name);
        }
        break;
    }
  }

  for (const node of program.body ?? []) {
    switch (node.type) {
      case "VariableDeclaration": {
        for (const declaration of node.declarations ?? []) {
          if (declaration.init.type !== "IdentifierReference") continue;
          baseNames.set(declaration.id.kind.name, declaration.init.name);
        }
        break;
      }
      case "ExportDefaultDeclaration": {
        switch (node.declaration?.type) {
          case "FunctionDeclaration": {
            const baseName = getBaseName(node.declaration.id?.name ?? "");
            if (baseName && (allExports || annotatedFunctions.has(baseName))) {
              annotatedExports.set("default", baseName);
            }
            break;
          }
          case "IdentifierReference": {
            const baseName = getBaseName(node.declaration.name);
            if (baseName && (allExports || annotatedFunctions.has(baseName))) {
              annotatedExports.set("default", getBaseName(baseName));
            }
            break;
          }
        }
        break;
      }
      case "ExportNamedDeclaration": {
        for (const specifier of node.specifiers ?? []) {
          const baseName = getBaseName(specifier.local.name);
          if (baseName && (allExports || annotatedFunctions.has(baseName))) {
            annotatedExports.set(specifier.exported.name, baseName);
          }
        }
      }
      case "ExpressionStatement": {
        const stmt = node as ExpressionStatement;
        if (
          stmt.expression?.type === "AssignmentExpression" &&
          stmt.expression.left.type === "StaticMemberExpression" &&
          stmt.expression.left.object.type === "IdentifierReference" &&
          stmt.expression.left.object.name === "exports" &&
          stmt.expression.operator === "=" &&
          stmt.expression.left.property.type === "IdentifierName" &&
          stmt.expression.left.property.name
        ) {
          switch (stmt.expression.right.type) {
            case "IdentifierReference": {
              const baseName = getBaseName(stmt.expression.right.name);
              if (
                baseName &&
                (allExports || annotatedFunctions.has(baseName))
              ) {
                annotatedExports.set(
                  stmt.expression.left.property.name,
                  baseName
                );
              }
              break;
            }
            case "FunctionExpression": {
              const baseName = stmt.expression.right.id?.name ?? "";
              if (
                baseName &&
                (allExports || annotatedFunctions.has(baseName))
              ) {
                annotatedExports.set(
                  stmt.expression.left.property.name,
                  baseName
                );
              }
              break;
            }
          }
        }
      }
    }
  }

  if (!directives.size) {
    return {
      directive: false,
    };
  }

  if (directives.size > 1) {
    throw new Error(
      `Can not use both "use client" and "use server" in the same file`
    );
  }

  return {
    directive: [...directives][0],
    exports: annotatedExports,
  };
}

function findNodeAtPosition(
  ast: any,
  position: { start: number; end: number }
): any {
  let resultNode: any = null;

  // Recursive function to traverse the AST and find the node
  function traverse(node: any, parent?: any) {
    // early returns
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const child of node) {
        traverse(child, parent);
      }
      return;
    }

    if (parent && !node.parent) node.parent = parent;

    if (node.start === position.start && node.end === position.end) {
      resultNode = node;
    }

    // Traverse the node's children
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      traverse(node[key], node);
    }
  }

  // Start traversal from the root AST node
  traverse(ast);

  return resultNode;
}
