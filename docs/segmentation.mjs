import { predict } from "./inference.mjs";

const VIEWS = ["axial", "coronal", "sagittal"];
const TABS = [
  { key: "lesion", label: "Strongest point inside the tumor" },
  { key: "peak", label: "Model's most confident point" },
];
const DEFAULT_SAMPLE = 3;
const SMALL_LESION = 500;

const pct = (value) => `${Math.round(value * 100)}%`;
const tracerName = (tracer) => tracer.toUpperCase();

function classifierStats(model, scans, tracers, tracer) {
  let n = 0, correct = 0, predictedTumor = 0, tumors = 0, caught = 0, clears = 0, cleared = 0;
  scans.forEach((scan, i) => {
    if (tracers[i] !== tracer) return;
    const prediction = predict(model, scan.features).prediction;
    n++;
    if (prediction === scan.actual) correct++;
    if (prediction) predictedTumor++;
    if (scan.actual) {
      tumors++;
      if (prediction) caught++;
    } else {
      clears++;
      if (!prediction) cleared++;
    }
  });
  return {
    n,
    predictedTumor,
    accuracy: correct / n,
    sensitivity: tumors ? caught / tumors : 0,
    specificity: clears ? cleared / clears : 0,
  };
}

function caption(sample) {
  let text;
  if (sample.recall === 0) {
    text = "Did not find any of the tumor at the 0.5 threshold.";
  } else {
    text = `Found ${pct(sample.recall)} of the tumor; ${pct(sample.precision)} of what it flagged was tumor.`;
  }
  if (!sample.peakInsideLesion) {
    text += ` The model's most confident point is outside the tumor. Open the "${TABS[1].label}" tab to see it.`;
  }
  if (sample.lesionVoxels < SMALL_LESION) {
    text += ` This is a small lesion (${sample.lesionVoxels.toLocaleString()} voxels), which is hard for the model to find.`;
  }
  return text;
}

function statPanel(data, tracer) {
  const group = data.groups[tracer];
  return `
    <div class="panel">
      <h3>${tracerName(tracer)}</h3>
      <div class="big-numbers">
        <div><span>Recall</span><strong>${pct(group.recall)}</strong></div>
        <div><span>Precision</span><strong>${pct(group.precision)}</strong></div>
        <div><span>Dice</span><strong>${group.dice.toFixed(2)}</strong></div>
      </div>
      <p class="note">Peak inside tumor: ${group.peakInside} of ${group.scans}. Median of ${group.scans} scans.</p>
    </div>`;
}

function classifierPanel(model, scans, tracers, tracer) {
  const s = classifierStats(model, scans, tracers, tracer);
  let extra = "";
  if (tracer === "psma") {
    extra = `<p class="note">Predicts Tumor for ${s.predictedTumor} of ${s.n} PSMA scans. Most PSMA scans in this set have tumors, so accuracy looks high.</p>`;
  }
  return `
    <div class="panel">
      <h3>${tracerName(tracer)} (${s.n} scans)</h3>
      <div class="big-numbers">
        <div><span>Accuracy</span><strong>${(s.accuracy * 100).toFixed(1)}%</strong></div>
        <div><span>Sensitivity</span><strong>${(s.sensitivity * 100).toFixed(1)}%</strong></div>
        <div><span>Specificity</span><strong>${(s.specificity * 100).toFixed(1)}%</strong></div>
      </div>
      ${extra}
    </div>`;
}

function sampleRow(sample) {
  const small = sample.lesionVoxels < SMALL_LESION ? '<span class="small-tag">small lesion</span>' : "";
  const width = sample.dice * 100;
  return `
    <button type="button" class="sample-row" data-sample="${sample.sample}" aria-pressed="false" aria-describedby="sample-tip">
      <span>Sample ${sample.sample}${small}</span>
      <span class="seg-track"><span class="seg-area">
        <span class="seg-fill ${sample.tracer}" style="width:${width}%"></span>
        <span class="end-value" style="left:${width}%">${sample.dice.toFixed(2)}</span>
      </span></span>
    </button>`;
}

function tableRow(sample) {
  return `
    <tr data-sample="${sample.sample}">
      <td><button type="button" class="secondary" data-sample="${sample.sample}" aria-pressed="false">Sample ${sample.sample}</button></td>
      <td>${tracerName(sample.tracer)}</td>
      <td>${sample.lesionVoxels.toLocaleString()}</td>
      <td>${pct(sample.recall)}</td>
      <td>${pct(sample.precision)}</td>
      <td>${sample.dice.toFixed(2)}</td>
      <td>${sample.peakInsideLesion ? "Yes" : "No"}</td>
    </tr>`;
}

