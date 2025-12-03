-- create the requisite tables, and set requirements. Also added cascading functionality.

CREATE TABLE EventTemplates (
    TemplateID SERIAL PRIMARY KEY,
    EventName VARCHAR(100) NOT NULL,
    EventType VARCHAR(50),
    EventDescription VARCHAR(255),
    EventRecurrencePattern VARCHAR(50),
    EventDefaultCapacity NUMERIC(4,0)
);

CREATE TABLE Events (
    EventID SERIAL PRIMARY KEY,
    TemplateID INT REFERENCES EventTemplates(TemplateID) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    EventDateTimeStart TIMESTAMP,
    EventDateTimeEnd TIMESTAMP,
    EventLocation VARCHAR(100),
    EventCapacity NUMERIC(4,0),
    EventRegistrationDeadline TIMESTAMP
);

CREATE TABLE Members (
    MemberID SERIAL PRIMARY KEY,
    MemberEmail VARCHAR(100) NOT NULL,
    MemberFirstName VARCHAR(50) NOT NULL,
    MemberLastName VARCHAR(75) NOT NULL,
    MemberDOB DATE,
    MemberRole VARCHAR(15),
    MemberPhone VARCHAR(30),
    MemberCity VARCHAR(25),
    MemberState VARCHAR(2),
    MemberZip VARCHAR(15),
    MemberSchoolOrEmployer VARCHAR(50),
    MemberFieldOfInterest VARCHAR(4),
    TotalDonations NUMERIC(12,2)
);

CREATE TABLE ParticipantEvent (
    PEID SERIAL PRIMARY KEY,
    EventID INT NOT NULL REFERENCES Events(EventID) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    MemberID INT NOT NULL REFERENCES Members(MemberID) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_event_member UNIQUE (EventID, MemberID)
);

CREATE TABLE Registration (
    PEID INT PRIMARY KEY REFERENCES ParticipantEvent(PEID) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    RegistrationStatus VARCHAR(10) NOT NULL,
    RegistrationCheckInTime TIMESTAMP,
    RegistrationCreatedAt TIMESTAMP NOT NULL
);

CREATE TABLE Surveys (
    PEID INT PRIMARY KEY REFERENCES ParticipantEvent(PEID) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    SurveySatisfactionScore NUMERIC(1,0),
    SurveyUsefulnessScore NUMERIC(1,0),
    SurveyInstructorScore NUMERIC(1,0),
    SurveyRecommendationScore NUMERIC(1,0),
    SurveyOverallScore NUMERIC(3,2),
    SurveyComments VARCHAR(1000),
    SurveySubmissionDate TIMESTAMP NOT NULL
);

CREATE TABLE Milestones (
    MemberID INT NOT NULL REFERENCES Members(MemberID) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    MilestoneTitle VARCHAR(50) NOT NULL,
    MilestoneDate DATE NOT NULL,
    PRIMARY KEY (MemberID, MilestoneTitle)
);

CREATE TABLE Donations (
    DonationID SERIAL PRIMARY KEY,
    MemberID INT NOT NULL REFERENCES Members(MemberID) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    DonationDate DATE,
    DonationAmount NUMERIC(10,2) NOT NULL
);

CREATE TABLE NPSBucketLookup (
    SurveyRecommendationScore INT PRIMARY KEY,
    SurveyNPSBucket VARCHAR(15) NOT NULL
);

CREATE TABLE AttendanceFlagLookup (
    RegistrationStatus VARCHAR(10) PRIMARY KEY,
    RegistrationAttendedFlag BOOLEAN NOT NULL
);

create table credentials (
	credemail varchar(255) primary key,
	credpass text not null
);


-- import data from tables. Two of these tables need quote characters.

COPY EventTemplates(TemplateID, EventName, EventType, EventDescription, EventRecurrencePattern, EventDefaultCapacity)
FROM 'C:/Program Files/PostgreSQL/import/New/EventTemplates.csv'
DELIMITER ','
CSV HEADER
QUOTE '"'
ESCAPE '"';
COPY Events(EventID, TemplateID, EventDateTimeStart, EventDateTimeEnd, EventLocation, EventCapacity, EventRegistrationDeadline)
FROM 'C:/Program Files/PostgreSQL/import/New/Events.csv'
DELIMITER ','
CSV HEADER;
COPY Members(MemberID, MemberEmail, MemberFirstName, MemberLastName, MemberDOB, MemberRole, MemberPhone, MemberCity, MemberState, MemberZip, MemberSchoolOrEmployer, MemberFieldOfInterest, TotalDonations)
FROM 'C:/Program Files/PostgreSQL/import/New/Members.csv'
DELIMITER ','
CSV HEADER;
COPY ParticipantEvent(PEID, EventID, MemberID)
FROM 'C:/Program Files/PostgreSQL/import/New/ParticipantEvent.csv'
DELIMITER ','
CSV HEADER;
COPY Registration(PEID, RegistrationStatus, RegistrationCheckInTime, RegistrationCreatedAt)
FROM 'C:/Program Files/PostgreSQL/import/New/Registration.csv'
DELIMITER ','
CSV HEADER;
COPY Surveys(PEID, SurveySatisfactionScore, SurveyUsefulnessScore, SurveyInstructorScore, SurveyRecommendationScore, SurveyOverallScore, SurveyComments, SurveySubmissionDate)
FROM 'C:/Program Files/PostgreSQL/import/New/Surveys.csv'
DELIMITER ','
CSV HEADER
QUOTE '"'
ESCAPE '"';
COPY Milestones(MemberID, MilestoneTitle, MilestoneDate)
FROM 'C:/Program Files/PostgreSQL/import/New/Milestones.csv'
DELIMITER ','
CSV HEADER;
COPY Donations(DonationID, MemberID, DonationDate, DonationAmount)
FROM 'C:/Program Files/PostgreSQL/import/New/Donations.csv'
DELIMITER ','
CSV HEADER;
COPY NPSBucketLookup(SurveyRecommendationScore, SurveyNPSBucket)
FROM 'C:/Program Files/PostgreSQL/import/New/NPSBucketLookup.csv'
DELIMITER ','
CSV HEADER;
COPY AttendanceFlagLookup(RegistrationStatus, RegistrationAttendedFlag)
FROM 'C:/Program Files/PostgreSQL/import/New/AttendanceFlagLookup.csv'
DELIMITER ','
CSV HEADER;
COPY credentials(credemail, credpass)
FROM 'C:/Program Files/PostgreSQL/import/New/output.csv'
DELIMITER ','
CSV HEADER;



-- adjust the auto-incrementing serial values

SELECT setval(
    'eventtemplates_templateid_seq',
    (SELECT MAX(TemplateID) FROM EventTemplates),
    true
);
SELECT setval(
    'events_eventid_seq',
    (SELECT MAX(EventID) FROM Events),
    true
);
SELECT setval(
    'members_memberid_seq',
    (SELECT MAX(MemberID) FROM Members),
    true
);
SELECT setval(
    'participantevent_peid_seq',
    (SELECT MAX(PEID) FROM ParticipantEvent),
    true
);
SELECT setval(
    'donations_donationid_seq',
    (SELECT MAX(DonationID) FROM Donations),
    true
);