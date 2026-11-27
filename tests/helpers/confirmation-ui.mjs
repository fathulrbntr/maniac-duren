// Drive the actual decision dialog in the lightweight DOM tests.
export function answerConfirmations(doc, decide = () => true) {
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = create(tag);
    if (tag === "dialog") {
      const show = node.showModal.bind(node);
      node.showModal = () => {
        show();
        if (node.attrs.role === "alertdialog") {
          queueMicrotask(() => {
            if (decide()) node.querySelector("form").onsubmit({ preventDefault() {} });
            else node.querySelector("[data-cancel]").onclick();
          });
        }
      };
    }
    return node;
  };
}
