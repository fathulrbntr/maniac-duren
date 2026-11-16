import path from "node:path";
import { parse } from "espree";

const browserFile = (file) =>
  /^(pos|menu|shared)\//.test(file) ||
  ["index.html", "script.js", "pos-recover.html", "pos-recovery.mjs"].includes(file);
const label = (node) => node?.name ?? node?.value;
function bindings(node) {
  if (!node) return [];
  if (node.type === "Identifier") return [node.name];
  if (node.type === "RestElement") return bindings(node.argument);
  if (node.type === "AssignmentPattern") return bindings(node.left);
  if (node.type === "ArrayPattern") return node.elements.flatMap(bindings);
  if (node.type === "ObjectPattern")
    return node.properties.flatMap((p) =>
      bindings(p.type === "RestElement" ? p.argument : p.value),
    );
  return [];
}
function visit(node, callback) {
  if (!node?.type) return;
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => visit(child, callback));
    else if (value?.type) visit(value, callback);
  }
}

export function moduleSpecifiers(source) {
  const specifiers = [];
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  visit(ast, (node) => {
    if (
      [
        "ImportDeclaration",
        "ImportExpression",
        "ExportNamedDeclaration",
        "ExportAllDeclaration",
      ].includes(node.type) &&
      typeof node.source?.value === "string"
    )
      specifiers.push(node.source.value);
  });
  return specifiers;
}

// Pure analysis: fixtures can exercise the same checks without changing the checkout.
export function analyzeArchitecture(sources, inventory = new Set(sources.keys())) {
  const failures = [],
    modules = new Map(),
    identities = new Map(),
    casing = new Map();
  for (const file of inventory) {
    const folded = file.toLowerCase();
    if (casing.has(folded))
      failures.push(`Case collision: ${casing.get(folded)} / ${file}`);
    casing.set(folded, file);
  }
  for (const [file, source] of sources) {
    if (
      !browserFile(file) ||
      file.startsWith("pos/vendor/") ||
      !/\.(m?js|html)$/.test(file)
    )
      continue;
    const info = { imports: [], exports: new Set(), stars: [] };
    modules.set(file, info);
    const dependency = (specifier, names = []) => {
      if (typeof specifier !== "string") return; // Computed imports need a runtime test.
      if (/^(https?:|data:|\/\/)/.test(specifier)) return;
      if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
        failures.push(`${file}: browser import needs a URL: ${specifier}`);
        return;
      }
      const url = new URL(specifier, "https://project.invalid/" + file);
      const target = decodeURIComponent(url.pathname.slice(1));
      if (!inventory.has(target))
        failures.push(
          `${file}: missing import ${specifier}${casing.has(target.toLowerCase()) ? " (wrong filename case)" : ""}`,
        );
      if (/^(tests|scripts|docs|database|supabase|api|node_modules)\//.test(target))
        failures.push(
          `${file}: browser code cannot import development/server files: ${target}`,
        );
      if (file.startsWith("shared/") && !target.startsWith("shared/"))
        failures.push(`${file}: shared code cannot depend on an application: ${target}`);
      if (!identities.has(target)) identities.set(target, new Set());
      identities.get(target).add(url.search + url.hash);
      info.imports.push({ target, names });
      return target;
    };
    const inspect = (code) => {
      let ast;
      try {
        ast = parse(code, { ecmaVersion: "latest", sourceType: "module" });
      } catch (error) {
        failures.push(`${file}: ${error.message}`);
        return;
      }
      visit(ast, (node) => {
        if (node.type === "ImportDeclaration")
          dependency(
            node.source.value,
            node.specifiers.flatMap((s) =>
              s.type === "ImportNamespaceSpecifier"
                ? []
                : [s.type === "ImportDefaultSpecifier" ? "default" : label(s.imported)],
            ),
          );
        if (node.type === "ImportExpression") dependency(node.source.value);
        if (node.type === "ExportDefaultDeclaration") info.exports.add("default");
        if (node.type === "ExportNamedDeclaration") {
          const declaration = node.declaration;
          if (declaration?.id) info.exports.add(declaration.id.name);
          for (const d of declaration?.declarations || [])
            bindings(d.id).forEach((name) => info.exports.add(name));
          node.specifiers.forEach((s) => info.exports.add(label(s.exported)));
          if (node.source)
            dependency(
              node.source.value,
              node.specifiers.map((s) => label(s.local)),
            );
        }
        if (node.type === "ExportAllDeclaration") {
          const target = dependency(node.source.value);
          if (node.exported) info.exports.add(label(node.exported));
          else if (target) info.stars.push(target);
        }
      });
    };
    if (!file.endsWith(".html")) inspect(source);
    else
      for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        const attrs = match[1];
        if (!/\btype\s*=\s*["']module["']/i.test(attrs)) continue;
        const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
        if (src)
          dependency(
            src.startsWith(".") || src.startsWith("/") || /^\w+:/.test(src)
              ? src
              : "./" + src,
          );
        else inspect(match[2]);
      }
  }
  for (const [target, versions] of identities)
    if (versions.size > 1) failures.push(`${target}: multiple module URL identities`);
  const exported = (file, name, seen = new Set()) => {
    if (seen.has(file)) return false;
    seen.add(file);
    const info = modules.get(file);
    return (
      !!info &&
      (info.exports.has(name) ||
        (name !== "default" && info.stars.some((target) => exported(target, name, seen))))
    );
  };
  for (const [file, info] of modules)
    for (const { target, names } of info.imports)
      if (modules.has(target))
        for (const name of names)
          if (!exported(target, name))
            failures.push(`${file}: ${target} does not export ${name}`);
  const done = new Set(),
    active = new Set(),
    chain = [];
  const walk = (file) => {
    if (active.has(file)) {
      failures.push(
        "Circular dependency: " +
          [...chain.slice(chain.indexOf(file)), file].join(" -> "),
      );
      return;
    }
    if (done.has(file)) return;
    active.add(file);
    chain.push(file);
    for (const { target } of modules.get(file)?.imports || []) walk(target);
    chain.pop();
    active.delete(file);
    done.add(file);
  };
  for (const file of modules.keys()) walk(file);
  return { failures: [...new Set(failures)], moduleCount: modules.size };
}

export function checkDependencyLock(manifest, lock) {
  const failures = [];
  for (const [file, entry] of Object.entries(lock.packages || {})) {
    if (
      file &&
      (!file.startsWith("node_modules/") ||
        entry.link ||
        entry.extraneous ||
        /^file:/.test(entry.resolved || ""))
    )
      failures.push(`Non-portable/extraneous lockfile entry: ${file}`);
  }
  for (const [name, version] of Object.entries(manifest.devDependencies || {})) {
    if (
      lock.packages?.[""]?.devDependencies?.[name] !== version ||
      lock.packages?.[path.posix.join("node_modules", name)]?.version !== version
    )
      failures.push(`Dependency pin does not match lockfile: ${name}`);
  }
  return failures;
}
