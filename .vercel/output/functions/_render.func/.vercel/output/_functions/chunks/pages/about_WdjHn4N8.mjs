import { c as createAstro, d as createComponent, r as renderTemplate, g as renderComponent, m as maybeRenderHead } from '../astro_CKGtrHmX.mjs';
import 'kleur/colors';
import { b as $$Hero, a as $$BaseLayout } from './404_C8f0_6CA.mjs';
import { $ as $$ContactCTA } from './__AM4t2Yjc.mjs';
/* empty css                          */

const $$Astro = createAstro("https://otobongfp.github.io/site/");
const $$About = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$About;
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "About | Otobong Peter", "description": "About Otobong Peter Lorem Ipsum", "data-astro-cid-kh7btl4r": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="stack gap-20" data-astro-cid-kh7btl4r> <main class="wrapper about" data-astro-cid-kh7btl4r> ${renderComponent($$result2, "Hero", $$Hero, { "title": "About", "tagline": "Thanks for stopping by. Read below to learn more about myself and my background.", "data-astro-cid-kh7btl4r": true }, { "default": ($$result3) => renderTemplate` <img width="1553" height="873" src="/assets/at-work.jpg" alt="Otobong Peter speaking" data-astro-cid-kh7btl4r> ` })} <section data-astro-cid-kh7btl4r> <h2 class="section-title" data-astro-cid-kh7btl4r>Background</h2> <div class="content" data-astro-cid-kh7btl4r> <p data-astro-cid-kh7btl4r>
Hello Lorem ipsum dolor sit amet, <a href="https://astro.build/" data-astro-cid-kh7btl4r>Astro</a> makes people happy.
						Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Proin nibh nisl condimentum
						id venenatis a condimentum vitae. Dapibus ultrices in iaculis nunc. Arcu odio ut sem nulla
						pharetra diam sit amet. Diam quis enim lobortis scelerisque fermentum dui faucibus in ornare.
</p> <p data-astro-cid-kh7btl4r>
Arcu dui vivamus arcu felis bibendum ut tristique et egestas. Eget gravida cum sociis
						natoque penatibus. Cras fermentum odio eu feugiat pretium nibh. Proin nibh nisl
						condimentum id venenatis. Porta nibh venenatis cras sed felis eget velit. Id diam vel
						quam elementum pulvinar etiam non.
</p> <p data-astro-cid-kh7btl4r>
Ultrices tincidunt arcu non sodales neque sodales ut. Sed enim ut sem viverra aliquet
						eget sit amet. Lacus luctus accumsan tortor posuere ac ut consequat semper viverra.
						Viverra accumsan in nisl nisi scelerisque eu ultrices. In massa tempor nec feugiat nisl
						pretium fusce.
</p> </div> </section> <section data-astro-cid-kh7btl4r> <h2 class="section-title" data-astro-cid-kh7btl4r>Education</h2> <div class="content" data-astro-cid-kh7btl4r> <p data-astro-cid-kh7btl4r>Corporis voluptates tenetur laudantium.</p> </div> </section> <section data-astro-cid-kh7btl4r> <h2 class="section-title" data-astro-cid-kh7btl4r>Skills</h2> <div class="content" data-astro-cid-kh7btl4r> <p data-astro-cid-kh7btl4r>officia unde omnis</p> </div> </section> </main> ${renderComponent($$result2, "ContactCTA", $$ContactCTA, { "data-astro-cid-kh7btl4r": true })} </div> ` })} `;
}, "/Users/peter/Documents/Projects/MySite/my-site/src/pages/about.astro", void 0);

const $$file = "/Users/peter/Documents/Projects/MySite/my-site/src/pages/about.astro";
const $$url = "/about";

export { $$About as default, $$file as file, $$url as url };
