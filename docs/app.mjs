import { predict, describeFeature, featureIndex, removeFeatures, featureEffects, zScore } from "./inference.mjs";
import { renderSegmentation } from "./segmentation.mjs?v=gallery-pet-link";
import { renderScanImaging } from "./scan-imaging.mjs?v=ct-pet-315";

const SPOTLIGHT = { channel: 286, pooling: "patch-max" };
const TOP_N = 10;

const get = (id) => document.getElementById(id);
let model;
let scans;
let importance;
let tracers = null;
let spotlightIndex;
let imagingViewer;
let segmentationViewer;

let scan;
let baseResult;
let effects;
let topEffects;
const removed = new Set();

function showError(message) {
  get("error").textContent = message;
  get("error").hidden = false;
}

async function loadJSON(filename) {
  const response = await fetch(new URL(filename, import.meta.url));
  if (!response.ok) throw new Error(`Unable to load ${filename}`);
  return response.json();
}

const percent = (p) => `${(p * 100).toFixed(2)}%`;

function points(change) {
  const sign = change < 0 ? "−" : "+";
  return `${sign}${Math.abs(change * 100).toFixed(2)} pts`;
}

function makeGlobalList() {
  const biggest = importance.top[0].lossIncrease;
  const rows = importance.top.map((item) => {
    const row = document.createElement("li");
    if (item.index === spotlightIndex) row.className = "spotlight-row";

    const label = document.createElement("span");
    label.textContent = describeFeature(model, item.index).label;

    const track = document.createElement("div");
    track.className = "track";
    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.width = `${(item.lossIncrease / biggest) * 100}%`;
    track.append(fill);

    const value = document.createElement("span");
    value.textContent = `+${item.lossIncrease.toFixed(4)}`;

    row.append(label, track, value);
    return row;
  });
  get("global-list").replaceChildren(...rows);
}

function makeScanRow(item, biggest) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row";
  button.dataset.index = item.index;
  button.setAttribute("aria-pressed", "false");

  const label = document.createElement("span");
  const name = document.createElement("span");
  name.className = "row-label";
  name.textContent = describeFeature(model, item.index).label;
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = "Removed";
  label.append(name, tag);

  const diverge = document.createElement("span");
  diverge.className = "diverge";
  const bar = document.createElement("span");
  bar.className = item.effect >= 0 ? "bar tumor" : "bar clear";
  bar.style.width = `${(Math.abs(item.effect) / biggest) * 50}%`;
  diverge.append(bar);

  const value = document.createElement("span");
  value.textContent = points(item.effect);

  button.append(label, diverge, value);
  return button;
}

function showSpotlight() {
  const z = zScore(model, scan.features, spotlightIndex);
  const effect = effects[spotlightIndex].effect;
  get("spotlight-label").textContent = describeFeature(model, spotlightIndex).label;
  get("spotlight-value").textContent = `${Math.abs(z).toFixed(2)} SD ${z >= 0 ? "above" : "below"} average`;
  get("spotlight-effect").textContent = points(effect);
  get("spotlight-rank").textContent = `#${importance.rank[spotlightIndex]} of ${model.inputSize} features`;
}

function showScanList() {
  const biggest = Math.max(...topEffects.map((item) => Math.abs(item.effect)));
  get("scan-list").replaceChildren(...topEffects.map((item) => makeScanRow(item, biggest)));
}

function toggle(index) {
  if (removed.has(index)) removed.delete(index);
  else removed.add(index);
  update();
}

function update() {
  const result = predict(model, removeFeatures(model, scan.features, removed));
  get("tumor-score").textContent = percent(result.probability);
  get("negative-score").textContent = percent(1 - result.probability);
  get("tumor-bar").value = result.probability;
  get("negative-bar").value = 1 - result.probability;
  get("prediction").textContent = result.prediction ? "Tumor" : "No tumor";
  get("actual").textContent = scan.actual ? "Tumor" : "No tumor";
  get("correct").textContent = result.prediction === scan.actual ? "Correct" : "Incorrect";

  const note = get("change-note");
  if (removed.size === 0) {
    note.hidden = true;
  } else {
    const count = removed.size === 1 ? "1 feature" : `${removed.size} features`;
    const change = result.probability - baseResult.probability;
    let text = `${count} removed. Tumor probability ${percent(baseResult.probability)} → ${percent(result.probability)} (${points(change)}).`;
    if (result.prediction !== baseResult.prediction) text += " The prediction flipped.";
    note.textContent = text;
    note.hidden = false;
  }

  for (const button of get("scan-list").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(removed.has(Number(button.dataset.index))));
  }
  const spotlightRemoved = removed.has(spotlightIndex);
  get("spotlight-toggle").setAttribute("aria-pressed", String(spotlightRemoved));
  get("spotlight-toggle").textContent = spotlightRemoved ? "Restore this feature" : "Remove this feature";
  get("reset").disabled = removed.size === 0;
}

