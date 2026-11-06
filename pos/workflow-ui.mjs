export function formSection(number, title, description = '') {
  return `<div class="form-section-heading"><span class="workflow-number" aria-hidden="true">${number}</span><div><h3>${title}</h3>${description ? `<p>${description}</p>` : ''}</div></div>`;
}
