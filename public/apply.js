// "I'm looking for work": applicant account, CV upload and profile editing.
(() => {
  const $ = (id) => document.getElementById(id);
  const show = (el, on = true) => el.classList.toggle("hidden", !on);

  let account = null;
  let profile = null;
  let authMode = "signup";
  let manual = false; // filling in a profile by hand before one exists
  const STAGE_MSG = "Tell us whether you've graduated or you're after an internship or placement.";

  async function api(method, url, body) {
    const opts = { method, headers: {}, credentials: "same-origin" };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(url, opts);
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && url.startsWith("/api/me")) {
      account = null;
      profile = null;
      render();
    }
    if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status}). Try again.`);
    return data;
  }

  function setError(id, msg) {
    $(id).textContent = msg || "";
    show($(id), Boolean(msg));
  }

  /* ---------- what to show ---------- */
  function render() {
    show($("work-loading"), false);
    show($("auth-panel"), !account);
    show($("account-bar"), Boolean(account));
    show($("danger"), Boolean(account));
    if (!account) {
      show($("profile-panel"), false);
      show($("cv-panel"), false);
      return;
    }
    $("account-email").textContent = account.email;

    const hasProfile = Boolean(profile);
    show($("profile-panel"), hasProfile || manual);
    show($("cv-panel"), true);
    show($("manual-row"), !hasProfile && !manual);

    // CV panel wording depends on whether a profile exists yet.
    $("cv-title").textContent = hasProfile ? "Update from a new CV" : "Add your CV";
    $("cv-intro").textContent = hasProfile
      ? "Upload a newer CV and we'll refresh your profile from it. Anything the CV doesn't mention stays as it is."
      : "We read your CV and fill in your profile for you. You can change anything afterwards. We keep the details, not the file.";
    $("cv-submit").textContent = hasProfile ? "Update from this CV" : "Read my CV";
    show($("cv-consent-row"), !hasProfile);
    show($("cv-linkedin-row"), !hasProfile);
    show($("cv-stage-row"), !hasProfile);

    // Profile panel.
    show($("p-consent-row"), !hasProfile);
    $("profile-title").textContent = hasProfile ? "Your profile" : "Your details";
    $("p-save").textContent = hasProfile ? "Save changes" : "Create my profile";
    if (hasProfile) {
      $("profile-state").textContent = profile.visible === false ? "Hidden from employers" : "Visible to employers";
      $("profile-state").classList.toggle("off", profile.visible === false);
    } else {
      $("profile-state").textContent = "";
    }
  }

  function fillProfileForm(p) {
    const v = p || {};
    $("p-name").value = v.name || (account && account.name) || "";
    $("p-location").value = v.location || "";
    $("p-headline").value = v.headline || "";
    $("p-university").value = v.university || "";
    $("p-degree").value = v.degree || "";
    $("p-grad-year").value = v.grad_year || "";
    $("p-skills").value = (v.skills || []).join(", ");
    $("p-experience").value = (v.experience || []).join("\n");
    $("p-summary").value = v.summary || "";
    $("p-linkedin").value = v.linkedin_url || "";
    $("p-visible").checked = v.visible !== false;
    for (const r of document.querySelectorAll('input[name="p-stage"]')) r.checked = r.value === v.stage;
  }

  function setSignedIn(data) {
    account = data.account;
    profile = data.profile;
    manual = false;
    fillProfileForm(profile);
    render();
  }

  /* ---------- create account / log in ---------- */
  function setAuthMode(mode) {
    authMode = mode;
    $("auth-tab-signup").setAttribute("aria-selected", String(mode === "signup"));
    $("auth-tab-login").setAttribute("aria-selected", String(mode === "login"));
    show($("auth-name-row"), mode === "signup");
    show($("auth-email-hint"), mode === "signup");
    show($("auth-password-hint"), mode === "signup");
    $("auth-password").autocomplete = mode === "signup" ? "new-password" : "current-password";
    $("auth-submit").textContent = mode === "signup" ? "Create my free account" : "Log in";
    setError("auth-error", "");
  }
  $("auth-tab-signup").addEventListener("click", () => setAuthMode("signup"));
  $("auth-tab-login").addEventListener("click", () => setAuthMode("login"));

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("auth-error", "");
    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;
    if (authMode === "signup" && !$("auth-name").value.trim()) return setError("auth-error", "Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("auth-error", "Enter a valid email address.");
    if (authMode === "signup" && password.length < 8) return setError("auth-error", "Use a password with at least 8 characters.");
    if (!password) return setError("auth-error", "Enter your password.");

    $("auth-submit").disabled = true;
    try {
      const data = authMode === "signup"
        ? await api("POST", "/api/auth/signup", { name: $("auth-name").value.trim(), email, password })
        : await api("POST", "/api/auth/login", { email, password });
      $("auth-password").value = "";
      setSignedIn(data);
    } catch (err) {
      setError("auth-error", err.message);
    } finally {
      $("auth-submit").disabled = false;
    }
  });

  $("logout").addEventListener("click", async () => {
    try { await api("POST", "/api/auth/logout"); } catch { /* signed out either way */ }
    account = null;
    profile = null;
    manual = false;
    setAuthMode("login");
    render();
  });

  /* ---------- CV ---------- */
  $("cv-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("cv-error", "");
    const file = $("cv").files[0];
    if (!file) return setError("cv-error", "Choose your CV file first.");
    if (file.size > 5 * 1024 * 1024) return setError("cv-error", "That file's over 5 MB. Try a PDF export instead.");
    if (!profile && !$("cv-consent").checked) return setError("cv-error", "Tick the box so we're allowed to keep your details.");
    const cvStage = (document.querySelector('input[name="cv-stage"]:checked') || {}).value;
    if (!profile && !cvStage) return setError("cv-error", STAGE_MSG);

    const fd = new FormData();
    fd.append("cv", file);
    fd.append("consent", "true");
    if (cvStage) fd.append("stage", cvStage);
    if ($("cv-linkedin").value.trim()) fd.append("linkedin_url", $("cv-linkedin").value.trim());

    $("cv-submit").disabled = true;
    $("cv-status").textContent = "Reading your CV, give it a few seconds…";
    try {
      const had = Boolean(profile);
      const data = await api("POST", "/api/me/cv", fd);
      profile = data.profile;
      manual = false;
      fillProfileForm(profile);
      $("cv").value = "";
      $("cv-status").textContent = "";
      render();
      $("p-status").textContent = had
        ? "Updated from your new CV. Check it over and save any changes."
        : "Done. We filled this in from your CV. Check it over and fix anything we got wrong.";
      $("profile-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      $("cv-status").textContent = "";
      setError("cv-error", err.message);
    } finally {
      $("cv-submit").disabled = false;
    }
  });

  $("manual").addEventListener("click", () => {
    manual = true;
    fillProfileForm(null);
    render();
    $("p-name").focus();
  });

  /* ---------- profile edits ---------- */
  $("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    setError("p-error", "");
    $("p-status").textContent = "";
    if (!$("p-name").value.trim()) return setError("p-error", "Enter your name.");
    const linkedin = $("p-linkedin").value.trim();
    if (linkedin && !/^https?:\/\/\S+$/i.test(linkedin)) return setError("p-error", "LinkedIn should be a full link starting with https://");
    if (!profile && !$("p-consent").checked) return setError("p-error", "Tick the box so we're allowed to keep your details.");
    const pStage = (document.querySelector('input[name="p-stage"]:checked') || {}).value;
    if (!pStage) return setError("p-error", STAGE_MSG);

    $("p-save").disabled = true;
    try {
      const data = await api("PUT", "/api/me/profile", {
        name: $("p-name").value.trim(),
        location: $("p-location").value.trim(),
        headline: $("p-headline").value.trim(),
        university: $("p-university").value.trim(),
        degree: $("p-degree").value.trim(),
        grad_year: $("p-grad-year").value.trim(),
        skills: $("p-skills").value.split(",").map((s) => s.trim()).filter(Boolean),
        experience: $("p-experience").value.split("\n").map((s) => s.trim()).filter(Boolean),
        summary: $("p-summary").value.trim(),
        linkedin_url: linkedin,
        visible: $("p-visible").checked,
        stage: pStage,
        consent: "true",
      });
      profile = data.profile;
      manual = false;
      fillProfileForm(profile);
      render();
      $("p-status").textContent = `Saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
    } catch (err) {
      setError("p-error", err.message);
    } finally {
      $("p-save").disabled = false;
    }
  });

  /* ---------- delete account ---------- */
  $("delete-start").addEventListener("click", () => {
    show($("delete-start"), false);
    show($("delete-confirm"), true);
  });
  $("delete-no").addEventListener("click", () => {
    show($("delete-confirm"), false);
    show($("delete-start"), true);
  });
  $("delete-yes").addEventListener("click", async () => {
    setError("delete-error", "");
    $("delete-yes").disabled = true;
    try {
      await api("DELETE", "/api/me");
      account = null;
      profile = null;
      manual = false;
      show($("delete-confirm"), false);
      show($("delete-start"), true);
      $("danger").open = false;
      setAuthMode("signup");
      render();
      setError("auth-error", "");
      $("auth-panel").insertAdjacentHTML("afterbegin", '<p class="notice" id="deleted-note">Your account and profile have been deleted.</p>');
      setTimeout(() => $("deleted-note")?.remove(), 6000);
    } catch (err) {
      setError("delete-error", err.message);
    } finally {
      $("delete-yes").disabled = false;
    }
  });

  /* ---------- start ---------- */
  setAuthMode("signup");
  api("GET", "/api/me")
    .then(setSignedIn)
    .catch(() => render());
})();
