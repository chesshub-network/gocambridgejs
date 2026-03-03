// ui.js
import { CLI } from "./cli.js";

const cli = new CLI();

export function setupUI() {
  document.getElementById("loadBtn").onclick = async () => {
    const org = document.getElementById("org").value;
    const product = document.getElementById("product").value;
    const cookie = document.getElementById("cookie").value;

    cli.init(org, product, cookie);

    const units = await cli.loadUnits("toc");
    renderUnits(units);
  };
}

function renderUnits(units) {
  const out = document.getElementById("output");
  out.textContent = JSON.stringify(units, null, 2);
}
