create table credentials (
	credemail varchar(255) primary key,
	credpass text not null
);
COPY credentials(credemail, credpass)
FROM 'C:/Program Files/PostgreSQL/import/New/output.csv'
DELIMITER ','
CSV HEADER;