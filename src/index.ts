import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { createUnplugin } from "unplugin";

import type { ClientTransformOptions } from "./client-transform.js";
import { clientTransform } from "./client-transform.js";

import type { ServerTransformOptions } from "./server-transform.js";
import { serverTransform } from "./server-transform.js";

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
          return clientTransform(code, id, options);
        },
      };
    }
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
          return serverTransform(code, id, options);
        },
      };
    }
  );
}
