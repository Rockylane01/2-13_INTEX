const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const { Client } = require("pg");
require("dotenv").config();

const SALT_ROUNDS = 6;
const csvPath = path.join(__dirname, "input.csv");

// Postgres client
const client = new Client({
  host: process.env.RDS_HOSTNAME,
  user: process.env.RDS_USERNAME,
  password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DB_NAME,
  port: parseInt(process.env.RDS_PORT, 10),
});

function sanitize(str) {
  // Trim and remove all invisible characters
  return str.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

async function main() {
  try {
    await client.connect();
    console.log("Connected to Postgres.");

    const csvData = fs.readFileSync(csvPath, "utf8")
      .split(/\r?\n/) // handle \r\n or \n line endings
      .filter(Boolean); // remove empty lines

    // Remove header
    const header = csvData.shift();

    for (const line of csvData) {
      let [email, ptp] = line.split(",");

      if (!email || !ptp) continue;

      email = sanitize(email);
      ptp = sanitize(ptp);

      const hashed = await bcrypt.hash(ptp, SALT_ROUNDS);

      await client.query(
        "INSERT INTO credentials (credemail, credpass) VALUES ($1, $2) ON CONFLICT (credemail) DO UPDATE SET credpass = EXCLUDED.credpass",
        [email, hashed]
      );

      console.log(`Inserted/updated: ${email}`);
    }

    console.log("All rows processed.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
    console.log("Disconnected from Postgres.");
  }
}

main();
