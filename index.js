const express = require("express");
const session = require("express-session");
const path = require("path");
const bcrypt = require("bcrypt");
require("dotenv").config();
const knex = require("knex")({
  client: "pg",
  connection: {
      host : process.env.RDS_HOSTNAME,
      user : process.env.RDS_USERNAME,
      password : process.env.RDS_PASSWORD,
      database : process.env.RDS_DB_NAME,
      port : process.env.RDS_PORT,
      ssl: process.env.DB_SSL ? {rejectUnauthorized: false} : false 
  }
});

const app = express();
const PORT = process.env.PORT;

// Set up EJS as the template engine

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));


function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const user = req.session.user;
    if (!user || !allowedRoles.includes(user.userRole)) {
      return res.redirect("/");
    }
    next();
  };
}

app.use((req, res, next) => {
  // allow login and logout routes without authentication
  if (req.path === '/login' || req.path === '/logout') {
    // continue with the request path
    return next();
  }
  // check if user is authenticated
  // if (!req.session.user) {
  //   return res.redirect("/login");
  // }
  // set user in locals for views
  res.locals.user = req.session.user;
  next();
});


// Routes
app.get("/", (req, res) => {
  if (req.session.user) {
    // Logged-in version of landing page
    return res.render("landing/index", {
      title: "Dashboard",
      user: req.session.user
    });
  }

  // Visitor version
  res.render("landing/index", {
    title: "Home",
    user: null
  });
});





app.get("/login", (req, res) => {
  res.render("login/login", { title: "Login", active: "login", user: req.session.user });
});


// Need to store user data as session variables.
app.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send("Please provide email and password");
    }

    email = email.trim();
    password = password.trim();

    // Check credentials table
    const user = await knex("credentials")
      .select("credpass")
      .where("credemail", email)
      .first();

    if (!user) {
      return res.status(400).send("Invalid credentials");
    }

    const hashedPassword = user.credpass.trim();
    const valid = await bcrypt.compare(password, hashedPassword);

    if (!valid) {
      return res.status(400).send("Invalid credentials");
    }

    // Fetch member info
    const member = await knex("members")
      .select("memberid", "memberrole")
      .where("memberemail", email)
      .first();

    // Store session
    req.session.user = {
      email,
      userID: member?.memberid || null,
      userRole: member?.memberrole || null
    };

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Sign up
app.get("/signUp", (req, res) => {
  res.render("login/signUp", {title: "Sign Up"});
});

app.post("/signUp", async (req, res) => {
  try {
    let {memberfirstname, memberlastname, memberdob, memberphone, email, password, membercity, memberstate, memberzip, memberschooloremployer, memberfieldofinterest} = req.body;

    // Make sure email and password fields are both filled out
    if (!email || !password) {
      return res.status(400).render("login/signUp", { 
        title: "Sign Up",
        error_message: "Email and password are required." 
      });
    }

    // get rid of extra white space
    email = email.trim();
    password = password.trim();

    // Checking if the user already exists
    const existing = await knex("credentials")
      .where("credemail", email)
      .first();

    if (existing) {
      return res.status(400).render("login/signUp", { 
        title: "Sign Up",
        error_message: "An account with this email already exists. Please use a different email." 
      });
    }

    // Hashing the password before storing it
    const SALT_ROUNDS = 10;   // normal & safe
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Creating the new user object for the DB
    const newUser = {
      credemail: email,
      credpass: hashedPassword
    };

    // Creating the new member object for the DB
    const newMember = {
      memberfirstname: memberfirstname, 
      memberlastname: memberlastname, 
      memberdob: memberdob, 
      memberrole: "participant",
      memberphone: memberphone, 
      memberemail: email, 
      membercity: membercity, 
      memberstate: memberstate,
      memberzip: memberzip, 
      memberschooloremployer: memberschooloremployer, 
      memberfieldofinterest: memberfieldofinterest
    }

    // Inserting new user info into the credentials table in database
    await knex("credentials").insert(newUser);

    // Inserting user as new member into the members table in database
    await knex("members").insert(newMember)

    // Auto-login the user OR redirect to login page
    // Fetch the newly created member so we have their ID and role
    const createdMember = await knex("members")
    .where("memberemail", email)
    .first();

    // Store full session info
    req.session.user = {
    email,
    userID: createdMember.memberid,
    userRole: createdMember.memberrole
    };

    res.redirect("/");

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).render("login/signUp", { 
      title: "Sign Up",
      error_message: "Server error — please try again." 
    });
  }
});

