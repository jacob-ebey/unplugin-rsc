import { createUnplugin } from "unplugin";
import { createFilter, type FilterPattern } from "@rollup/pluginutils";

import { parse } from "./parse";
import { replaceExports, wrapExports } from "./transform";

export type Directive = "use client" | "use server";

interface BaseOptions {
  include?: FilterPattern;
  exclude?: FilterPattern | undefined;
  transformModuleId(id: string, type: Directive): string;
  onModuleFound?(id: string, type: Directive): void;
}

export interface Runtime {
  module: string;
  function: string;
}

export interface RSCServerPluginOptions extends BaseOptions {
  useClientRuntime: Runtime;
  useServerRuntime: Runtime;
}

export const rscServerPlugin = createUnplugin<RSCServerPluginOptions>(
  (options) => {
    const transformModuleId = options.transformModuleId;
    const useClientRuntime = options.useClientRuntime;
    const useServerRuntime = options.useServerRuntime;
    const onModuleFound = options.onModuleFound;
    const filter = createFilter(options.include, options.exclude);

    return {
      name: "rsc-server",
      transformInclude(id) {
        return filter(id);
      },
      async transform(code, id) {
        const parsed = await parse(code, id);
        if (!parsed.directive) {
          return code;
        }

        if (parsed.directive === "use server") {
          onModuleFound?.(id, parsed.directive);

          return wrapExports(
            code,
            parsed,
            useServerRuntime,
            transformModuleId(id, parsed.directive)
          );
        }

        if (parsed.directive === "use client") {
          onModuleFound?.(id, parsed.directive);

          return replaceExports(
            parsed,
            useClientRuntime,
            transformModuleId(id, parsed.directive)
          );
        }

        return code;
      },
    };
  }
);

export interface RSCClientPluginOptions extends BaseOptions {
  useServerRuntime: Runtime;
}

export const rscClientPlugin = createUnplugin<RSCClientPluginOptions>(
  (options) => {
    const transformModuleId = options.transformModuleId;
    const useServerRuntime = options.useServerRuntime;
    const onModuleFound = options.onModuleFound;
    const filter = createFilter(options.include, options.exclude);

    return {
      name: "rsc-client",
      transformInclude(id) {
        return filter(id);
      },
      async transform(code, id) {
        const parsed = await parse(code, id);
        if (!parsed.directive) {
          return code;
        }

        if (parsed.directive === "use server") {
          onModuleFound?.(id, parsed.directive);

          return replaceExports(
            parsed,
            useServerRuntime,
            transformModuleId(id, parsed.directive)
          );
        }

        return code;
      },
    };
  }
);
