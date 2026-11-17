// All numeric POS fields display Indonesian grouping; .value and FormData stay canonical.
const moneyName =
  /^(?:price|priceKg|pricePiece|salePrice|buyPrice|buyPricePiece|minPrice|maxPrice|purchaseCost|shippingCost|totalCost|paid|openingCash|closingCash|salary|wage)$/i;
export function normalizeNumericInput(value) {
  let raw = String(value ?? "");
  if (/^-?\d+(?:\.\d+)?e[+-]?\d+$/i.test(raw) && Number.isFinite(Number(raw)))
    raw = Number(raw).toLocaleString("en-US", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
  return raw.replace(/^(-?)0+(?=\d)/, "$1");
}
export function formatMoneyInput(value) {
  const raw = normalizeNumericInput(value);
  if (!raw) return "";
  const [integer, fraction] = raw.split(".");
  return (
    integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".") +
    (fraction !== undefined ? "," + fraction : "")
  );
}
export function parseMoneyInput(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^-?[\d.]+(?:,\d*)?$/.test(text)) throw Error("Isi dengan angka yang valid");
  return normalizeNumericInput(text.replaceAll(".", "").replace(",", "."));
}
export function installMoneyInputs(root = document) {
  const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  const bind = (input) => {
    if (input.dataset.moneyInput) {
      input.value = input.value;
      return;
    }
    if (
      (input.type !== "number" &&
        !moneyName.test(input.name || input.dataset.value || input.dataset.bulk || "")) ||
      !["number", "text"].includes(input.type)
    )
      return;
    const initial = native.get.call(input);
    const defaultStep = input.type === "number" ? "1" : "any";
    input.dataset.moneyInput = "true";
    input.type = "text";
    input.inputMode = "decimal";
    let raw = normalizeNumericInput(initial);
    const validate = () => {
      const n = Number(raw);
      let error = "";
      if (raw && (!/^-?\d+(?:\.\d*)?$/.test(raw) || !Number.isFinite(n)))
        error = "Isi dengan angka yang valid";
      else if (raw && input.min && n < Number(input.min))
        error = "Nominal minimal " + formatMoneyInput(input.min);
      else if (raw && input.max && n > Number(input.max))
        error = "Nominal maksimal " + formatMoneyInput(input.max);
      else if (raw && (input.step || defaultStep) !== "any") {
        const step = Number(input.step || defaultStep),
          base = Number(input.min || input.getAttribute("value") || 0);
        if (
          step > 0 &&
          Math.abs((n - base) / step - Math.round((n - base) / step)) > 1e-7
        )
          error = "Nominal tidak sesuai kelipatan " + formatMoneyInput(input.step);
      }
      input.setCustomValidity(error);
    };
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => raw,
      set: (value) => {
        raw = normalizeNumericInput(value);
        native.set.call(input, formatMoneyInput(raw));
        validate();
      },
    });
    Object.defineProperty(input, "valueAsNumber", {
      configurable: true,
      get: () => (raw ? Number(raw) : NaN),
      set: (value) => {
        input.value = value;
      },
    });
    input.value = initial;
    const selectZero = () => {
      if (raw && Number(raw) === 0) input.select();
    };
    input.addEventListener("focus", selectZero);
    input.addEventListener("click", selectZero);
    input.addEventListener(
      "input",
      () => {
        const displayed = native.get.call(input),
          caret = input.selectionStart ?? displayed.length;
        const removedZeroes =
          displayed.match(/^(-?)0+(?=\d)/)?.[0].replace("-", "").length || 0;
        const digitsBefore = Math.max(
          0,
          displayed.slice(0, caret).replace(/[^\d,]/g, "").length - removedZeroes,
        );
        try {
          raw = parseMoneyInput(displayed);
        } catch {
          raw = displayed;
          validate();
          return;
        }
        const formatted = formatMoneyInput(raw);
        native.set.call(input, formatted);
        let count = 0,
          next = 0;
        for (; next < formatted.length && count < digitsBefore; next++)
          if (/[\d,]/.test(formatted[next])) count++;
        input.setSelectionRange(next, next);
        validate();
      },
      true,
    );
    input.form?.addEventListener("formdata", (event) => {
      if (
        input.form === event.currentTarget &&
        !input.matches(":disabled") &&
        input.name
      ) {
        const controls = [...input.form.elements].filter(
          (el) => el.name === input.name && !el.matches(":disabled"),
        );
        if (controls.length === 1) event.formData.set(input.name, raw);
        else if (controls.every((el) => el.dataset.moneyInput)) {
          event.formData.delete(input.name);
          controls.forEach((el) => event.formData.append(input.name, el.value));
        }
      }
    });
    input.form?.addEventListener("reset", () => {
      queueMicrotask(() => {
        if (input.isConnected) input.value = input.defaultValue;
      });
    });
    input.form?.addEventListener(
      "submit",
      (event) => {
        if (input.form !== event.currentTarget || input.disabled) return;
        validate();
        if (!input.checkValidity()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          input.reportValidity();
        }
      },
      true,
    );
  };
  const scan = (node) => {
    if (node.matches?.("input")) bind(node);
    node.querySelectorAll?.("input").forEach(bind);
  };
  scan(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") scan(record.target);
      else record.addedNodes.forEach(scan);
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["name", "min", "max", "step", "value"],
  });
  return observer;
}