// Log out
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error logging out");
    }
    res.redirect("/login");
  });
});

app.get("/events", requireRole("participant", "admin"), async (req, res) => {
  try {
    const events = await knex
      .select([
        'events.eventid',
        'events.eventdatetimestart',
        'events.eventdatetimeend',
        'events.eventlocation',
        'events.eventcapacity',
        'events.eventregistrationdeadline',
        'eventtemplates.eventname',
        'eventtemplates.eventtype',
        'eventtemplates.eventdescription',
        'eventtemplates.eventrecurrencepattern'
      ])
      .from('events')
      .join('eventtemplates', 'events.templateid', '=', 'eventtemplates.templateid');

    res.render('events/events', {
      title: "Events",
      active: "events",
      userRole: req.session.user.userRole,
      events
    });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});


app.get("/registration/:eventid", async (req, res) => {
  const userID = req.session.user.userID;
  const userRole = req.session.user.userRole;
  const eventid = req.params.eventid;

  if (!userID || !["participant", "admin"].includes(userRole)) return res.redirect("/");

  try {
    // Fetch event info
    const event = await knex("events")
      .join("eventtemplates", "events.templateid", "=", "eventtemplates.templateid")
      .select(
        "events.*",
        "eventtemplates.eventname",
        "eventtemplates.eventtype",
        "eventtemplates.eventdescription",
        "eventtemplates.eventrecurrencepattern"
      )
      .where("events.eventid", eventid)
      .first();

    if (!event) return res.redirect("/");

    const now = new Date();
    const eventEnded = now >= event.eventdatetimeend;

    // Fetch current user's registration, joining with registration table
    const perow = await knex("participantevent as pe")
      .join("registration as r", "pe.peid", "=", "r.peid")
      .where("pe.memberid", userID)
      .andWhere("pe.eventid", eventid)
      .select("pe.*", "r.registrationstatus")
      .first();

    const registered = !!perow;
    let showRegisterBtn = !registered && !eventEnded;
    let showCancelBtn = registered && !eventEnded;

    // Survey logic: show survey if user attended and hasn't submitted
    let showTakeSurvey = false;
    let surveySubmitted = false;

    if (perow && perow.registrationstatus === "attended") {
      const survey = await knex("surveys").where({ peid: perow.peid }).first();

      if (!survey) {
        showTakeSurvey = true;
        showRegisterBtn = false;
        showCancelBtn = false;
      } else {
        surveySubmitted = true;
        showRegisterBtn = false;
        showCancelBtn = false;
      }
    }

    // Fetch participants for display
    let participantsquery = knex("participantevent as pe")
      .join("members", "pe.memberid", "=", "members.memberid")
      .join("registration as r", "pe.peid", "=", "r.peid")
      .leftJoin("surveys as s", "pe.peid", "=", "s.peid")
      .select(
        "members.memberfirstname",
        "members.memberlastname",
        "r.registrationstatus",
        "r.registrationcheckintime",
        "r.registrationcreatedat",
        "pe.peid",
        knex.raw("CASE WHEN s.peid IS NOT NULL THEN true ELSE false END AS hasSurvey")
      )
      .where("pe.eventid", eventid);

    // Non-admin filter
    if (userRole !== "admin") {
      if (!eventEnded) {
        participantsquery.andWhere(function () {
          this.where("r.registrationstatus", "signedup").orWhere("r.registrationstatus", "attended");
        });
      } else {
        participantsquery.andWhere("r.registrationstatus", "attended");
      }
    }

    const participants = await participantsquery.orderByRaw(`
      CASE 
        WHEN r.registrationstatus='signedup' THEN 1
        WHEN r.registrationstatus='attended' THEN 2
        WHEN r.registrationstatus='cancelled' THEN 3
        WHEN r.registrationstatus='no-show' THEN 4
        ELSE 5
      END,
      members.memberlastname,
      members.memberfirstname
    `);

    res.render("events/registration", {
      title: "Registration",
      event,
      registered,
      eventEnded,
      showRegisterBtn,
      showCancelBtn,
      showTakeSurvey,
      surveySubmitted,
      participants,
      userRole
    });

  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});



app.post("/cancel/:eventid", requireRole("participant", "admin"), async (req, res) => {
  const userID = req.session.user.userID;
  const eventid = req.params.eventid;

  if (!userID) return res.status(403).send("Not logged in");

  try {
    // Find the participantevent row for this user and event
    const peRow = await knex("participantevent")
      .where({ memberid: userID, eventid: eventid })
      .first();

    if (!peRow) {
      return res.status(404).send("You are not registered for this event");
    }

    // Update registration status
    await knex("registration")
      .where({ peid: peRow.peid })
      .update({
        registrationstatus: "cancelled"
      });

    res.redirect(`/registration/${eventid}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error cancelling registration");
  }
});

app.post("/register/:eventid", requireRole("participant", "admin"), async (req, res) => {
  const userID = req.session.user.userID;
  const eventid = req.params.eventid;

  if (!userID) return res.status(403).send("Not logged in");

  try {
    // participantevent insert
    const [perow] = await knex("participantevent")
      .insert({
        memberid: userID,
        eventid: eventid
      })
      .returning("*");

    // registration insert
    await knex("registration").insert({
      peid: perow.peid,
      registrationstatus: "signedup",
      registrationcheckintime: null,
      registrationcreatedat: new Date()
    });

    res.redirect(`/registration/${eventid}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering for event");
  }
});


// POST: Check In / Check Out a participant (admin only)
app.post("/checkin/:peid", requireRole("admin"), async (req, res) => {
  const peid = req.params.peid;

  try {
    // Fetch current registration
    const reg = await knex("registration")
      .where({ peid: peid })
      .first();

    if (!reg) return res.status(404).send("Registration not found");

    let newStatus;
    let checkInTime = null;

    if (reg.registrationstatus === "attended") {
      // Check out → set status to "cancelled" and remove check-in time
      newStatus = "cancelled";
    } else {
      // Check in → set status to "attended" and add timestamp
      newStatus = "attended";
      checkInTime = new Date();
    }

    await knex("registration")
      .where({ peid: peid })
      .update({
        registrationstatus: newStatus,
        registrationcheckintime: checkInTime
      });

    // Redirect back to the registration page
    const peRow = await knex("participantevent").where({ peid: peid }).first();
    res.redirect(`/registration/${peRow.eventid}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating check-in status");
  }
});

// POST: End Event (mark all signed-up participants as no-show)
app.post("/endEvent/:eventid", requireRole("admin"), async (req, res) => {
  const eventid = req.params.eventid;

  try {
    // Update all signed-up registrations for this event to "no-show"
    const peids = await knex("participantevent")
      .where({ eventid: eventid })
      .pluck("peid");

    await knex("registration")
      .whereIn("peid", peids)
      .andWhere({ registrationstatus: "signedup" })
      .update({
        registrationstatus: "no-show"
      });

    res.redirect(`/registration/${eventid}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error ending event");
  }
});

// GET: Display Survey Form for a user and event
app.get("/surveyForm/:eventid", requireRole("participant", "admin"), async (req, res) => {
  const userID = req.session.user.userID;
  const eventid = req.params.eventid;

  if (!userID) return res.status(403).send("Not logged in");

  try {
    // 1. Verify that user is registered for the event
    const peRow = await knex("participantevent")
      .join("registration", "participantevent.peid", "=", "registration.peid")
      .join("events", "participantevent.eventid", "=", "events.eventid")
      .join("eventtemplates", "events.templateid", "=", "eventtemplates.templateid")
      .select(
        "participantevent.peid",
        "events.eventid",
        "events.eventdatetimestart",
        "events.eventdatetimeend",
        "events.eventlocation",
        "eventtemplates.eventname",
        "eventtemplates.eventdescription"
      )
      .where({
        "participantevent.memberid": userID,
        "participantevent.eventid": eventid
      })
      .first();

    if (!peRow) return res.status(403).send("Not registered for this event");

    // 2. Check if event has ended
    const now = new Date();
    if (now < new Date(peRow.eventdatetimeend)) {
      return res.status(403).send("Event has not ended yet");
    }

    // 3. Render survey form with hidden user & event fields
    res.render("surveys/surveyForm", {
      title: `Survey - ${peRow.eventname}`,
      peid: peRow.peid,
      memberid: userID,
      eventid: eventid,
      eventname: peRow.eventname,
      eventdescription: peRow.eventdescription,
      eventlocation: peRow.eventlocation,
      eventstart: peRow.eventdatetimestart,
      eventend: peRow.eventdatetimeend
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading survey form");
  }
});


// POST: Submit survey
app.post("/submitSurvey", requireRole("participant", "admin"), async (req, res) => {
  const { peid, memberid, eventid, surveysatisfactionscore, surveyusefulnessscore, surveyinstructorscore, surveyrecommendationscore, surveycomments, surveyoverallscore, surveysubmissiondate } = req.body;
  const userID = req.session.user.userID;

  try {
    // 1. Verify user is allowed to submit: must match session user and registration must exist
      const reg = await knex("registration as r")
        .join("participantevent as pe", "r.peid", "pe.peid")
        .join("events as e", "pe.eventid", "e.eventid")
        .select(
          "r.*",
          "pe.memberid",
          "pe.eventid",
          "pe.peid",
          "e.eventdatetimeend"
        )
        .where({
          "pe.peid": peid,
          "pe.memberid": userID,
          "pe.eventid": eventid
        })
        .first();

    if (!reg) return res.status(403).send("You are not authorized to submit this survey.");

    // 2. Ensure event has ended
    const now = new Date();
    if (now < new Date(reg.eventdatetimeend)) {
      return res.status(403).send("Event has not ended yet.");
    }

    // 3. Calculate overall score if missing
    let overallScore = surveyoverallscore;
    if (!overallScore) {
      const scores = [surveysatisfactionscore, surveyusefulnessscore, surveyinstructorscore, surveyrecommendationscore].map(Number);
      overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    // 4. Insert into surveys
    await knex("surveys").insert({
      peid,
      surveysatisfactionscore: Number(surveysatisfactionscore),
      surveyusefulnessscore: Number(surveyusefulnessscore),
      surveyinstructorscore: Number(surveyinstructorscore),
      surveyrecommendationscore: Number(surveyrecommendationscore),
      surveyoverallscore: Number(overallScore),
      surveycomments: surveycomments || null,
      surveysubmissiondate: surveysubmissiondate ? new Date(surveysubmissiondate) : new Date()
    });

    res.redirect(`/registration/${eventid}?surveySubmitted=1`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting survey");
  }
});

// Show empty form to add a new event (admin only)
// GET: Add new event (blank form)
app.get("/eventEdit", requireRole("admin"), async (req, res) => {
  try {
    const eventtemplates = await knex("eventtemplates").select("*");
    res.render("events/eventEdit", {
      title: "Add New Event",
      event: {},
      eventtemplates
    });
  } catch (err) {
    console.error(err);
    res.redirect("/events");
  }
});

// GET: Edit existing event
app.get("/eventEdit/:eventid", requireRole("admin"), async (req, res) => {
  const { eventid } = req.params;
  try {
    const event = await knex("events")
      .join("eventtemplates", "events.templateid", "=", "eventtemplates.templateid")
      .select(
        "events.*",
        "eventtemplates.eventname",
        "eventtemplates.templateid"
      )
      .where("events.eventid", eventid)
      .first();

    if (!event) return res.redirect("/events");

    const eventtemplates = await knex("eventtemplates").select("*");

    res.render("events/eventEdit", {
      title: "Edit Event",
      event,
      eventtemplates
    });
  } catch (err) {
    console.error(err);
    res.redirect("/events");
  }
});

// POST: Add or update event
app.post("/eventEdit", requireRole("admin"), async (req, res) => {
  const {
    eventid,
    eventtemplate,
    eventdatetimestart,
    eventdatetimeend,
    eventlocation,
    eventcapacity,
    eventregistrationdeadline
  } = req.body;

  try {
    if (eventid) {
      // Update existing event
      await knex("events")
        .where({ eventid })
        .update({
          templateid: eventtemplate,
          eventdatetimestart: new Date(eventdatetimestart),
          eventdatetimeend: new Date(eventdatetimeend),
          eventlocation,
          eventcapacity,
          eventregistrationdeadline: new Date(eventregistrationdeadline)
        });
    } else {
      // Insert new event
      await knex("events").insert({
        templateid: eventtemplate,
        eventdatetimestart: new Date(eventdatetimestart),
        eventdatetimeend: new Date(eventdatetimeend),
        eventlocation,
        eventcapacity,
        eventregistrationdeadline: new Date(eventregistrationdeadline)
      });
    }

    res.redirect("/events");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving event");
  }
});


app.post("/deleteEvent/:id", requireRole("admin"), (req, res) => {
  knex("events")
    .where("eventid", req.params.id)
    .del()
    .then(() => res.redirect("/events"))
    .catch(err => {
      console.error(err);
      res.status(500).json({ err });
    });
});


app.get("/donations", (req, res) => {
  knex.select(knex.raw('SUM(donationamount) as total')).from('donations')
    .then(result => {
      let totalAmount = result[0].total || 0;

      knex.select('donations.donationid', 'memberfirstname', 'donationdate', 'donationamount')
      .from('donations')
      .join('members', 'donations.memberid', '=', 'members.memberid')
      .then(donations => {
        res.render('donations/donations', {
          title: "Donations",
          active: "donations",
          donations: donations,
          totalAmount: totalAmount,
          userRole: req.session.user ? reg.session.user.userRole : null
        });

      });
    })


});

app.post("/deleteDonation/:id", (req, res) => {
    knex("donations").where("donationid", req.params.id).del().then(donations => {
        res.redirect("/donations");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});

// GET: Admin view all surveys (optionally by event)
app.get("/surveys", requireRole("admin"), async (req, res) => {
  const eventid = req.query.eventid;

  try {
    let query = knex("surveys as s")
      .join("participantevent as pe", "s.peid", "pe.peid")
      .join("members as m", "pe.memberid", "m.memberid")
      .join("events as e", "pe.eventid", "e.eventid")
      .join("eventtemplates as t", "e.templateid", "t.templateid")
      .select(
        "s.peid",
        "m.memberfirstname",
        "m.memberlastname",
        "s.surveyoverallscore",
        "s.surveysubmissiondate",
        "t.eventname",
        "pe.eventid"
      );

    if (eventid) query = query.where("pe.eventid", eventid);

    const surveys = await query;

    res.render("surveys/surveys", {
      title: eventid ? "Event Surveys" : "All Surveys",
      surveys,
      eventid: eventid || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching surveys");
  }
});

// GET: Admin view a single survey
app.get("/surveys/:peid", requireRole("admin"), async (req, res) => {
  const peid = req.params.peid;

  try {
    const survey = await knex("surveys as s")
      .join("participantevent as pe", "s.peid", "pe.peid")
      .join("members as m", "pe.memberid", "m.memberid")
      .join("events as e", "pe.eventid", "e.eventid")
      .join("eventtemplates as t", "e.templateid", "t.templateid")
      .select(
        "s.*",
        "m.memberfirstname",
        "m.memberlastname",
        "t.eventname",
        "pe.eventid"
      )
      .where("s.peid", peid)
      .first();

    if (!survey) return res.status(404).send("Survey not found");

    res.render("surveys/individualSurvey", {
      title: "Survey Detail",
      eventid: survey.eventid,
      survey
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching survey");
  }
});


app.post("/deleteSurvey/:id", async (req, res) => {
  try {
    await knex("surveys").where("peid", req.params.id).del();
    
    // Redirect back to the page that triggered the delete, or fallback to /surveys
    const redirectTo = req.query.redirect || "/surveys";
    res.redirect(redirectTo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ err });
  }
});


app.get("/milestones", (req, res) => {
  knex.select(['milestones.memberid', 'milestonetitle', 'milestones.memberid', 'milestonedate', 'memberfirstname', 'memberlastname'])
    .from('milestones')
    .join('members', 'milestones.memberid', '=', 'members.memberid')
    .then(milestones => {
      res.render("milestones/milestones", {
        title: "Milestones",
        active: "milestones",
        milestones: milestones,
        userRole: req.session.user.userRole,
        userID: req.session.user.userID
      });
    });
});

app.get("/milestoneEdit/:memberid/:title", async (req, res) => {
  const { user } = req.session;
  if (!user) return res.redirect("/");

  const memberid = req.params.memberid;
  const milestonetitle = decodeURIComponent(req.params.title);
  const ref = req.query.ref || "/milestones";

  // Fetch milestone with join
  const milestone = await knex("milestones as m")
    .join("members as mem", "m.memberid", "mem.memberid")
    .select(
      "m.memberid",
      "m.milestonetitle",
      "m.milestonedate",
      "mem.memberfirstname",
      "mem.memberlastname"
    )
    .where({
      "m.memberid": memberid,
      "m.milestonetitle": milestonetitle
    })
    .first();

  if (!milestone) return res.status(404).send("Milestone not found");

  // Admins can edit any milestone; participants only their own
  const isAdmin = user.userRole === "admin";
  const isOwner = user.userRole === "participant" && milestone.memberid === user.userID;

  if (!isAdmin && !isOwner) return res.redirect("/");

  res.render("milestones/milestoneEdit", {
    title: "Edit Milestone",
    active: "milestones",
    milestone,
    ref
  });
});




app.post("/milestoneEdit/:memberid/:title", async (req, res) => {
  const { user } = req.session;
  if (!user) return res.redirect("/");

  const memberid = req.params.memberid;
  const oldTitle = decodeURIComponent(req.params.title);
  const ref = req.body.ref || `/milestones`;

  // Fetch milestone
  const milestone = await knex("milestones")
    .where({ memberid, milestonetitle: oldTitle })
    .first();
  if (!milestone) return res.status(404).send("Milestone not found");

  // Admins can edit any; participants only their own
  const isAdmin = user.userRole === "admin";
  const isOwner = user.userRole === "participant" && milestone.memberid === user.userID;
  if (!isAdmin && !isOwner) return res.redirect("/");

  // Update milestone
  await knex("milestones")
    .where({ memberid, milestonetitle: oldTitle })
    .update({
      milestonetitle: req.body.milestonetitle,
      milestonedate: req.body.milestonedate
    });

  // Redirect back
  res.redirect(ref);
});

app.post("/deleteMilestone/:memberid/:title", async (req, res) => {
  const { user } = req.session;
  if (!user) return res.redirect("/");

  const memberid = req.params.memberid;
  const title = decodeURIComponent(req.params.title);
  const ref = req.body.ref || "/milestones";

  const milestone = await knex("milestones")
    .where({ memberid, milestonetitle: title })
    .first();
  if (!milestone) return res.status(404).send("Milestone not found");

  const isAdmin = user.userRole === "admin";
  const isOwner = user.userRole === "participant" && milestone.memberid === user.userID;
  if (!isAdmin && !isOwner) return res.redirect("/");

  await knex("milestones")
    .where({ memberid, milestonetitle: title })
    .del();

  res.redirect(ref);
});





app.get("/users", requireRole("admin", "participant"), async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 30;
    const offset = (page - 1) * limit;

    // 1️⃣ Count total users that match search
    const countQuery = knex("members").count("memberid as count");

    if (search) {
      countQuery.where((builder) => {
        builder
          .where("memberfirstname", "ilike", `%${search}%`)
          .orWhere("memberlastname", "ilike", `%${search}%`)
          .orWhere("memberemail", "ilike", `%${search}%`);
      });
    }

    const totalCount = await countQuery.first();
    const totalUsers = Number(totalCount.count);

    // 2️⃣ Get ONLY this page of users
    const usersQuery = knex("members")
      .select("memberid", "memberfirstname", "memberlastname", "memberemail");

    if (search) {
      usersQuery.where((builder) => {
        builder
          .where("memberfirstname", "ilike", `%${search}%`)
          .orWhere("memberlastname", "ilike", `%${search}%`)
          .orWhere("memberemail", "ilike", `%${search}%`);
      });
    }

    const users = await usersQuery
      .limit(limit)
      .offset(offset);

    // 3️⃣ Calculate number of pages
    const totalPages = Math.ceil(totalUsers / limit);

    res.render("users/users", {
      title: "Users",
      active: "users",
      users,
      search,
      currentPage: page,
      totalPages
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading users");
  }
});



app.get("/user_profile/:id", requireRole("participant", "admin"), (req, res) => {
  const memberid = req.params.id;

  // participants can only view their own profile
  if (req.session.user.userRole === "participant" && req.session.user.userID != memberid) {
    return res.status(403).send("Access denied");
  }

  knex.select('*')
    .from('members')
    .where('members.memberid', memberid)
    .first()
    .then(user => {
      if (!user) return res.status(404).send("User not found");

      knex.select(['memberid', 'milestonetitle', 'milestonedate'])
        .from('milestones')
        .where('milestones.memberid', memberid)
        .then(milestones => {
          res.render("users/user_profile", {
            title: "User Profile",
            active: "users",
            profileUser: user,
            milestones
          });
        });
    });
});

// Edit user
app.get("/editUser/:id", requireRole("admin"), async (req, res) => {
  const memberid = req.params.id;

  try {
    const member = await knex("members")
      .where("memberid", memberid)
      .first();

    if (!member) {
      return res.status(404).send("User not found");
    }

    res.render("users/editUser", {
      title: "Edit User",
      member: member,
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading user");
  }
});

// Save the edit user changes
app.post("/editUser/:id", requireRole("admin"), async (req, res) => {
  const memberid = req.params.id;

  const {
    memberfirstname,
    memberlastname,
    memberemail,
    memberphone,
    membercity,
    memberstate,
    memberzip,
    memberschooloremployer,
    memberfieldofinterest,
    memberrole
  } = req.body;

  try {
    await knex("members")
      .where("memberid", memberid)
      .update({
        memberfirstname,
        memberlastname,
        memberemail,
        memberphone,
        membercity,
        memberstate,
        memberzip,
        memberschooloremployer,
        memberfieldofinterest,
        memberrole
      });

    res.redirect("/users");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating user");
  }
});

  
// DELETE user (admin only)
app.post("/deleteUser/:id", requireRole("admin"), async (req, res) => {
  const memberid = req.params.id;

  try {
    // First delete credentials (foreign key may depend on order)
    await knex("credentials")
      .where("credemail", function() {
        this.select("memberemail")
            .from("members")
            .where("memberid", memberid);
      })
      .del();

    // Then delete the member record
    await knex("members")
      .where("memberid", memberid)
      .del();

    res.redirect("/users");
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).send("Error deleting user");
  }
});


app.get("/donationform", async (req, res) => {
  const userID = req.session.user ? req.session.user.userID : null;

  res.render("donations/donationform", {
    title: "Make a Donation",
    userID
  });
});

app.post("/donationform", async (req, res) => {
  try {
    const { donorName, donationAmount, memberid } = req.body;

    // Use NULL if guest
    const memberidValue = memberid || null;

    await knex("donations").insert({
      memberid: memberidValue,
      donationdate: new Date(),
      donationamount: donationAmount
    });

    res.send("Donation recorded. Thank you!"); // or redirect to a thank-you page
  } catch (err) {
    console.error(err);
    res.status(500).send("Error recording donation");
  }
});


app.get("/editdonation/:donationId", requireRole("admin"), async (req, res) => {
  const donationId = req.params.donationId;

  try {
    const donation = await knex("donations")
      .join("members", "donations.memberid", "=", "members.memberid")
      .select(
        "donations.*",
        "members.memberfirstname",
        "members.memberlastname"
      )
      .where("donationid", donationId)
      .first();

    if (!donation) return res.redirect("/donations");

    res.render("editdonation", {
      title: "Edit Donation",
      donation
    });
  } catch (err) {
    console.error(err);
    res.redirect("/donations");
  }
});

app.post("/editdonation/:donationId", requireRole("admin"), async (req, res) => {
  const donationId = req.params.donationId;
  const { donationAmount } = req.body;

  try {
    await knex("donations")
      .where("donationid", donationId)
      .update({
        donationamount: donationAmount
      });

    res.redirect("/donations");
  } catch (err) {
    console.error(err);
    res.redirect("/donations");
  }
});


app.get("/admin", requireRole("admin"), (req, res) => {
  res.render("admin/admin", {
    title: "Admin Dashboard",
    user: req.session.user
  });
});



// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
