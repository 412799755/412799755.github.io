import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import cssnano from "cssnano";
import postcss from "postcss";
import postcssNesting from "postcss-nesting";
import { defineConfig } from "vite";

const cssToJsPlugin = () => {
  const outCssModule = async (root_dir) => {
    const src_css = resolve(root_dir, "src/v-scroll.css"),
      out_js = resolve(root_dir, "public/theme/v-scroll.js"),
      css_raw = await readFile(src_css, "utf8"),
      css_result = await postcss([postcssNesting(), cssnano()]).process(css_raw, {
        from: src_css
      }),
      js_code = `export default ${JSON.stringify(css_result.css.trim())};\n`;

    await mkdir(dirname(out_js), { recursive: true });
    await writeFile(out_js, js_code, "utf8");
  };

  return {
    name: "css-to-js-theme-module",
    configResolved: async (cfg) => {
      await outCssModule(cfg.root);
    }
  };
};

const importMapAliasPlugin = () => ({
  name: "import-map-alias-for-dollar-prefix",
  resolveId: (source) => {
    if (!source.startsWith("$/")) return null;
    return resolve(process.cwd(), "public/theme", source.slice(2));
  }
});

export default defineConfig({
  plugins: [cssToJsPlugin(), importMapAliasPlugin()]
});