try {
  [model, scans, importance] = await Promise.all([
    loadJSON("model.json"),
    loadJSON("scans.json"),
    loadJSON("importance.json"),
  ]);
  spotlightIndex = featureIndex(model, SPOTLIGHT.channel, SPOTLIGHT.pooling);
  const options = scans.map((scan, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = scan.name;
    return option;
  });
  get("scan").replaceChildren(...options);
  get("scan").disabled = false;
  get("predict").disabled = false;
  makeGlobalList();
} catch (error) {
  showError("The demo could not load. Please refresh the page.");
  console.error(error);
}

if (model && scans) {
  try {
    tracers = await loadJSON("tracers.json");
  } catch (error) {
    console.error(error);
  }
  try {
    const segmentation = await loadJSON("segmentation.json?v=gallery-pet-link");
    segmentationViewer = renderSegmentation(get("segmentation"), segmentation, model, scans, tracers);
  } catch (error) {
    console.error(error);
  }
  try {
    const imaging = await loadJSON("imaging.json?v=ct-pet-315");
    imagingViewer = renderScanImaging(get("scan-imaging"), imaging, scans, chooseScan);
  } catch (error) {
    get("scan-imaging").textContent = "CT/PET images could not load. Please refresh the page.";
    console.error(error);
  }
}

function chooseScan(index) {
  if (!Number.isInteger(index) || index < 0 || index >= scans.length) return;
  get("scan").value = String(index);
  get("scan").dispatchEvent(new Event("change"));
  get("prediction-form").requestSubmit();
}

function syncScanImages() {
  const index = Number(get("scan").value);
  imagingViewer?.selectScan(index);
  segmentationViewer?.selectScan(index);
}

get("scan").addEventListener("change", () => {
  for (const id of ["tumor-score", "negative-score", "prediction", "actual", "correct"]) get(id).textContent = "—";
  get("tumor-bar").value = 0;
  get("negative-bar").value = 0;
  get("explain").hidden = true;
  get("change-note").hidden = true;
  get("tracer-note").hidden = true;
  get("error").hidden = true;
  syncScanImages();
});

get("segmentation").addEventListener("segmentation-select", (event) => chooseScan(event.detail.scanIndex));

function showTracer() {
  const note = get("tracer-note");
  if (!tracers) {
    note.hidden = true;
    return;
  }
  const tracer = tracers[Number(get("scan").value)];
  note.textContent = `Tracer: ${tracer.toUpperCase()}`;
  if (tracer === "psma") {
    note.innerHTML = `Tracer: PSMA. <a href="#segmentation">See how segmentation does on PSMA.</a>`;
  }
  note.hidden = false;
}

get("prediction-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!model || !scans) return;
  try {
    scan = scans[Number(get("scan").value)];
    baseResult = predict(model, scan.features);
    removed.clear();
    effects = featureEffects(model, scan.features);
    topEffects = effects
      .slice()
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
      .slice(0, TOP_N);
    showSpotlight();
    showScanList();
    update();
    showTracer();
    get("explain").hidden = false;
    get("error").hidden = true;
  } catch (error) {
    showError("Unable to predict this scan. Please try again.");
    console.error(error);
  }
});

get("scan-list").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) toggle(Number(button.dataset.index));
});

get("spotlight-toggle").addEventListener("click", () => toggle(spotlightIndex));

get("remove-all").addEventListener("click", () => {
  for (const item of topEffects) removed.add(item.index);
  update();
});

get("reset").addEventListener("click", () => {
  removed.clear();
  update();
});

if (model && scans) {
  syncScanImages();
  const requestedScan = Number(new URLSearchParams(location.search).get("scan"));
  if (Number.isInteger(requestedScan) && requestedScan >= 1 && requestedScan <= scans.length) {
    chooseScan(requestedScan - 1);
    if (location.hash === "#scan-imaging") get("scan-imaging").scrollIntoView();
  }
}
