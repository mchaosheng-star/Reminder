const fs = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "..", "dist", "index.html");
const html = fs.readFileSync(indexPath, "utf8");

fs.writeFileSync(
  indexPath,
  html
    .replace(/src="\/_expo\//g, 'src="./_expo/')
    .replace(/href="\/_expo\//g, 'href="./_expo/')
);
