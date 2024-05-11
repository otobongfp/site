import { defineConfig } from "astro/config";

import vercel from "@astrojs/vercel/serverless";

// https://astro.build/config
export default defineConfig({
  //   integrations: [
  //     // Enable Preact to support Preact JSX components.
  //     preact(),
  //     // Enable React for the Algolia search component.
  //     react(),
  //     tailwind(),
  //   ],
  site: `https://otobongfp.github.io/site/`,
  output: "server",
  outDir: "./docs",
  build: {
    assets: "astro",
  },
  adapter: vercel(),
});

// import { defineConfig } from "astro/config";

// // https://astro.build/config
// export default defineConfig({});
