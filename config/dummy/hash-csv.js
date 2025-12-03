const fs = require("fs");
const bcrypt = require("bcrypt");
const SALT_ROUNDS = 12;

async function run() {
  const lines = fs.readFileSync("config/dummy/input.csv", "utf8").trim().split("\n");
  const header = lines.shift(); // remove header

  const out = ["email,password_hash"];

  for (const line of lines) {
    const [email, plaintext] = line.split(",");
    const hash = await bcrypt.hash(plaintext, SALT_ROUNDS);
    out.push(`${email},${hash}`);
  }

  fs.writeFileSync("config/dummy/output.csv", out.join("\n"));
  console.log("Done → output.csv");
}

run();
