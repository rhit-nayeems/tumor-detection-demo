const VIEWS = ["axial", "coronal", "sagittal"];
const metricPercent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";

export function renderScanImaging(container, data, scans, chooseScan) {
  const byScan = new Map(data.samples.map((sample) => [sample.scanIndex, sample]));
  if (byScan.size !== data.samples.length) throw new Error("Duplicate scans in imaging manifest");
  for (const sample of data.samples) {
    if (scans[sample.scanIndex]?.name !== sample.scanName ||
        (sample.actual !== undefined && scans[sample.scanIndex]?.actual !== sample.actual)) {
      throw new Error("Imaging manifest does not match the scan dropdown");
    }
  }
  container.innerHTML = `
    <h2>CT and PET for the selected scan</h2>
    <p class="imaging-status" aria-live="polite"></p>
    <button type="button" class="secondary open-pilot"></button>
    <div class="imaging-viewer panel" hidden>
      <h3 class="imaging-title"></h3>
      <p class="imaging-metrics"></p>
      <p class="imaging-counts note"></p>
      <p class="imaging-downloads"><a class="preview-link" download>Download CT/PET comparison</a> · <a class="metrics-link" download>Download scan metrics (JSON)</a></p>
      <label class="overlay-control"><input type="checkbox" checked> Show heatmap and expert outlines</label>
      ${["ct", "pet"].map((modality) => `
        <h4>${modality.toUpperCase()}</h4>
        <div class="views">
          ${VIEWS.map((view) => `<figure>
            <figcaption>${view[0].toUpperCase() + view.slice(1)}</figcaption>
            <button type="button" class="view-button" data-modality="${modality}" data-view="${view}"><img alt=""></button>
          </figure>`).join("")}
        </div>`).join("")}
      <p class="note legend"><span><span class="legend-gradient"></span> Tumor probability 0 → 1</span><span class="expert-legend"><span class="legend-line"></span> Expert tumor outline</span></p>
      <p class="note">Both rows show the same locations and the same combined CT/PET tumor-probability map. This shows the segmentation prediction; it does not measure separate CT/PET importance or explain the classifier above.</p>
      <p class="note">Metrics cover the full 3D scan. These three slices show selected locations only.</p>
      <p class="note imaging-slices"></p>
      <p class="note">Epoch 760 checkpoint. PET display range 0–10 SUV. Click an image to enlarge it.</p>
    </div>
    <dialog class="imaging-dialog"><img alt=""><button type="button" class="secondary close-imaging">Close</button></dialog>`;

  const viewer = container.querySelector(".imaging-viewer");
  const status = container.querySelector(".imaging-status");
  const pilotButton = container.querySelector(".open-pilot");
  const checkbox = container.querySelector("input");
  const dialog = container.querySelector("dialog");
  pilotButton.textContent = data.samples.length ? `View ${data.samples[0].scanName} heatmap` : "Heatmaps pending";
  pilotButton.disabled = !data.samples.length;
  let selected = null;

  function updateImages() {
    const mode = checkbox.checked ? "overlay" : "plain";
    for (const button of container.querySelectorAll(".view-button")) {
      const { modality, view } = button.dataset;
      const image = button.querySelector("img");
      image.src = selected.images[modality][mode][view];
      const overlayLabel = selected.actual === 0 ? ", tumor-probability heatmap" : ", tumor-probability heatmap and expert outlines";
      image.alt = `${selected.scanName}, ${modality.toUpperCase()}, ${view}${checkbox.checked ? overlayLabel : ", scan without overlay"}`;
    }
  }

  function selectScan(index) {
    selected = byScan.get(index) ?? null;
    dialog.close();
    viewer.hidden = !selected;
    pilotButton.hidden = Boolean(selected);
    status.hidden = Boolean(selected);
    if (!selected) {
      for (const image of viewer.querySelectorAll("img")) image.removeAttribute("src");
      status.textContent = `CT/PET heatmaps available for ${data.samples.length} of ${scans.length} scans. Matching images for ${scans[index].name} are pending.`;
      return;
    }
    container.querySelector(".imaging-title").textContent = `${selected.scanName} · ${selected.tracer.toUpperCase()} · CT and PET`;
    container.querySelector(".imaging-metrics").textContent = selected.actual === 0
      ? `No labeled tumor. Segmentation flagged ${selected.predictedVoxels.toLocaleString()} voxels (${selected.predictedVolumeMl.toFixed(2)} mL) at probability 0.5. Peak probability ${(selected.peakProbability * 100).toFixed(1)}%.`
      : `Tumor overlap (Dice) ${metricPercent(selected.dice)} · Recall ${metricPercent(selected.recall)} · Precision ${metricPercent(selected.precision)}`;
    container.querySelector(".expert-legend").hidden = selected.actual === 0;
    container.querySelector(".imaging-counts").textContent = Number.isInteger(selected.falsePositiveVoxels)
      ? `Voxels matching labels: ${selected.truePositiveVoxels.toLocaleString()} · Extra predicted voxels: ${selected.falsePositiveVoxels.toLocaleString()} · Missed tumor voxels: ${selected.falseNegativeVoxels.toLocaleString()}` : "";
    const downloads = container.querySelector(".imaging-downloads");
    downloads.hidden = !selected.preview || !selected.metricsUrl;
    for (const [selector, path] of [[".preview-link", selected.preview], [".metrics-link", selected.metricsUrl]]) {
      const link = container.querySelector(selector);
      if (path) link.href = path;
      else link.removeAttribute("href");
    }
    container.querySelector(".imaging-slices").textContent = selected.sliceSelection + ".";
    updateImages();
  }

  pilotButton.addEventListener("click", () => chooseScan(data.samples[0].scanIndex));
  checkbox.addEventListener("change", () => {
    if (selected) updateImages();
  });
  container.addEventListener("click", (event) => {
    const button = event.target.closest(".view-button");
    if (button) {
      const image = button.querySelector("img");
      dialog.querySelector("img").src = image.src;
      dialog.querySelector("img").alt = image.alt;
      dialog.showModal();
    }
    if (event.target.closest(".close-imaging") || event.target === dialog) dialog.close();
  });
  return { selectScan };
}
