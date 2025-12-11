import https from "https";
import fs from "fs";
import crypto from "crypto";

const owner = process.env.GITHUB_REPOSITORY.split("/")[0];
const BAR = 24;

// RANDOM WORDS

const WORDS = [
  "Automation",
  "Security",
  "Linux",
  "Nexus",
  "Kernel",
  "Quasar",
  "Entropy",
  "Vector",
];

function pickWord() {
  const b = crypto.randomBytes(4).readUInt32BE(0);
  return WORDS[b % WORDS.length];
}

// SVG GENERATOR
function makeSVG(name) {
  return `
<svg width="200" height="20" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="15" fill="#4aa3ff" font-size="14">Random:</text>
  <text x="70" y="15" fill="#4CAF50" font-size="14">${name}</text>
</svg>
`.trim();
}

// GITHUB API

function api(path) {
  return new Promise((res, rej) => {
    https
      .get(
        `https://api.github.com${path}`,
        {
          headers: {
            "User-Agent": "readme-bot",
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
          },
        },
        (r) => {
          let d = "";
          r.on("data", (c) => (d += c));
          r.on("end", () => res(JSON.parse(d)));
        }
      )
      .on("error", rej);
  });
}

// FETCH DATA

const repos = await api(`/users/${owner}/repos?per_page=100&type=owner`);
const sizeByLang = {};

for (const r of repos) {
  if (r.fork) continue;
  const langs = await api(`/repos/${owner}/${r.name}/languages`);

  for (const [k, v] of Object.entries(langs)) {
    sizeByLang[k] = (sizeByLang[k] || 0) + v;
  }
}

// COMPUTE

const total = Object.values(sizeByLang).reduce((a, b) => a + b, 0);
if (!total) process.exit(0);

const rows = Object.entries(sizeByLang)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 3);

let used = rows.reduce((a, [, v]) => a + v, 0);
if (total - used > 0) rows.push(["Others", total - used]);

const lines = rows
  .map(([k, v]) => {
    const p = (v / total) * 100;
    const fill = Math.round((BAR * p) / 100);
    return `${k.padEnd(15)} ${"█".repeat(fill)}${"░".repeat(
      BAR - fill
    )}  ${p.toFixed(2)} %`;
  })
  .join("\n");

const svg = makeSVG(pickWord());
fs.writeFileSync("stats.svg", svgText, "utf8");

// INJECT INTO README

const block = `<!-- LANG-SECTION:START -->
\`\`\`text
Most Used Languages:

${lines}
\`\`\`

<img src="./stats.svg">
<!-- LANG-SECTION:END -->`;

let readme = fs.readFileSync("README.md", "utf8");

if (!readme.includes("LANG-SECTION:START")) {
  readme += "\n\n" + block;
} else {
  readme = readme.replace(
    /<!-- LANG-SECTION:START -->[\s\S]*?<!-- LANG-SECTION:END -->/,
    block
  );
}

fs.writeFileSync("README.md", readme, "utf8");
