import * as fs from "node:fs";
import * as path from "node:path";

import { defineConfig } from "vitest/config";

import { rscClientPlugin, rscServerPlugin } from "./src/index";

function createOnModuleFound(filepath) {
  return (id: string, type: string) => {
    let mods = new Map();
    if (fs.existsSync(filepath)) {
      mods = new Map(JSON.parse(fs.readFileSync(filepath, "utf-8")));
    }
    mods.set(id, type);
    fs.writeFileSync(filepath, JSON.stringify(Array.from(mods)));
  };
}

function createTransformModuleId() {
  return (id: string) => {
    const relative = path.relative(process.cwd(), id).replace(/\\/g, "/");
    const transformed = "./" + relative.replace(/\.\.\//g, "__/");

    return transformed;
  };
}

export default defineConfig({
  test: {
    dir: "test",
  },
  plugins: [
    rscClientPlugin.vite({
      include: /[\\/]client\.*/,
      onModuleFound: createOnModuleFound("./transformed-modules-client.json"),
      transformModuleId: createTransformModuleId(),
      useServerRuntime: {
        module: "#test-runtime",
        function: "registerServerReference",
      },
    }),
    rscServerPlugin.vite({
      include: /[\\/]server\.*/,
      onModuleFound: createOnModuleFound("./transformed-modules-server.json"),
      transformModuleId: createTransformModuleId(),
      useServerRuntime: {
        module: "#test-runtime",
        function: "decorateServerAction",
      },
      useClientRuntime: {
        module: "#test-runtime",
        function: "registerClientReference",
      },
    }),
  ],
});
