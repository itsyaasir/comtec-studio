(async () => {
  const results = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);
  const source = () => $("source");
  const rear = () => $("rear");
  const until = async (fn, timeout = 40000) => {
    const start = Date.now();
    while (!fn()) {
      if (Date.now() - start > timeout)
        throw Error("Timed out: " + $("status-text")?.textContent);
      await wait(100);
    }
  };
  const check = (name, pass, detail = {}) => {
    results.push({ name, pass, ...detail });
    if (!pass) throw Error(name);
  };
  const choose = async (name) => {
    $("search").value = name;
    $("search").dispatchEvent(new Event("input", { bubbles: true }));
    await wait(100);
    await wait(100);
    const buttons = [...document.querySelectorAll(".clip")];
    const b = buttons.find((b) => b.textContent.includes(name));
    if (!b) throw Error("Missing fixture " + name);
    b.click();
    await until(() => $("empty").hidden && !$("play").disabled);
    await wait(250);
  };
  try {
    await until(() => document.querySelectorAll(".clip").length > 0);
    check(
      "original library excludes Preview",
      $("count").textContent === "26",
      { count: Number($("count").textContent) },
    );
    for (const name of [
      "000_023859_A.mp4",
      "000_025643_A.mp4",
      "015_025359_A.mp4",
    ]) {
      const openedAt = performance.now();
      await choose(name);
      check(
        name + " reads directly without preparation",
        source().currentSrc.startsWith("track://") &&
          rear().currentSrc.startsWith("track://"),
        { openMs: Math.round(performance.now() - openedAt) },
      );
      check(name + " loads paused", source().paused && rear().paused, {
        main: [source().videoWidth, source().videoHeight],
        rear: [rear().videoWidth, rear().videoHeight],
      });
      $("play").click();
      await wait(1400);
      check(
        name + " plays both tracks",
        source().currentTime > 0.6 &&
          rear().currentTime > 0.6 &&
          !source().paused,
        {
          mainTime: source().currentTime,
          rearTime: rear().currentTime,
          drift: Math.abs(source().currentTime - rear().currentTime),
        },
      );
      $("play").click();
      await wait(100);
      check(name + " pauses together", source().paused && rear().paused, {
        mainPaused: source().paused,
        rearPaused: rear().paused,
        time: source().currentTime,
      });
      const t = Math.min(25, source().duration / 2);
      $("seek").value = String(t);
      $("seek").dispatchEvent(new Event("input", { bubbles: true }));
      await wait(100);
      await until(() => !source().seeking && !rear().seeking);
      check(
        name + " synchronized seek",
        Math.abs(source().currentTime - t) < 0.15 &&
          Math.abs(rear().currentTime - t) < 0.15,
        { main: source().currentTime, rear: rear().currentTime, target: t },
      );
      $("speed").value = "2";
      $("speed").dispatchEvent(new Event("change", { bubbles: true }));
      await wait(100);
      check(
        name + " 2x speed",
        source().playbackRate === 2 && rear().playbackRate === 2,
      );
      $("play").click();
      await wait(700);
      $("play").click();
      check(name + " 2x playback advances", source().currentTime > t + 0.5);
      $("speed").value = "1";
      $("speed").dispatchEvent(new Event("change", { bubbles: true }));
      await wait(100);
    }
    $("seek").value = $("seek").max - 0.3;
    $("seek").dispatchEvent(new Event("input", { bubbles: true }));
    await wait(100);
    await wait(200);
    $("play").click();
    await wait(900);
    check("short clip ends paused", source().paused && rear().paused);
    $("play").click();
    await wait(700);
    check("short clip replays", source().currentTime < 2 && !source().paused);
    $("play").click();
    $("mute").click();
    await wait(100);
    check("mute", source().muted);
    $("mute").click();
    $("front-zoom").value = "65";
    $("front-zoom").dispatchEvent(new Event("input", { bubbles: true }));
    await wait(100);
    $("front-reset").click();
    await wait(100);
    check("view reset", $("front-zoom").value === "100");
    $("search").value = "000_";
    $("search").dispatchEvent(new Event("input", { bubbles: true }));
    await wait(100);
    const firstFolder = [...document.querySelectorAll(".folder")][0];
    firstFolder.click();
    await wait(100);
    const a = [...document.querySelectorAll(".clip")].find((b) =>
      b.textContent.includes("000_023859_A.mp4"),
    );
    a.click();
    document.querySelector('[data-folder="20260915_004"]').click();
    await wait(50);
    const b = [...document.querySelectorAll(".clip")].find((b) =>
      b.textContent.includes("000_025643_A.mp4"),
    );
    b.click();
    await wait(100);
    await until(() => $("empty").hidden && !$("play").disabled);
    check(
      "rapid selection keeps latest",
      $("clip-title").textContent === "000_025643_A.mp4" && source().paused,
    );
    await choose("000_025643_A.mp4");
    await until(() => $("car-speed").textContent !== "—");
    check(
      "recorded car speed available",
      Number.isFinite(Number($("car-speed").textContent)),
    );
    check("GPS route loaded", $("route-empty").hidden);
    check("sensor readings loaded", $("g-x").textContent.includes("Δg"));
    const graphBounds = $("sensor-graph").getBoundingClientRect();
    const panelBounds = document
      .querySelector(".graph-panel")
      .getBoundingClientRect();
    check(
      "all graph rows fit the panel",
      graphBounds.height > 40 && graphBounds.bottom <= panelBounds.bottom,
    );
    for (const mode of ["split", "panorama", "round", "cabin", "rear", "all"]) {
      document.querySelector('button[data-layout="' + mode + '"]').click();
      await wait(150);
      check(mode + " layout active", $("stage").dataset.layout === mode);
    }
    $("search").value = "";
    $("search").dispatchEvent(new Event("input", { bubbles: true }));
    await wait(100);
    check(
      "folder sessions grouped",
      document.querySelectorAll(".folder").length === 4,
    );
    await choose("000_023859_A.mp4");
    await until(() => $("gps-state").textContent.includes("unavailable"));
    check(
      "no GPS fix does not show fake zero speed",
      $("car-speed").textContent === "—",
    );
    await choose("000_025643_A.mp4");
    await until(() =>
      [...document.querySelectorAll("#route-map img.leaflet-tile")].some(
        (img) => img.complete && img.naturalWidth === 256,
      ),
    );
    check("street map tiles render", true);
    const telemetryToggle = document.querySelector(
      '[aria-label="Show route and motion"]',
    );
    telemetryToggle.click();
    await wait(100);
    check("telemetry can be hidden", !$("telemetry-panel"));
    telemetryToggle.click();
    await until(() => $("route-map") && $("route-empty").hidden);
    check(
      "map remounts without duplicate containers",
      document.querySelectorAll(".leaflet-container").length === 1,
    );
    $("settings").click();
    await until(() => document.querySelector('[role="dialog"]'));
    check(
      "settings traps focus",
      document
        .querySelector('[role="dialog"]')
        .contains(document.activeElement),
    );
    const dialog = document.querySelector('[role="dialog"]');
    const themes = [...dialog.querySelectorAll("button[aria-pressed]")];
    const originalTheme = themes.find(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    themes.find((b) => b.textContent === "Dark").click();
    await wait(100);
    check(
      "dark appearance",
      document.documentElement.classList.contains("dark"),
    );
    themes.find((b) => b.textContent === "Light").click();
    await wait(100);
    check(
      "light appearance",
      !document.documentElement.classList.contains("dark"),
    );
    originalTheme.click();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await wait(250);
    check(
      "settings closes with Escape",
      !document.querySelector('[role="dialog"]'),
    );
    check(
      "settings restores keyboard focus",
      document.activeElement === $("settings"),
    );
  } catch (e) {
    results.push({
      name: "failure",
      pass: false,
      error: String(e),
      status: $("status-text")?.textContent,
      mainError: source()?.error?.code,
      rearError: rear()?.error?.code,
    });
  }
  source()?.pause();
  rear()?.pause();
  await window.__TAURI_INTERNALS__.invoke("test_report", {
    report: JSON.stringify(
      {
        suite: "react-luma",
        startupError: document.getElementById("startup-error")?.textContent,
        results,
        passed: results.every((r) => r.pass),
        userAgent: navigator.userAgent,
      },
      null,
      2,
    ),
  });
})();
