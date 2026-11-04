(() => {
  const $ = (id) => document.getElementById(id);
  const mic = $("mic");
  const micLabel = $("mic-label");
  const micHint = $("mic-hint");
  const timer = $("timer");
  const transcript = $("transcript");
  const find = $("find");
  const step = $("step");
  const statusEl = $("status");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Only ever link out to real http(s) addresses.
  const safeHref = (u) => (/^https?:\/\//i.test(String(u || "")) ? esc(u) : "");

  /* ---------- what's switched on ---------- */
  async function loadStatus() {
    try {
      const s = await (await fetch("/api/status")).json();
      const pdl = s.pdl ? "PDL on" : s.pdlDemo ? "PDL demo" : "PDL off";
      statusEl.textContent = `${s.poolSize} graduates signed up · matching by ${s.claude ? "Claude" : "keywords"} · ${pdl} · Exa ${s.exa ? "on" : "off"}`;
    } catch {
      statusEl.textContent = "Couldn't reach the server.";
    }
  }

  /* ---------- voice note ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let listening = false;
  let finalText = "";
  let started = 0;
  let tick = null;

  if (!SR) {
    mic.disabled = true;
    micLabel.textContent = "Voice notes not supported here";
    micHint.textContent = "Type it below instead.";
  } else {
    rec = new SR();
    rec.lang = "en-GB";
    rec.interimResults = true;
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    rec.continuous = !isIOS;
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
        ? "Your browser blocked the microphone. Allow it, or type below."
        : "Didn't catch that. Try again, or type below.";
    };
    rec.onend = () => { if (listening) stopListening(); };
  }

  function showTime() {
    const secs = Math.floor((Date.now() - started) / 1000);
    timer.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }

  function startListening() {
    finalText = transcript.value.trim();
    listening = true;
    started = Date.now();
    showTime();
    tick = setInterval(showTime, 500);
    mic.setAttribute("aria-pressed", "true");
    mic.setAttribute("aria-label", "Stop recording");
    micLabel.textContent = "Recording — tap to stop";
    micHint.textContent = "Take your time.";
    try { rec.start(); } catch { /* already started */ }
  }

  function stopListening() {
    listening = false;
    clearInterval(tick);
    timer.textContent = "";
    mic.setAttribute("aria-pressed", "false");
    mic.setAttribute("aria-label", "Start recording");
    micLabel.textContent = "Record again";
    micHint.textContent = "Fix anything it misheard below.";
    try { rec && rec.stop(); } catch { /* ignore */ }
  }

  mic.addEventListener("click", () => (listening ? stopListening() : startListening()));

  document.querySelectorAll(".example").forEach((b) => {
    b.addEventListener("click", () => {
      transcript.value = (b.dataset.text || b.textContent).trim();
      transcript.focus();
    });
  });

  /* ---------- results ---------- */
  function setBusy(on, text) {
    find.disabled = on;
    step.textContent = text || "";
  }

  function renderSpec(spec, mode) {
    $("spec-mode").textContent = mode === "claude" ? "read by Claude" : "keyword mode";
    $("spec-summary").textContent = spec.summary || "";
    const rows = [];
    const row = (k, v) => { if (v) rows.push(`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`); };
    row("Role", spec.title);
    row("Level", spec.seniority === "any" ? "" : spec.seniority);
    row("Where", spec.location);
    row("Must know", (spec.must_have_skills || []).join(", "));
    row("Bonus", (spec.nice_to_have_skills || []).join(", "));
    $("spec-chips").innerHTML = rows.join("");
    $("spec-panel").classList.remove("hidden");
  }

  function sourceTag(c) {
    if (c.sample) return '<span class="src sample" title="Made-up profile for the demo">sample</span>';
    if (c.source === "pdl" && c.demo) return '<span class="src sample" title="Made-up People Data Labs record for the demo">PDL demo</span>';
    if (c.source === "pdl") return '<span class="src pdl" title="Found through People Data Labs">via PDL</span>';
    if (c.source === "exa") return '<span class="src pdl" title="Public profile found through Exa search">via Exa</span>';
    if (c.demo) return '<span class="src sample" title="Made-up profile from the LinkedIn import demo">demo import</span>';
    return '<span class="src pool" title="Signed up on Stay North">signed up</span>';
  }

  function ticks(score) {
    const on = Math.round(Math.max(0, Math.min(100, score)) / 10);
    return Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("");
  }

  function renderResults({ matches, counts = {}, pdlNote, exaNote, mode }) {
    $("counts").textContent = `${matches.length} people · ${mode === "claude" ? "ranked by Claude" : "ranked by keywords"}`;
    // Only mention a source when that search is actually switched on.
    const notes = [pdlNote, exaNote].filter((n) => n && !/^(PDL|Exa) off/i.test(n));
    if (counts.hidden) notes.push(`${counts.hidden} left out because they have no contact details.`);
    $("pdl-note").textContent = notes.join(" ");

    const list = $("cards");
    if (!matches.length) {
      list.innerHTML = '<li class="person"><span></span><p>Nobody close enough this time. Try loosening the skills or the location.</p></li>';
    } else {
      list.innerHTML = matches.map((c, i) => {
        const href = safeHref(c.linkedin_url);
        const profileHref = href ? "" : safeHref(c.profile_url);
        return `
        <li class="person">
          <div class="rank">${i + 1}</div>
          <div>
            <h3>${esc(c.name)}${sourceTag(c)}</h3>
            <p class="sub">${esc([c.headline, c.location].filter(Boolean).join(" — "))}</p>
            <p class="reason">${esc(c.reason)}</p>
            <p class="gaps"><b>Ask about:</b> ${esc(c.gaps)}</p>
            <div class="links">
              ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}
              ${href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ""}
              ${profileHref ? `<a href="${profileHref}" target="_blank" rel="noopener noreferrer">Public profile ↗</a>` : ""}
            </div>
            <details class="outreach">
              <summary>Draft a message</summary>
              <pre id="msg-${i}">${esc(c.outreach)}</pre>
              <button type="button" class="ghost copy" data-target="msg-${i}">Copy</button>
            </details>
          </div>
          <div class="fit" aria-label="Fit ${c.score} out of 100">
            <b>${c.score}</b><small>/ 100 fit</small>
            <div class="ticks" aria-hidden="true">${ticks(c.score)}</div>
          </div>
        </li>`;
      }).join("");

      list.querySelectorAll(".copy").forEach((b) => {
        b.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(document.getElementById(b.dataset.target).textContent);
            b.textContent = "Copied";
          } catch {
            b.textContent = "Select it and copy";
          }
          setTimeout(() => (b.textContent = "Copy"), 1800);
        });
      });
    }
    $("results").classList.remove("hidden");
    $("spec-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function postJson(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `request failed (${r.status})`);
    return data;
  }

  find.addEventListener("click", async () => {
    const text = transcript.value.trim();
    if (!text) {
      transcript.focus();
      step.textContent = "Tell us a bit about the role first.";
      return;
    }
    if (listening) stopListening();
    $("results").classList.add("hidden");
    $("spec-panel").classList.add("hidden");
    try {
      setBusy(true, "Reading what you said…");
      const { spec, mode } = await postJson("/api/role", { transcript: text });
      renderSpec(spec, mode);
      setBusy(true, "Looking for people…");
      renderResults(await postJson("/api/search", { spec }));
      setBusy(false, "");
    } catch (err) {
      setBusy(false, `That didn't work: ${err.message}`);
    }
  });

  loadStatus();
})();
