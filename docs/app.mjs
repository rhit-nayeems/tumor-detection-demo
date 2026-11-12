import { predict, describeFeature, removeFeatures, featureEffects } from "./inference.mjs?v=feature-explainer";
import { renderSegmentation } from "./segmentation.mjs?v=demo-cleanup";
import { renderScanImaging } from "./scan-imaging.mjs?v=scan-heading";
import { renderResults } from "./results.mjs?v=demo-cleanup";

const TOP_N = 5;
const DEMO_SCANS = new Map([
  ["Scan 023", "Tumor example"],
  ["Scan 112", "Tumor-free example"],
  ["Scan 239", "PSMA challenge"],
]);

const get = (id) => document.getElementById(id);
const pages = [...document.querySelectorAll(".demo-page")];
const navLinks = document.querySelectorAll(".demo-nav a");

function showPage() {
  const hash = location.hash.slice(1);
  const page = hash === "segmentation" ? "results"
    : pages.some((section) => section.id === hash) ? hash : "explore";
  for (const section of pages) section.hidden = section.id !== page;
  for (const link of navLinks) {
    if (link.hash === `#${page}`) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
  if (hash === "segmentation") get("segmentation-details").open = true;
}

window.addEventListener("hashchange", showPage);
document.querySelector("main").addEventListener("click", (event) => {
  const link = event.target.closest('.demo-nav a, .explain-header a');
  if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
      event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (location.hash !== link.hash) history.pushState(null, "", link.hash);
  showPage();
  if (link.closest(".explain-header")) get("scan").focus();
  window.scrollTo(0, 0);
});
showPage();

let model;
let scans;
let importance;
let tracers = null;
let imagingViewer;
let segmentationViewer;

let scan;
let baseResult;
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

function makeGlobalList() {
  const biggest = importance.top[0].lossIncrease;
  const rows = importance.top.map((item) => {
    const row = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = describeFeature(model, item.index).label;

    const track = document.createElement("div");
    track.className = "track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.width = `${(item.lossIncrease / biggest) * 100}%`;
    track.append(fill);

    row.append(label, track);
    return row;
  });
  get("global-list").replaceChildren(...rows);
}

function makeScanRow(item) {
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
  tag.textContent = "Off";
  label.append(name, tag);

  const value = document.createElement("span");
  value.className = "feature-score";
  value.textContent = `Score without it: ${percent(baseResult.probability - item.effect)}`;
  button.append(label, value);
  return button;
}

function showScanList() {
  get("scan-list").replaceChildren(...topEffects.map(makeScanRow));
}

function toggle(index) {
  if (removed.has(index)) removed.delete(index);
  else removed.add(index);
  update();
}

function showPrediction(result) {
  get("tumor-score").textContent = percent(result.probability);
  get("tumor-bar").value = result.probability;
  get("prediction").textContent = result.prediction ? "Tumor" : "No tumor";
  get("actual").textContent = scan.actual ? "Tumor" : "No tumor";
  get("correct").textContent = result.prediction === scan.actual ? "Correct" : "Incorrect";
}

function update() {
  const result = predict(model, removeFeatures(model, scan.features, removed));
  const note = get("change-note");
  if (removed.size === 0) {
    note.textContent = `Original tumor score: ${percent(baseResult.probability)}`;
  } else {
    const count = removed.size === 1 ? "1 feature" : `${removed.size} features`;
    let text = `Tumor score with ${count} off: ${percent(result.probability)} (original: ${percent(baseResult.probability)}).`;
    if (result.prediction !== baseResult.prediction) {
      text += ` Prediction changed to ${result.prediction ? "Tumor" : "No tumor"}.`;
    }
    note.textContent = text;
  }

  for (const button of get("scan-list").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(removed.has(Number(button.dataset.index))));
  }
  get("reset").disabled = removed.size === 0;
}

try {
  [model, scans, importance] = await Promise.all([
    loadJSON("model.json"),
    loadJSON("scans.json"),
    loadJSON("importance.json"),
  ]);
  const examples = document.createElement("optgroup");
  examples.label = "Demo examples";
  const otherScans = document.createElement("optgroup");
  otherScans.label = "Other validation scans";
  scans.forEach((scan, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    const label = DEMO_SCANS.get(scan.name);
    option.textContent = label ? `${scan.name} · ${label}` : scan.name;
    (label ? examples : otherScans).append(option);
  });
  get("scan").replaceChildren(examples, otherScans);
  makeGlobalList();
} catch (error) {
  showError("The demo could not load. Please refresh the page.");
  console.error(error);
}

if (model && scans) {
  await Promise.all([
    loadJSON("tracers.json").then((data) => { tracers = data; }).catch(console.error),
    loadJSON("segmentation.json?v=gallery-pet-link").then((data) => {
      segmentationViewer = renderSegmentation(get("segmentation"), data);
    }).catch((error) => {
      get("segmentation").textContent = "The earlier gallery could not load.";
      console.error(error);
    }),
    loadJSON("imaging.json?v=ct-pet-315").then((data) => {
      imagingViewer = renderScanImaging(get("scan-imaging"), data, scans);
    }).catch((error) => {
      get("scan-imaging").textContent = "CT/PET images could not load. Please refresh the page.";
      console.error(error);
    }),
  ]);
  renderResults(get("classifier-results"), model, scans, tracers);
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
  get("explain-scan").textContent = scans[index].name;
}

get("scan").addEventListener("change", () => {
  for (const id of ["tumor-score", "prediction", "actual", "correct"]) get(id).textContent = "—";
  get("tumor-bar").value = 0;
  get("explain").hidden = true;
  get("explain-prompt").hidden = false;
  get("error").hidden = true;
  syncScanImages();
});

get("segmentation").addEventListener("segmentation-select", (event) => chooseScan(event.detail.scanIndex));

get("prediction-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!model || !scans) return;
  try {
    scan = scans[Number(get("scan").value)];
    baseResult = predict(model, scan.features);
    removed.clear();
    topEffects = featureEffects(model, scan.features)
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
      .slice(0, TOP_N);
    showScanList();
    showPrediction(baseResult);
    update();
    const focusExplanation = document.activeElement === get("explain-predict");
    get("explain-prompt").hidden = true;
    get("explain").hidden = false;
    if (focusExplanation) get("scan-list").querySelector("button")?.focus();
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

get("remove-all").addEventListener("click", () => {
  for (const item of topEffects) removed.add(item.index);
  update();
});

get("reset").addEventListener("click", () => {
  removed.clear();
  update();
});

if (model && scans) {
  get("scan").disabled = false;
  get("predict").disabled = false;
  get("explain-predict").disabled = false;
  syncScanImages();
  const requestedScan = Number(new URLSearchParams(location.search).get("scan"));
  if (Number.isInteger(requestedScan) && requestedScan >= 1 && requestedScan <= scans.length) {
    chooseScan(requestedScan - 1);
    if (location.hash === "#scan-imaging") get("scan-imaging").scrollIntoView();
  }
}
