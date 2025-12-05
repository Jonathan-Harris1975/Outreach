import fs from "fs";
import path from "path";

export function loadKeywordsFromFile(filePath = "keywords.txt") {
  const full = path.resolve(process.cwd(), filePath);
  const data = fs.readFileSync(full, "utf8");
  return data
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}
