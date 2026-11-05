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
