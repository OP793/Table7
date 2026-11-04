// One page, two views. The switch in the header swaps between them and
// remembers the choice in the URL (#hiring or #work) so links and refresh work.
(() => {
  const views = {
    hiring: { tab: document.getElementById("tab-hiring"), view: document.getElementById("view-hiring") },
    work: { tab: document.getElementById("tab-work"), view: document.getElementById("view-work") },
  };

  function show(name, push) {
    if (!views[name]) name = "hiring";
    for (const [key, { tab, view }] of Object.entries(views)) {
      const on = key === name;
      tab.setAttribute("aria-selected", String(on));
      view.classList.toggle("hidden", !on);
    }
    if (push) history.replaceState(null, "", `#${name}`);
  }

  views.hiring.tab.addEventListener("click", () => show("hiring", true));
  views.work.tab.addEventListener("click", () => show("work", true));
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));
  show(location.hash.slice(1));

  // Light up the 1-2-3 progress bar as each panel appears.
  function track(stepperFor, panelIds) {
    const steps = document.querySelectorAll(`.stepper[data-for="${stepperFor}"] li`);
    const panels = panelIds.map((id) => document.getElementById(id));
    const update = () => {
      let reached = 0;
      panels.forEach((p, i) => { if (p && !p.classList.contains("hidden")) reached = i + 1; });
      steps.forEach((li, i) => {
        li.classList.toggle("done", i < reached);
        li.classList.toggle("current", i === reached);
      });
    };
    const mo = new MutationObserver(update);
    panels.forEach((p) => p && mo.observe(p, { attributes: true, attributeFilter: ["class"] }));
    update();
  }
  track("hiring", ["spec-panel", "results"]);
  track("work", ["cv-panel", "profile-panel"]);
})();
