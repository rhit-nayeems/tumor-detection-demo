import { predict } from "./inference.mjs";

const get = (id) => document.getElementById(id);
let model;
let scans;

function showError(message) {
  get("error").textContent = message;
  get("error").hidden = false;
}

async function loadJSON(filename) {
  const response = await fetch(new URL(filename, import.meta.url));
  if (!response.ok) throw new Error(`Unable to load ${filename}`);
  return response.json();
}

try {
  [model, scans] = await Promise.all([loadJSON("model.json"), loadJSON("scans.json")]);
  const options = scans.map((scan, i) => {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = scan.name;
    return option;
  });
  get("scan").replaceChildren(...options);
  get("scan").disabled = false;
  get("predict").disabled = false;
} catch (error) {
  showError("The demo could not load. Please refresh the page.");
  console.error(error);
}

get("prediction-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!model || !scans) return;
  try {
    const scan = scans[Number(get("scan").value)];
    const result = predict(model, scan.features);
    get("tumor-score").textContent = `${(result.probability * 100).toFixed(2)}%`;
    get("negative-score").textContent = `${((1 - result.probability) * 100).toFixed(2)}%`;
    get("tumor-bar").value = result.probability;
    get("negative-bar").value = 1 - result.probability;
    get("prediction").textContent = result.prediction ? "Tumor" : "No tumor";
    get("actual").textContent = scan.actual ? "Tumor" : "No tumor";
    get("correct").textContent = result.prediction === scan.actual ? "Correct" : "Incorrect";
    get("error").hidden = true;
  } catch (error) {
    showError("Unable to predict this scan. Please try again.");
    console.error(error);
  }
});
