import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboardRoot = path.resolve(__dirname, "../../apps/dashboard");

function listTsx(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".next") return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTsx(fullPath);
    return entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

// JSX string attributes do not process escapes: pattern="\\d" reaches the browser with two backslashes.
function readPatterns(file: string) {
  const source = fs.readFileSync(file, "utf8");
  return Array.from(source.matchAll(/<input\b[^>]*?\bpattern="([^"]*)"[^>]*>/g)).map((match) => ({
    pattern: match[1],
    tag: match[0]
  }));
}

// What the browser does with the pattern attribute: ^(?:pattern)$ compiled with the `v` flag.
function browserRegExp(pattern: string) {
  return new RegExp(`^(?:${pattern})$`, "v");
}

describe("dashboard input patterns", () => {
  it("every pattern attribute is a valid regular expression without doubled backslashes", () => {
    const patterns = listTsx(dashboardRoot).flatMap((file) => readPatterns(file).map((entry) => ({ file, ...entry })));

    expect(patterns.length).toBeGreaterThan(0);
    for (const { file, pattern } of patterns) {
      expect(pattern, `${path.relative(dashboardRoot, file)}: ${pattern}`).not.toContain("\\\\");
      expect(() => browserRegExp(pattern), `${path.relative(dashboardRoot, file)}: ${pattern}`).not.toThrow();
    }
  });

  it("the template editor time field accepts HH:mm values and rejects everything else", () => {
    const file = path.join(dashboardRoot, "app/guilds/[guildId]/templates/[templateId]/TemplateVisualEditor.tsx");
    const timeInput = readPatterns(file).find((entry) => /\bname="time"/.test(entry.tag));

    expect(timeInput, "time input with a pattern").toBeDefined();
    const regExp = browserRegExp(timeInput?.pattern ?? "");

    for (const valid of ["20:00", "9:05", "09:05", "00:00", "23:59", "1:30"]) {
      expect(regExp.test(valid), valid).toBe(true);
    }
    for (const invalid of ["", "24:00", "20:60", "2000", "20:0", "ab:cd", "20:00:00", " 20:00"]) {
      expect(regExp.test(invalid), invalid).toBe(false);
    }
  });
});
