(() => {
  const $ = (id) => document.getElementById(id);
  const mic = $("mic");
  const micLabel = $("mic-label");
  const micHint = $("mic-hint");
  const transcript = $("transcript");
  const find = $("find");
  const step = $("step");
  const statusEl = $("status");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- status line ---------- */
  async function loadStatus() {
    try {
      const r = await fetch("/api/status");
      const s = await r.json();
      statusEl.innerHTML = [
        `<span class="${s.claude ? "on" : "off"}"><i class="dot"></i>Claude ${s.claude ? "on" : "off"}</span>`,
        `<span class="${s.pdl ? "on" : s.pdlDemo ? "demo" : "off"}"><i class="dot"></i>PDL ${s.pdl ? "on" : s.pdlDemo ? "demo" : "off"}</span>`,
        `<span class="${s.exa ? "on" : "off"}"><i class="dot"></i>Exa ${s.exa ? "on" : "off"}</span>`,
        `<span><i class="dot"></i>${s.poolSize} graduate${s.poolSize === 1 ? "" : "s"} in pool</span>`,
      ].join("");
      if (!s.claude) statusEl.title = "No ANTHROPIC_API_KEY: using keyword matching.";
    } catch {
      statusEl.textContent = "Status unavailable.";
    }
  }

  /* ---------- speech ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;
  let finalText = "";

  if (!SR) {
    mic.disabled = true;
    micLabel.textContent = "Voice not supported here";
    micHint.textContent = "Type your request below instead (Firefox doesn't support speech input).";
  } else {
    rec = new SR();
    rec.lang = "en-GB";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText && !finalText.endsWith(" ") ? " " : "") + t.trim();
        else interim += t;
      }
      transcript.value = (finalText + (interim ? " " + interim : "")).trim();
    };
    rec.onerror = (e) => {
      stopListening();
      micHint.textContent = e.error === "not-allowed"
        ? "Microphone blocked. Allow access in your browser, or type below."
        : `Speech error (${e.error}). You can type below.`;
    };
    rec.onend = () => { if (listening) stopListening(); };
  }

  function startListening() {
    finalText = transcript.value.trim();
    listening = true;
    mic.setAttribute("aria-pressed", "true");
    mic.setAttribute("aria-label", "Stop recording");
    micLabel.textContent = "Listening… tap to stop";
    micHint.textContent = "Describe the role, skills and where they'd be based.";
    try { rec.start(); } catch { /* already started */ }
  }
  function stopListening() {
    listening = false;
    mic.setAttribute("aria-pressed", "false");
    mic.setAttribute("aria-label", "Start recording");
    micLabel.textContent = "Tap to record";
    micHint.textContent = "Edit the text below if anything was misheard.";
    try { rec && rec.stop(); } catch { /* ignore */ }
  }
  mic.addEventListener("click", () => (listening ? stopListening() : startListening()));

  /* ---------- examples ---------- */
  document.querySelectorAll(".example").forEach((b) => {
    b.addEventListener("click", () => {
      transcript.value = b.textContent.trim();
      transcript.focus();
    });
  });

  /* ---------- search flow ---------- */
  function setBusy(on, text) {
    find.disabled = on;
    step.textContent = text || "";
  }

  function renderSpec(spec, mode) {
    $("spec-mode").textContent = mode === "claude" ? "Parsed by Claude" : "Keyword mode";
    $("spec-summary").textContent = spec.summary || "";
    const chips = [];
    const add = (key, val) => { if (val) chips.push(`<span class="chip k"><span class="key">${esc(key)}</span>${esc(val)}</span>`); };
    add("Role", spec.title);
    add("Discipline", spec.discipline);
    add("Level", spec.seniority);
    add("Location", spec.location);
    (spec.must_have_skills || []).forEach((s) => add("Must", s));
    (spec.nice_to_have_skills || []).forEach((s) => add("Nice", s));
    $("spec-chips").innerHTML = chips.join("");
    $("spec-panel").classList.remove("hidden");
  }

  function badgeFor(c) {
    if (c.sample) return '<span class="badge sample">Sample</span>';
    if (c.source === "pdl" && c.demo) return '<span class="badge pdl">via PDL (demo)</span>';
    if (c.source === "pdl") return '<span class="badge pdl">via PDL</span>';
    if (c.source === "exa") return '<span class="badge exa">via Exa</span>';
    return '<span class="badge pool">Opted in</span>';
  }

  function renderResults(data) {
    const { matches, counts, pdlNote, exaNote, mode } = data;
    $("counts").textContent = `${matches.length} shown · ${counts.pool} from pool · ${counts.pdl} via PDL · ${counts.exa || 0} via Exa · ranked by ${mode === "claude" ? "Claude" : "keywords"}`;
    $("pdl-note").textContent = [pdlNote, exaNote].filter(Boolean).join(" ");
    const cards = $("cards");
    if (!matches.length) {
      cards.innerHTML = '<p class="muted">No matches found. Try broadening the description.</p>';
    } else {
      cards.innerHTML = matches.map((c, i) => `
        <article class="card">
          <div class="card-head">
            <div>
              <h3>${esc(c.name)}</h3>
              <p class="sub">${esc([c.headline, c.location].filter(Boolean).join(" · "))}</p>
            </div>
            <div class="badges">${badgeFor(c)}</div>
          </div>
          <div class="score" aria-label="Fit score ${c.score} out of 100">
            <div class="bar"><i style="width:${Math.max(2, Math.min(100, c.score))}%"></i></div><b>${c.score}</b>
          </div>
          <p class="reason">${esc(c.reason)}</p>
          <p class="gaps">${esc(c.gaps)}</p>
          ${c.skills && c.skills.length ? `<div class="skills">${c.skills.slice(0, 10).map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>` : ""}
          <div class="card-links">
            ${c.linkedin_url
              ? `<a href="${esc(c.linkedin_url)}" target="_blank" rel="noopener noreferrer">LinkedIn profile ↗</a>`
              : c.profile_url
                ? `<a href="${esc(c.profile_url)}" target="_blank" rel="noopener noreferrer">Public profile ↗</a>`
                : '<span class="muted">No LinkedIn link</span>'}
            ${c.university ? `<span class="muted">${esc(c.university)}${c.grad_year ? ` · ${esc(c.grad_year)}` : ""}</span>` : ""}
          </div>
          <details class="outreach">
            <summary>Outreach draft</summary>
            <pre id="msg-${i}">${esc(c.outreach)}</pre>
            <button type="button" class="ghost copy" data-target="msg-${i}">Copy message</button>
          </details>
        </article>`).join("");
      cards.querySelectorAll(".copy").forEach((b) => {
        b.addEventListener("click", async () => {
          const text = document.getElementById(b.dataset.target).textContent;
          try {
            await navigator.clipboard.writeText(text);
            b.textContent = "Copied";
          } catch {
            b.textContent = "Select and copy manually";
          }
          setTimeout(() => (b.textContent = "Copy message"), 1800);
        });
      });
    }
    $("results").classList.remove("hidden");
    $("results").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function postJson(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
    return data;
  }

  find.addEventListener("click", async () => {
    const text = transcript.value.trim();
    if (!text) {
      transcript.focus();
      step.textContent = "Say or type what you need first.";
      return;
    }
    if (listening) stopListening();
    $("results").classList.add("hidden");
    $("spec-panel").classList.add("hidden");
    try {
      setBusy(true, "Understanding the role…");
      const { spec, mode } = await postJson("/api/role", { transcript: text });
      renderSpec(spec, mode);
      setBusy(true, "Searching the pool and public profiles…");
      const data = await postJson("/api/search", { spec });
      renderResults(data);
      setBusy(false, "");
    } catch (err) {
      setBusy(false, `Something went wrong: ${err.message}`);
    }
  });

  loadStatus();
})();
