import { watch } from "fs";
import { join } from "path";

const isWatch = process.argv.includes("--watch");

async function build() {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "src/main.ts")],
    outdir: join(import.meta.dir, "public"),
    naming: "bundle.js",
    minify: !isWatch,
    sourcemap: isWatch ? "inline" : "none",
    target: "browser",
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  // Copy styles.css to public/
  const css = await Bun.file(join(import.meta.dir, "src/styles.css")).text();
  await Bun.write(join(import.meta.dir, "public/styles.css"), css);

  console.log("Build complete.");
}

await build();

if (isWatch) {
  console.log("Watching for changes...");
  const srcDir = join(import.meta.dir, "src");
  watch(srcDir, { recursive: true }, async (event, filename) => {
    console.log(`Change detected: ${filename}`);
    try {
      await build();
    } catch (err) {
      console.error("Rebuild failed:", err);
    }
  });
}
