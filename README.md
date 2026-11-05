# Tumor Detection demo

Website files for the [personal project fork](https://github.com/rhit-nayeems/tumor-detection-model).
The original [team project](https://github.com/rhit-steelevw/tumor-detection-model) contains the encoder pipeline and project history.

Select an AutoPET validation scan to run the saved classifier in the browser.
The page uses precomputed features, 640 inputs, 16 hidden ReLU neurons, and a
0.55 tumor threshold. It does not run the full encoder or accept uploaded scans.

Only aliased validation features, labels, and classifier weights are included.
Validation was used for model selection; these examples are not a test-set
accuracy assessment. See the project notebook for results and limitations.

## Run locally

```bash
python -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Open http://127.0.0.1:8000. GitHub Actions publishes `docs/` to Pages on updates
to `main`. No Python server or external model service is needed on the host.
