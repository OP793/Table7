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
    $("profile-mode").textContent = mode === "demo" ? "made-up demo profile" : mode === "claude" ? "read by Claude" : "keyword mode";
    const row = (k, v) => (v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : "");
    const list = (k, items) => (items && items.length
      ? `<dt>${esc(k)}</dt><dd><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></dd>` : "");
    $("profile-card").innerHTML = `
      <div class="profile">
        <h3>${esc(c.name)}${c.demo ? '<span class="src sample">demo import</span>' : '<span class="src pool">signed up</span>'}</h3>
        <p class="sub">${esc([c.headline, c.location].filter(Boolean).join(" — "))}</p>
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

  /* ---------- LinkedIn import demo (made-up data only) ---------- */
  const demoBtn = $("demo-import");
  const demoSteps = $("demo-steps");
  const demoError = $("demo-error");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const STEPS = ["Connecting to profile", "Reading experience", "Reading education", "Matching skills"];

  demoBtn.addEventListener("click", async () => {
    demoError.classList.add("hidden");
    if (!$("demo-consent").checked) {
      demoError.textContent = "Tick the box first to add the demo profile.";
      demoError.classList.remove("hidden");
      return;
    }
    demoBtn.disabled = true;
    demoSteps.innerHTML = STEPS.map((s) => `<li>${esc(s)}</li>`).join("");
    demoSteps.classList.remove("hidden");
    const request = fetch("/api/linkedin-import-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: "true" }),
    });
    for (const li of demoSteps.children) {
      li.classList.add("active");
      await wait(550);
      li.classList.replace("active", "done");
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
    if (!file) return showError("Pick a CV file first.");
    if (file.size > 5 * 1024 * 1024) return showError("That file's over 5 MB. Try a PDF export instead.");
    const email = $("email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Add your email so employers can get in touch.");
    if (!$("consent").checked) return showError("Tick the box above so we're allowed to keep your details.");

    const fd = new FormData();
    fd.append("cv", file);
    fd.append("consent", "true");
    fd.append("email", email);
    if ($("linkedin").value.trim()) fd.append("linkedin_url", $("linkedin").value.trim());

    submit.disabled = true;
    stepEl.textContent = "Reading your CV, give it a few seconds…";
    try {
      const r = await fetch("/api/cv", { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Upload failed (${r.status})`);
      stepEl.textContent = "Done. You're on the list.";
      renderProfile(data.candidate, data.mode);
    } catch (err) {
      stepEl.textContent = "";
      showError(err.message);
    } finally {
      submit.disabled = false;
    }
  });
})();
