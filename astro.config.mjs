//UNCOMMENT TO RUN ON REMOTE SERVER e.g vercel

import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  site: `https://otobongfp.github.io/site/`,
  output: "server",
  outDir: "./docs",
  build: {
    assets: "astro",
  },
  adapter: vercel(),
});

//UNCOMMENT TO RUN ON LOCAL

// import { defineConfig } from "astro/config";

// // https://astro.build/config
// export default defineConfig({});
