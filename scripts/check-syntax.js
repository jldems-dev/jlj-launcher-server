const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const roots = ["server.js", "src", "scripts"];

function collectJsFiles(target, files = []) {
  const fullPath = path.join(__dirname, "..", target);
  if (!fs.existsSync(fullPath)) return files;

  const stat = fs.statSync(fullPath);
  if (stat.isFile() && fullPath.endsWith(".js")) {
    files.push(fullPath);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(fullPath)) {
    collectJsFiles(path.join(target, entry), files);
  }

  return files;
}

const files = roots.flatMap((root) => collectJsFiles(root));

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log(`Syntax check passed for ${files.length} file(s).`);