export function renderSegmentation(container, data, model, scans, tracers) {
  const bySample = new Map(data.samples.map((s) => [s.sample, s]));
  const hasTracers = Array.isArray(tracers) && tracers.length === scans.length;
  const groupRows = (tracer) =>
    data.samples.filter((s) => s.tracer === tracer).map(sampleRow).join("");

  container.innerHTML = `
    <h2>How well does the segmentation model find tumors?</h2>
    <p>This is a separate nnU-Net model that outlines tumors voxel by voxel. It was checked on 10 validation scans against expert outlines. <strong>Recall</strong> is the share of the real tumor it found, <strong>precision</strong> is the share of what it flagged that really was tumor, and <strong>Dice</strong> combines both into one overlap score from 0 to 1.</p>

    <div class="cards">${statPanel(data, "fdg")}${statPanel(data, "psma")}</div>
    <p class="note">FDG and PSMA are the two PET tracers in this dataset. The model works well on FDG and poorly on PSMA, especially on small lesions.</p>

    <section class="panel">
      <h3>Dice for each segmentation sample</h3>
      <div class="chart-wrap">
        <h4 class="seg-heading">FDG</h4>${groupRows("fdg")}
        <h4 class="seg-heading">PSMA</h4>${groupRows("psma")}
        <div id="sample-tip" class="sample-tooltip" role="tooltip" hidden></div>
      </div>
      <button type="button" class="secondary table-toggle" aria-expanded="false" aria-controls="sample-table">Show as table</button>
      <div id="sample-table" class="table-scroll" hidden>
        <table>
          <thead><tr><th>Sample</th><th>Tracer</th><th>Lesion voxels</th><th>Recall</th><th>Precision</th><th>Dice</th><th>Peak inside tumor</th></tr></thead>
          <tbody>${data.samples.map(tableRow).join("")}</tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h3 class="viewer-title"></h3>
      <div class="tabs" role="tablist">
        ${TABS.map((tab) => `<button type="button" class="secondary" role="tab" data-tab="${tab.key}" aria-selected="false">${tab.label}</button>`).join("")}
      </div>
      <p class="viewer-caption"></p>
      <div class="views">
        ${VIEWS.map((view) => `
          <figure>
            <figcaption>${view[0].toUpperCase() + view.slice(1)} view</figcaption>
            <button type="button" class="view-button" data-view="${view}"><img alt=""></button>
          </figure>`).join("")}
      </div>
      <p class="note legend">
        <span><span class="legend-gradient"></span> Tumor probability 0 → 1</span>
        <span><span class="legend-line"></span> Expert tumor outline</span>
      </p>
      <p class="note">A very dark tint means the model sees almost no tumor there. Orientation corrected for display; left/right not verified. Click a panel to enlarge it.</p>
    </section>

    ${hasTracers ? `
    <section>
      <h3>The scan classifier, split by tracer</h3>
      <p class="note">This is the classifier from the top of the page, not the segmentation model. Sensitivity is the share of tumor scans it flags; specificity is the share of no-tumor scans it clears.</p>
      <div class="cards">${classifierPanel(model, scans, tracers, "fdg")}${classifierPanel(model, scans, tracers, "psma")}</div>
    </section>` : ""}

    <p class="note">Caveats: only 10 samples. The segmentation model is separate from the classifier. Segmentation samples 1–10 are not the same scans as the dropdown above. Threshold 0.5, checkpoint ${data.checkpointSha256Short}.</p>

    <dialog class="enlarged">
      <img alt="">
      <form method="dialog"><button type="button" class="secondary close-dialog">Close</button></form>
    </dialog>`;

  const tip = container.querySelector("#sample-tip");
  const wrap = container.querySelector(".chart-wrap");
  const dialog = container.querySelector("dialog");
  const images = container.querySelectorAll(".view-button img");
  let selected = DEFAULT_SAMPLE;
  let tab = "lesion";

  function showSample(number, scroll) {
    selected = number;
    const sample = bySample.get(number);
    container.querySelector(".viewer-title").textContent =
      `Sample ${number} · ${tracerName(sample.tracer)} · Dice ${sample.dice.toFixed(2)}`;
    container.querySelector(".viewer-caption").textContent = caption(sample);
    VIEWS.forEach((view, i) => {
      images[i].src = sample.images[tab][view];
      images[i].alt = `Sample ${number}, ${view} view: tumor-probability overlay and expert outline.`;
    });
    for (const button of container.querySelectorAll("[data-tab]")) {
      button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    }
    for (const button of container.querySelectorAll("button[data-sample]")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.sample) === number));
    }
    for (const row of container.querySelectorAll("tr[data-sample]")) {
      row.classList.toggle("selected", Number(row.dataset.sample) === number);
    }
    if (scroll) container.querySelector(".viewer-title").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showTip(button) {
    const sample = bySample.get(Number(button.dataset.sample));
    tip.textContent = `Sample ${sample.sample} · ${tracerName(sample.tracer)}: recall ${pct(sample.recall)}, precision ${pct(sample.precision)}, lesion ${sample.lesionVoxels.toLocaleString()} voxels, peak inside tumor: ${sample.peakInsideLesion ? "yes" : "no"}.`;
    tip.hidden = false;
    const left = Math.min(button.offsetLeft + 24, wrap.clientWidth - tip.offsetWidth);
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${button.offsetTop + button.offsetHeight}px`;
  }

  for (const button of container.querySelectorAll("button.sample-row")) {
    button.addEventListener("mouseenter", () => showTip(button));
    button.addEventListener("focus", () => showTip(button));
    button.addEventListener("mouseleave", () => (tip.hidden = true));
    button.addEventListener("blur", () => (tip.hidden = true));
  }
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") tip.hidden = true;
  });

  container.addEventListener("click", (event) => {
    const sampleButton = event.target.closest("button[data-sample]");
    if (sampleButton) showSample(Number(sampleButton.dataset.sample), true);

    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) {
      tab = tabButton.dataset.tab;
      showSample(selected, false);
    }

    const viewButton = event.target.closest(".view-button");
    if (viewButton) {
      const img = viewButton.querySelector("img");
      dialog.querySelector("img").src = img.src;
      dialog.querySelector("img").alt = img.alt;
      dialog.showModal();
    }

    if (event.target.closest(".close-dialog") || event.target === dialog) dialog.close();
  });

  const toggle = container.querySelector(".table-toggle");
  toggle.addEventListener("click", () => {
    const table = container.querySelector("#sample-table");
    table.hidden = !table.hidden;
    toggle.setAttribute("aria-expanded", String(!table.hidden));
    toggle.textContent = table.hidden ? "Show as table" : "Hide table";
  });

  showSample(DEFAULT_SAMPLE, false);
}
