import { c as createAstro, d as createComponent, r as renderTemplate, g as renderComponent, m as maybeRenderHead } from '../astro_CKGtrHmX.mjs';
import 'kleur/colors';
import { g as getCollection, $ as $$ContactCTA } from './__AM4t2Yjc.mjs';
import { b as $$Hero, a as $$BaseLayout } from './404_C8f0_6CA.mjs';
import { $ as $$Grid, a as $$PortfolioPreview } from './index_xFoS9P6V.mjs';

const $$Astro = createAstro("https://otobongfp.github.io/site/");
const $$Work = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Work;
  const projects = (await getCollection("work")).sort(
    (a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf()
  );
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "My Work | Otobong Peter", "description": "Learn about Otobong Peter's most recent projects" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack gap-20"> <main class="wrapper stack gap-8"> ${renderComponent($$result2, "Hero", $$Hero, { "title": "My Work", "tagline": "See my most recent projects below to get an idea of my past experience.", "align": "start" })} ${renderComponent($$result2, "Grid", $$Grid, { "variant": "offset" }, { "default": ($$result3) => renderTemplate`${projects.map((project) => renderTemplate`<li> ${renderComponent($$result3, "PortfolioPreview", $$PortfolioPreview, { "project": project })} </li>`)}` })} </main> ${renderComponent($$result2, "ContactCTA", $$ContactCTA, {})} </div> ` })}`;
}, "/Users/peter/Documents/Projects/MySite/my-site/src/pages/work.astro", void 0);

const $$file = "/Users/peter/Documents/Projects/MySite/my-site/src/pages/work.astro";
const $$url = "/work";

export { $$Work as default, $$file as file, $$url as url };
