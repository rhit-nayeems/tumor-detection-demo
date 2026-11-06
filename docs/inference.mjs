export function predict(model, features) {
  if (features.length !== model.inputSize) throw new Error("Unexpected feature count");
  const scaled = features.map((value, i) => Math.fround(
    Math.fround(value - model.mean[i]) / model.std[i]
  ));
  const hidden = model.hiddenWeight.map((weights, j) => {
    let sum = model.hiddenBias[j];
    for (let i = 0; i < scaled.length; i++) sum += weights[i] * scaled[i];
    return Math.max(0, Math.fround(sum));
  });
  let logit = model.outputBias;
  for (let i = 0; i < hidden.length; i++) logit += model.outputWeight[i] * hidden[i];
  const probability = 1 / (1 + Math.exp(-logit));
  return { probability, prediction: Number(probability >= model.threshold) };
}

export function describeFeature(model, index) {
  const channels = model.inputSize / 2;
  const channel = index % channels;
  const pooling = index < channels ? "patch-mean" : "patch-max";
  return { index, channel, pooling, label: `Channel ${channel} · ${pooling}` };
}

export function featureIndex(model, channel, pooling) {
  const channels = model.inputSize / 2;
  return pooling === "patch-max" ? channel + channels : channel;
}

export function removeFeatures(model, features, indices) {
  const copy = features.slice();
  for (const i of indices) copy[i] = model.mean[i];
  return copy;
}

export function featureEffects(model, features) {
  const baseProb = predict(model, features).probability;
  return features.map((_, index) => {
    const without = removeFeatures(model, features, [index]);
    return { index, effect: baseProb - predict(model, without).probability };
  });
}

export function zScore(model, features, index) {
  return (features[index] - model.mean[index]) / model.std[index];
}
