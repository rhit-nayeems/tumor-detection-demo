import { predict } from "./inference.mjs";

// Counts from the earlier demo on the same 315 validation scans.
const previous = { tn: 72, fp: 31, fn: 57, tp: 155 };
const percent = (value) => `${(value * 100).toFixed(2)}%`;

function confusionMatrix(scans, classify) {
  const counts = { tn: 0, fp: 0, fn: 0, tp: 0 };
  for (const scan of scans) {
    const prediction = classify(scan);
    if (scan.actual) counts[prediction ? "tp" : "fn"]++;
    else counts[prediction ? "fp" : "tn"]++;
  }
  return counts;
}

function metricRow(label, { tn, fp, fn, tp }) {
  const total = tn + fp + fn + tp;
  const accuracy = (tn + tp) / total;
  const sensitivity = tp / (tp + fn);
  const specificity = tn / (tn + fp);
  const balanced = (sensitivity + specificity) / 2;
  return `
    <tr><th scope="row">${label}</th><td>${total}</td>
    ${[accuracy, balanced, sensitivity, specificity].map((value) => `<td>${percent(value)}</td>`).join("")}</tr>`;
}

function table(label, rows) {
  return `
    <div class="table-scroll" tabindex="0" role="region" aria-label="${label}">
      <table>
        <thead><tr><th scope="col">${label}</th><th scope="col">Scans</th><th scope="col">Accuracy</th><th scope="col">Balanced accuracy</th><th scope="col">Sensitivity</th><th scope="col">Specificity</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    </div>`;
}

export function renderResults(container, model, scans, tracers) {
  const classify = (scan) => predict(model, scan.features).prediction;
  const overall = confusionMatrix(scans, classify);
  const rows = [
    metricRow("Always predict tumor", confusionMatrix(scans, () => 1)),
    metricRow("Previous classifier", previous),
    metricRow("Demo classifier (epoch-760 features)", overall),
  ];
  const hasTracers = Array.isArray(tracers) && tracers.length === scans.length;
  const tracerRows = hasTracers ? ["FDG", "PSMA"].map((tracer) => {
    const group = scans.filter((_, i) => tracers[i] === tracer.toLowerCase());
    return metricRow(tracer, confusionMatrix(group, classify));
  }) : [];

  container.innerHTML = `
    <section class="panel metrics-panel">
      <h2>Classifier performance</h2>
      <p class="note">315 shared AutoPET validation scans, split by patient.</p>
      ${table("Model", rows)}
      <p class="note">Balanced accuracy averages sensitivity and specificity.</p>
    </section>
    ${hasTracers ? `
    <section class="panel metrics-panel">
      <h2>Demo classifier by PET tracer</h2>
      ${table("Tracer", tracerRows)}
      <p class="note">Only 10 PSMA validation scans were tumor-free.</p>
    </section>` : ""}`;
}
