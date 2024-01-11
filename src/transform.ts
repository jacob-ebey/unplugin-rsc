import { type DirectiveParseResult } from "./parse";

export type Runtime = {
  module: string;
  function: string;
};

export function replaceExports(
  parsed: DirectiveParseResult,
  runtime: Runtime,
  id: string
) {
  let code = `import { ${runtime.function} as ___REPLACE_RUNTIME___ } from ${JSON.stringify(
    runtime.module
  )};\n`;
  const strId = JSON.stringify(id);
  for (const [exportedName] of parsed.exports) {
    code += `
export const ${exportedName} = ___REPLACE_RUNTIME___(
  {},
  ${strId},
  ${JSON.stringify(exportedName)}
);\n`;
  }

  return code;
}

export function wrapExports(
  code: string,
  parsed: DirectiveParseResult,
  runtime: Runtime,
  id: string
) {
  code =
    `import { ${runtime.function} as ___WRAP_RUNTIME___ } from ${JSON.stringify(
      runtime.module
    )};\n` +
    code +
    "\n";
  const strId = JSON.stringify(id);
  for (const [exportedName, internalName] of parsed.exports) {
    code += `if (typeof ${internalName} === "function") ___WRAP_RUNTIME___(${internalName}, ${strId}, ${JSON.stringify(
      exportedName
    )});\n`;
  }
  return code;
}
