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
    $("profile-mode").textContent = mode === "claude" ? "Extracted by Claude" : "Keyword mode";
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
          <div class="badges"><span class="badge pool">Opted in</span></div>
        </div>
        <dl>
          ${row("University", c.university)}
          ${row("Degree", c.degree)}
          ${row("Graduated", c.grad_year)}
          ${row("LinkedIn", c.linkedin_url)}
          ${row("Summary", c.summary)}
          ${list("Skills", c.skills)}
          ${list("Experience", c.experience)}
        </dl>
      </div>`;
    $("profile").classList.remove("hidden");
    $("profile").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const file = $("cv").files[0];
    if (!file) return showError("Please choose a CV file.");
    if (file.size > 5 * 1024 * 1024) return showError("That file is over 5 MB.");
    if (!$("consent").checked) return showError("Please tick the consent box so we can store your profile.");

    const fd = new FormData();
    fd.append("cv", file);
    fd.append("consent", "true");
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
