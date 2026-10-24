import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboardRoot = path.resolve(__dirname, "../../apps/dashboard");

function listFiles(directory: string, suffix: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath, suffix);
    return entry.name.endsWith(suffix) ? [fullPath] : [];
  });
}

const ANIMATION_KEYWORDS = new Set([
  "ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end",
  "infinite", "normal", "reverse", "alternate", "alternate-reverse",
  "none", "forwards", "backwards", "both", "running", "paused",
  "initial", "inherit", "unset", "revert", "revert-layer"
]);

function keyframeNames(css: string) {
  return new Set(Array.from(css.matchAll(/@keyframes\s+([\w-]+)/g)).map((match) => match[1]));
}

// Names an `animation` / `animation-name` declaration points to: { local: bare identifiers, global: :global(name) }.
function referencedAnimations(css: string) {
  const local: string[] = [];
  const global: string[] = [];

  for (const match of css.matchAll(/(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    let value = match[1];
    value = value.replace(/:global\(\s*([\w-]+)\s*\)/g, (_all, name: string) => {
      global.push(name);
      return " ";
    });
    value = value.replace(/[\w-]+\([^)]*\)/g, " ");

    for (const token of value.split(/[\s,]+/)) {
      if (/^[A-Za-z_][\w-]*$/.test(token) && !ANIMATION_KEYWORDS.has(token)) {
        local.push(token);
      }
    }
  }

  return { local, global };
}

describe("css module animations", () => {
  const globals = fs.readFileSync(path.join(dashboardRoot, "app/globals.css"), "utf8");
  const globalKeyframes = keyframeNames(globals);
  const modules = listFiles(dashboardRoot, ".module.css");

  // `animation: foo` inside a CSS Module is renamed to Module_foo__hash, so keyframes declared only in globals.css never match.
  it("every animation used in a CSS Module has keyframes: local ones in the same file, global ones via :global()", () => {
    const problems: string[] = [];

    for (const file of modules) {
      const css = fs.readFileSync(file, "utf8");
      const defined = keyframeNames(css);
      const { local, global } = referencedAnimations(css);

      for (const name of local) {
        if (!defined.has(name)) {
          problems.push(`${path.relative(dashboardRoot, file)}: "${name}" has no @keyframes in this module (CSS Modules renames it, so it never matches the one in globals.css)`);
        }
      }
      for (const name of global) {
        if (!globalKeyframes.has(name)) {
          problems.push(`${path.relative(dashboardRoot, file)}: :global(${name}) is not defined in globals.css`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
