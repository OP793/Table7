(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("apply-form");
  const submit = $("submit");
  const stepEl = $("apply-step");
  const errorEl = $("apply-error");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
  }
  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }

  function renderProfile(c, mode) {
    $("profile-mode").textContent = mode === "demo" ? "Fictional demo profile" : mode === "claude" ? "Extracted by Claude" : "Keyword mode";
    const row = (k, v) => (v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : "");
    const list = (k, items) => (items && items.length
      ? `<dt>${esc(k)}</dt><dd><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></dd>` : "");
    $("profile-card").innerHTML = `
      <div class="profile">
        <div class="card-head">
          <div>
            <h3>${esc(c.name)}</h3>
            <p class="sub">${esc([c.headline, c.location].filter(Boolean).join(" · "))}</p>
          </div>
          <div class="badges">${c.demo ? '<span class="badge sample">Demo import</span>' : '<span class="badge pool">Opted in</span>'}</div>
        </div>
        <dl>
          ${row("University", c.university)}
          ${row("Degree", c.degree)}
          ${row("Graduated", c.grad_year)}
          ${row("Email", c.email)}
          ${row("LinkedIn", c.linkedin_url)}
          ${row("Summary", c.summary)}
          ${list("Skills", c.skills)}
          ${list("Experience", c.experience)}
        </dl>
      </div>`;
    $("profile").classList.remove("hidden");
    $("profile").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- demo LinkedIn import (fictional data only) ---------- */
  const demoBtn = $("demo-import");
  const demoSteps = $("demo-steps");
  const demoError = $("demo-error");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const STEPS = ["Connecting to profile", "Reading experience", "Reading education", "Matching skills"];

  demoBtn.addEventListener("click", async () => {
    demoError.classList.add("hidden");
    if (!$("demo-consent").checked) {
      demoError.textContent = "Tick the box to add the demo profile to the pool.";
      demoError.classList.remove("hidden");
      return;
    }
    demoBtn.disabled = true;
    demoSteps.innerHTML = STEPS.map((s) => `<li>${esc(s)}</li>`).join("");
    demoSteps.classList.remove("hidden");
    const items = [...demoSteps.children];
    const request = fetch("/api/linkedin-import-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: "true" }),
    });
    for (const li of items) {
      li.classList.add("active");
      await wait(550);
      li.classList.remove("active");
      li.classList.add("done");
    }
    try {
      const r = await request;
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Import failed (${r.status})`);
      renderProfile(data.candidate, data.mode);
    } catch (err) {
      demoError.textContent = err.message;
      demoError.classList.remove("hidden");
    } finally {
      demoBtn.disabled = false;
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const file = $("cv").files[0];
    if (!file) return showError("Please choose a CV file.");
    if (file.size > 5 * 1024 * 1024) return showError("That file is over 5 MB.");
    const email = $("email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Please enter a valid email so employers can contact you.");
    if (!$("consent").checked) return showError("Please tick the consent box so we can store your profile.");

    const fd = new FormData();
    fd.append("cv", file);
    fd.append("consent", "true");
    fd.append("email", email);
    if ($("linkedin").value.trim()) fd.append("linkedin_url", $("linkedin").value.trim());

    submit.disabled = true;
    stepEl.textContent = "Reading your CV…";
    try {
      const r = await fetch("/api/cv", { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Upload failed (${r.status})`);
      stepEl.textContent = "Done. You're in the pool.";
      renderProfile(data.candidate, data.mode);
    } catch (err) {
      stepEl.textContent = "";
      showError(err.message);
    } finally {
      submit.disabled = false;
    }
  });
})();
