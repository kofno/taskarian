import { build, emptyDir } from "https://deno.land/x/dnt@0.39.0/mod.ts";

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {
    deno: true,
  },
  package: {
    // package.json properties
    name: "taskarian",
    version: Deno.args[0],
    description: "A lazy monad in TypeScript",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/kofno/taskarian.git",
    },
    bugs: {
      url: "https://github.com/kofno/taskarian/issues",
    },
  },
  postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("readme.md", "npm/readme.md");
  },
});
