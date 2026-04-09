import https from "https";
import fs from "fs";
import crypto from "crypto";

const owner = process.env.GITHUB_REPOSITORY.split("/")[0];
if (!owner) throw new Error("GITHUB_REPOSITORY is not set");

const STATE_FILE = ".readme-langs.json";
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
          r.on("end", () => { 
            if (r.statusCode && r.statusCode >= 400) {
              return rej(
                new Error( `Github API ${r.statusCode}: ${d || r.statusMessage}`)
              );
            }
            try {
              res(JSON.parse(d));
            } catch (err) {
              rej(new Error(`Invalid JSON from GitHub API: ${String(err)}`));
            }
          });
        }
      )
      .on("error", rej);
  });
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null; 
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveState(hash, word) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ hash, word }, null, 2) + "\n",
    "utf-8"
  );
}

// FETCH DATA

const repos = await api(`/users/${owner}/repos?per_page=100&type=owner`);
const sizeByLang = {};

for (const r of repos) {
  if (r.fork) continue;
  const langs = await api(`/repos/${owner}/${encodeURIComponent(r.name)}/languages`);
  for (const [k, v] of Object.entries(langs)) {
    sizeByLang[k] = (sizeByLang[k] || 0) + v;
  }
}

// COMPUTE HASH 

const statsHash = crypto
  .createHash("sha256")
  .update(JSON.stringify(sizeByLang))
  .digest("hex");


// LOAD PREVIOUS RUN DATA
let lastData = loadState();
const currentReadme = fs.existsSync("README.md")
  ? fs.readFileSync("README.md", "utf-8")
  :"";

  const hasLangSection = currentReadme.includes("LANG-SECTION:START");
  const statsSvgExists = fs.existsSync("stats.svg")

// Exit early only when everything already exists and nothing changed.
if (lastData?.hash === statsHash && hasLangSection && statsSvgExists) {
  console.log("Language stats unchanged. Nothing to update.");
  process.exit(0);
}

// COMPUTE BAR CHART
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

// PICK WORD ONLY ON CHANGE
const word = lastData?.hash === statsHash ? lastData.word : pickWord();

// GENERATE SVG ONLY WHEN NEEDED
if (lastData?.hash !== statsHash || !statsSvgExists) {
  const svg = makeSVG(word);
  fs.writeFileSync("stats.svg", svg, "utf8");
}

// GENERATE SVG ONLY WHEN NEEDED
const svg = makeSVG(word);
if (lastData?.hash !== statsHash || !statsSvgExists) {
  fs.writeFileSync("stats.svg", svg, "utf-8");
}

// BUILD README BLOCK

const block = `<!-- LANG-SECTION:START -->
\`\`\`text
Most Used Languages:

${lines}
\`\`\`

<img src="./stats.svg">
<!-- LANG-SECTION:END -->`;

// UPDATE README

let readme = currentReadme;
 
if (!hasLangSection) {
  readme += (readme.endsWith("\n") ? "\n" : "\n\n") + block;
} else {
  readme = readme.replace(
    /<!-- LANG-SECTION:START -->[\s\S]*?<!-- LANG-SECTION:END -->/,
    block
  );
}


fs.writeFileSync("README.md", readme, "utf8");

// SAVE LAST RUN STATE
saveState(statsHash, word);