// Build circuit inputs for lacre.circom from the real Zinli .eml (headers-only).
// Fetches the DKIM public key from DNS (notificaciones.zinli.com selector scph1120).
const fs = require("fs");
const { generateEmailVerifierInputs } = require("@zk-email/helpers/dist/input-generators.js");

(async () => {
  const dir = "../../example-emails";
  const fn = fs.readdirSync(dir).find((f) => f.includes("Zinli"));
  if (!fn) throw new Error("Zinli .eml not found in " + dir);
  console.log("eml:", fn);
  const raw = fs.readFileSync(`${dir}/${fn}`);

  const inputs = await generateEmailVerifierInputs(raw, {
    maxHeadersLength: 1088,
    ignoreBodyHashCheck: true, // headers-only — body is infeasible to hash in-circuit
  });

  // Subject reveal needs the byte index where "subject:" begins in the signed header.
  const hdr = inputs.emailHeader.map((x) => String.fromCharCode(Number(x))).join("");
  inputs.subjectStartIndex = String(hdr.toLowerCase().indexOf("subject:") + "subject:".length);

  fs.writeFileSync("input.json", JSON.stringify(inputs));
  console.log("OK — wrote input.json  | subjectStartIndex:", inputs.subjectStartIndex);
  console.log("keys:", Object.keys(inputs).join(", "));
  console.log("emailHeaderLength:", inputs.emailHeaderLength);
  console.log("pubkey chunks:", inputs.pubkey && inputs.pubkey.length,
              "| signature chunks:", inputs.signature && inputs.signature.length);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
