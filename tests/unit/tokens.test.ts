import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

const requiredTokens = [
  "--brand-navy",
  "--brand-blue",
  "--brand-sky",
  "--brand-orange",
  "--brand-grey",
  "--brand-white",
  "--brand-deep",
  "--ink",
  "--ink-muted",
  "--surface",
  "--success",
  "--danger",
  "--radius-card",
  "--font-brand",
];

function sourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...sourceFiles(fullPath));
      continue;
    }
    if (/\.(tsx|ts|css)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("design tokens", () => {
  it("defines every brand token in tokens.css", () => {
    const css = readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
    for (const token of requiredTokens) {
      expect(css).toContain(token);
    }
  });

  it("keeps hex colors out of components and screens", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(root, "src"))) {
      if (file.endsWith(`${path.sep}styles${path.sep}tokens.css`)) {
        continue;
      }
      const contents = readFileSync(file, "utf8");
      if (/#[0-9a-fA-F]{3,8}\b/.test(contents)) {
        offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
