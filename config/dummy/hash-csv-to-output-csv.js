const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
require("dotenv").config();

const SALT_ROUNDS = 6;
const inputCsvPath = path.join(__dirname, "input.csv");
const outputCsvPath = path.join(__dirname, "output.csv");

function sanitize(str) {
  // Trim and remove all invisible characters
  return str.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

async function main() {
  try {
    const csvData = fs.readFileSync(inputCsvPath, "utf8")
      .split(/\r?\n/) // handle \r\n or \n line endings
      .filter(Boolean); // remove empty lines

    // Remove header
    const header = csvData.shift();

    // Prepare output CSV with header
    const outputRows = ["credemail,credpass"];

    for (const line of csvData) {
      let [email, ptp] = line.split(",");

      if (!email || !ptp) continue;

      email = sanitize(email);
      ptp = sanitize(ptp);

      const hashed = await bcrypt.hash(ptp, SALT_ROUNDS);

      outputRows.push(`${email},${hashed}`);
      console.log(`Processed: ${email}`);
    }

    // Write to output CSV
    fs.writeFileSync(outputCsvPath, outputRows.join("\n"), "utf8");
    console.log(`All rows written to ${outputCsvPath}`);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
