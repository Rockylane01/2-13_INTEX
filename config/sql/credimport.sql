-- Drop the table if it exists
DROP TABLE IF EXISTS credentials;

-- Recreate the table
CREATE TABLE credentials (
    credemail VARCHAR(255) PRIMARY KEY,
    credpass TEXT NOT NULL
);

-- Import CSV directly while cleaning invisible characters
-- Use COPY if the server can access the file
-- Replace '/absolute/path/to/output.csv' with your file path

-- Using a CTE to trim invisible characters while inserting
WITH raw_csv AS (
    SELECT *
    FROM (
        COPY (
            SELECT *
            FROM pg_read_file('C:\Program Files\PostgreSQL\import\New\output.csv')
        ) TO STDOUT
    ) AS tmp(credemail TEXT, credpass TEXT)
)
INSERT INTO credentials (credemail, credpass)
SELECT
    regexp_replace(credemail, '[\u200B-\u200D\uFEFF]', '', 'g') AS credemail,
    regexp_replace(credpass, '[\u200B-\u200D\uFEFF]', '', 'g') AS credpass
FROM raw_csv;

-- Verify
SELECT * FROM credentials;
