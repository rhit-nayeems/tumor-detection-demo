const VIEWS = ["axial", "coronal", "sagittal"];
const metricPercent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";

export function renderScanImaging(container, data, scans) {
  const byScan = new Map(data.samples.map((sample) => [sample.scanIndex, sample]));
  if (byScan.size !== data.samples.length) throw new Error("Duplicate scans in imaging manifest");
  for (const sample of data.samples) {
    if (scans[sample.scanIndex]?.name !== sample.scanName ||
        (sample.actual !== undefined && scans[sample.scanIndex]?.actual !== sample.actual)) {
      throw new Error("Imaging manifest does not match the scan dropdown");
    }
  }
  container.innerHTML = `
    <p class="imaging-status" aria-live="polite"></p>
    <div class="imaging-viewer panel" hidden>
      <div class="imaging-controls">
        <h2 class="imaging-title"></h2>
        <label class="plane-control">View
          <select aria-label="Slice view">
            ${VIEWS.map((view) => `<option value="${view}">${view[0].toUpperCase() + view.slice(1)}</option>`).join("")}
          </select>
        </label>
        <label class="overlay-control"><input type="checkbox"> Show heatmap</label>
      </div>
      <div class="scan-pair">
      ${["ct", "pet"].map((modality) => `
        <figure>
          <figcaption>${modality.toUpperCase()}</figcaption>
          <button type="button" class="view-button" title="Click to enlarge and zoom" data-modality="${modality}"><img alt=""></button>
        </figure>`).join("")}
      </div>
      <div class="heatmap-legend" hidden>
        <div class="legend">
          <div class="heatmap-scale" aria-label="Model heatmap: dark colors indicate low tumor likelihood, light colors indicate high tumor likelihood">
            <span class="legend-title">Model heatmap</span>
            <span class="legend-gradient" aria-hidden="true"></span>
            <div class="legend-endpoints"><span>Low tumor likelihood</span><span>High tumor likelihood</span></div>
          </div>
          <div class="expert-legend"><span class="legend-line" aria-hidden="true"></span><span>Actual tumor outline</span></div>
        </div>
      </div>
      <details class="imaging-details">
        <summary>Segmentation metrics and downloads</summary>
        <p class="imaging-metrics"></p>
        <p class="note imaging-slices"></p>
        <p class="imaging-downloads"><a class="preview-link" download>Download CT/PET comparison</a><a class="metrics-link" download>Download scan metrics (JSON)</a></p>
      </details>
    </div>
    <dialog class="imaging-dialog" aria-label="Scan image viewer">
      <div class="zoom-toolbar">
        <button type="button" class="secondary zoom-out" aria-label="Zoom out">−</button>
        <output class="zoom-level" aria-live="polite">100%</output>
        <button type="button" class="secondary zoom-in" aria-label="Zoom in">+</button>
        <button type="button" class="secondary zoom-reset">Reset</button>
        <button type="button" class="secondary close-imaging">Close</button>
      </div>
      <div class="zoom-viewport" tabindex="0" aria-label="Scan image. Scroll to move around when zoomed in."><div class="zoom-canvas"><img alt="" draggable="false"></div></div>
    </dialog>`;

  const viewer = container.querySelector(".imaging-viewer");
  const status = container.querySelector(".imaging-status");
  const checkbox = container.querySelector("input");
  checkbox.checked = location.hash === "#scan-imaging";
  const plane = container.querySelector("select");
  const legend = container.querySelector(".heatmap-legend");
  const dialog = container.querySelector("dialog");
  let selected = null;
  let zoom = 1;
  const zoomViewport = dialog.querySelector(".zoom-viewport");
  const zoomCanvas = dialog.querySelector(".zoom-canvas");

  function setZoom(value) {
    const next = Math.max(1, Math.min(4, value));
    const ratio = next / zoom;
    const left = (zoomViewport.scrollLeft + zoomViewport.clientWidth / 2) * ratio;
    const top = (zoomViewport.scrollTop + zoomViewport.clientHeight / 2) * ratio;
    zoom = next;
    zoomCanvas.style.width = `${zoom * 100}%`;
    zoomCanvas.style.height = `${zoom * 100}%`;
    zoomViewport.scrollLeft = left - zoomViewport.clientWidth / 2;
    zoomViewport.scrollTop = top - zoomViewport.clientHeight / 2;
    dialog.querySelector(".zoom-level").textContent = `${zoom * 100}%`;
    dialog.querySelector(".zoom-out").disabled = zoom === 1;
    dialog.querySelector(".zoom-in").disabled = zoom === 4;
  }

  dialog.querySelector(".zoom-in").addEventListener("click", () => setZoom(zoom + .5));
  dialog.querySelector(".zoom-out").addEventListener("click", () => setZoom(zoom - .5));
  dialog.querySelector(".zoom-reset").addEventListener("click", () => setZoom(1));

  function updateImages() {
    const mode = checkbox.checked ? "overlay" : "plain";
    const view = plane.value;
    legend.hidden = !checkbox.checked;
    for (const button of container.querySelectorAll(".view-button")) {
      const { modality } = button.dataset;
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
    status.hidden = Boolean(selected);
    if (!selected) {
      for (const image of viewer.querySelectorAll("img")) image.removeAttribute("src");
      status.textContent = `CT/PET images unavailable for ${scans[index].name}.`;
      return;
    }
    container.querySelector(".imaging-title").textContent = selected.scanName;
    container.querySelector(".imaging-metrics").textContent = selected.actual === 0
      ? `No labeled tumor. Segmentation flagged ${selected.predictedVolumeMl.toFixed(2)} mL at the 0.5 threshold.`
      : `Tumor overlap (Dice) ${metricPercent(selected.dice)} · Recall ${metricPercent(selected.recall)} · Precision ${metricPercent(selected.precision)}`;
    container.querySelector(".expert-legend").hidden = selected.actual === 0;
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

  plane.addEventListener("change", () => {
    if (selected) updateImages();
  });
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
      setZoom(1);
    }
    if (event.target.closest(".close-imaging") || event.target === dialog) dialog.close();
  });
  return { selectScan };
}
