import "./v-scroll.js";

const app_el = document.querySelector("#app"),
  total_count = 60;

const html_text = Array.from({ length: total_count }, (_, idx) => `<p>Welcome to vibe ${idx}</p>`).join("");

if (app_el) {
  app_el.innerHTML = html_text;
}
