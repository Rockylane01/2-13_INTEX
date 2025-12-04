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
  //}
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
      userID: member ? member.memberid : null,
      userRole: member && member.memberrole ? member.memberrole : "guest"
    };

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});




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
        'events.eventdatetimend',
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
      userRole: req.session.userRole,
      events
    });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});


app.get("/registration/:eventId", async (req, res) => {
  const userID = req.session.userID;
  const userRole = req.session.userRole;
  const eventId = req.params.eventId;

  // must be logged in & role must be participant or admin
  if (!userID || !["participant", "admin"].includes(userRole))
    return res.redirect("/");

  try {
    // 1. Get event info + template info
    const event = await knex("events")
      .join("eventtemplates", "events.templateid", "=", "eventtemplates.templateid")
      .select(
        "events.*",
        "eventtemplates.eventname",
        "eventtemplates.eventtype",
        "eventtemplates.eventdescription",
        "eventtemplates.eventrecurrencepattern"
      )
      .where("events.eventid", eventId)
      .first();

    if (!event) return res.redirect("/");

    const now = new Date();
    const eventEnded = now >= event.EventDateTimeEnd;

    // 2. Check if the user is registered in participantevent
    const peRow = await knex("participantevent")
      .where({ MemberID: userID, EventID: eventId })
      .first();

    // ========== CASE A: NOT REGISTERED ==========
    if (!peRow) {
      return res.render("registration", {
        title: "Registration",
        event,
        registered: false,
        eventEnded,
        showRegisterBtn: !eventEnded,
        showCancelBtn: false,
        showTakeSurvey: false,
        surveySubmitted: false
      });
    }

    // ========== CASE B: REGISTERED ==========
    const userPEID = peRow.PEID;

    // If event is still ongoing → show cancel registration, nothing else
    if (!eventEnded) {
      return res.render("registration", {
        title: "Registration",
        event,
        registered: true,
        eventEnded,
        showRegisterBtn: false,
        showCancelBtn: true,
        showTakeSurvey: false,
        surveySubmitted: false
      });
    }

    // ========== Event has ended, check attendance ==========
    const regRow = await knex("registration")
      .where({ PEID: userPEID })
      .first();

    const attended = regRow?.RegistrationStatus === "attended";

    if (!attended) {
      // event ended, user registered, but did NOT attend → show nothing
      return res.render("registration", {
        title: "Registration",
        event,
        registered: true,
        eventEnded,
        showRegisterBtn: false,
        showCancelBtn: false,
        showTakeSurvey: false,
        surveySubmitted: false
      });
    }

    // ========== Attended, event ended → check survey status ==========
    const surveyRow = await knex("surveys")
      .where({ PEID: userPEID })
      .first();

    const surveySubmitted = !!surveyRow;

    return res.render("registration", {
      title: "Registration",
      event,
      registered: true,
      eventEnded,
      showRegisterBtn: false,
      showCancelBtn: false,
      showTakeSurvey: !surveySubmitted,
      surveySubmitted
    });

  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

app.post("/register/:eventId", requireRole("participant", "admin"), async (req, res) => {
  const userID = req.session.userID;
  const eventID = req.params.eventId;

  if (!userID) return res.status(403).send("Not logged in");

  try {
    // 1. Insert into participantevent
    const [peRow] = await knex("participantevent")
      .insert({
        MemberID: userID,
        EventID: eventID
      })
      .returning("*"); // returns the inserted row including PEID

    // 2. Insert into registration
    await knex("registration").insert({
      PEID: peRow.PEID,
      RegistrationStatus: "signedup",
      RegistrationCheckInTime: null,
      RegistrationCreatedAt: new Date()
    });

    res.redirect(`/registration/${eventID}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering for event");
  }
});

app.post("/cancel/:eventId", requireRole("participant", "admin"), async (req, res) => {
  const userID = req.session.userID;
  const eventID = req.params.eventId;

  if (!userID) return res.status(403).send("Not logged in");

  try {
    // Find the participantevent row for this user and event
    const peRow = await knex("participantevent")
      .where({ MemberID: userID, EventID: eventID })
      .first();

    if (!peRow) {
      return res.status(404).send("You are not registered for this event");
    }

    // Update registration status
    await knex("registration")
      .where({ PEID: peRow.PEID })
      .update({
        RegistrationStatus: "cancelled"
      });

    res.redirect(`/registration/${eventID}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error cancelling registration");
  }
});



// Show empty form to add a new event (admin only)
app.get("/eventEdit", requireRole("admin"), (req, res) => {
  // Render the same form, but with no pre-filled data
  res.render("eventEdit", {
    title: "Add New Event",
    event: {
      eventid: null,
      eventname: "",
      eventtype: "",
      eventdescription: "",
      eventrecurrencepattern: "",
      eventdatetimestart: "",
      eventdatetimend: "",
      eventlocation: "",
      eventcapacity: "",
      eventregistrationdeadline: ""
    }
  });
});


app.get("/eventEdit/:eventId", requireRole("admin"), async (req, res) => {
  const eventId = req.params.eventId;

  try {
    const event = await knex("events")
      .join("eventtemplates", "events.templateid", "=", "eventtemplates.templateid")
      .select(
        "events.*",
        "eventtemplates.eventname",
        "eventtemplates.eventtype",
        "eventtemplates.eventdescription",
        "eventtemplates.eventrecurrencepattern"
      )
      .where("events.eventid", eventId)
      .first();

    if (!event) return res.redirect("/events");

    res.render("eventEdit", {
      title: "Edit Event",
      event
    });
  } catch (err) {
    console.error(err);
    res.redirect("/events");
  }
});

app.post("/eventEdit", requireRole("admin"), async (req, res) => {
  const {
    eventID,
    eventName,
    eventType,
    eventDescription,
    eventRecurrence,
    eventStart,
    eventEnd,
    eventLocation,
    eventCapacity,
    registrationDeadline
  } = req.body;

  try {
    if (eventID) {
      // UPDATE existing event
      await knex("events")
        .where({ EventID: eventID })
        .update({
          EventDateTimeStart: new Date(eventStart),
          EventDateTimeEnd: new Date(eventEnd),
          EventLocation: eventLocation,
          EventCapacity: eventCapacity,
          EventRegistrationDeadline: new Date(registrationDeadline)
        });

      await knex("eventtemplates")
        .where({ TemplateID: (await knex("events").select("TemplateID").where({ EventID: eventID }).first()).templateid })
        .update({
          EventName: eventName,
          EventType: eventType,
          EventDescription: eventDescription,
          EventRecurrencePattern: eventRecurrence
        });
    } else {
      // INSERT new event
      const [templateID] = await knex("eventtemplates")
        .insert({
          EventName: eventName,
          EventType: eventType,
          EventDescription: eventDescription,
          EventRecurrencePattern: eventRecurrence
        })
        .returning("TemplateID");

      await knex("events").insert({
        TemplateID: templateID,
        EventDateTimeStart: new Date(eventStart),
        EventDateTimeEnd: new Date(eventEnd),
        EventLocation: eventLocation,
        EventCapacity: eventCapacity,
        EventRegistrationDeadline: new Date(registrationDeadline)
      });
    }

    res.redirect("/events");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving event");
  }
});


app.get("/donations", (req, res) => {
  knex.select(knex.raw('SUM(donationamount) as total')).from('donations')
    .then(result => {
      let totalAmount = result[0].total || 0;

      knex.select('memberfirstname', 'donationdate', 'donationamount')
      .from('donations')
      .join('members', 'donations.memberid', '=', 'members.memberid')
      .then(donations => {
        res.render('donations/donations', {
          title: "Donations",
          active: "donations",
          donations: donations,
          totalAmount: totalAmount
        });
        
      });
    })

  
});

app.get("/surveys", requireRole("admin"), (req, res) => {
  knex.select('participantevent.peid', 'members.memberfirstname', 'members.memberlastname', 'eventtemplates.eventname', 'surveys.surveyoverallscore')
    .from('participantevent')
    .join('members', 'participantevent.memberid', '=', 'members.memberid')
    .join('events', 'participantevent.eventid', '=', 'events.eventid')
    .join('eventtemplates', 'events.templateid', '=', 'eventtemplates.templateid')
    .join('surveys', 'participantevent.peid', '=', 'surveys.peid')
    .then(surveys => {
      res.render("surveys/surveys", {
        title: "Surveys",
        active: "surveys",
        surveys
      });
    });
});

app.get("/milestones", (req, res) => {
  knex.select(['milestones.memberid', 'milestonetitle', 'milestonedate', 'memberfirstname', 'memberlastname'])
    .from('milestones')
    .join('members', 'milestones.memberid', '=', 'members.memberid')
    .then(milestones => {
      res.render("milestones/milestones", {
        title: "Milestones",
        active: "milestones",
        milestones: milestones
      });
    });
});

app.get("/milestoneEdit/:id", async (req, res) => {
  const { user } = req.session;

  // Must be logged in at least
  if (!user) return res.redirect("/");

  const milestoneId = req.params.id;

  // Fetch the milestone to see who owns it
  const milestone = await knex("milestones")
    .select("memberid", "milestonetitle", "milestonedate")
    .where("milestoneid", milestoneId)
    .first();

  if (!milestone) {
    return res.status(404).send("Milestone not found");
  }

  // Admins can edit any milestone
  const isAdmin = user.userRole === "admin";

  // Participant can edit *only their own* milestone
  const isOwner =
    user.userRole === "participant" &&
    milestone.memberid === user.userID;

  if (!isAdmin && !isOwner) {
    return res.redirect("/");
  }

  // Render the edit page
  res.render("milestones/milestoneEdit", {
    title: "Edit Milestone",
    active: "milestones",
    milestone
  });
});

app.get("/users", requireRole("admin"), (req, res) => {
  knex.select(['memberid', 'memberfirstname', 'memberlastname', 'memberemail'])
    .from('members')
    .then(users => {
      res.render("users/users", {
        title: "Users",
        active: "users",
        users
      });
    });
});

app.get("/user_profile/:id", requireRole("participant", "admin"), (req, res) => {
  const memberId = req.params.id;

  knex.select('*')
    .from('members')
    .where('members.memberid', memberId)
    .first()
    .then(user => {
      if (!user) return res.status(404).send("User not found");

      knex.select(['milestonetitle', 'milestonedate'])
        .from('milestones')
        .where('milestones.memberid', memberId)
        .then(milestones => {
          res.render("users/user_profile", {
            title: "User Profile",
            active: "users",
            user,
            milestones
          });
        });
    });
});

app.get("/donationform", async (req, res) => {
  const userID = req.session.userID || null;

  res.render("donationform", {
    title: "Make a Donation",
    userID
  });
});

app.post("/donationform", async (req, res) => {
  try {
    const { donorName, donationAmount, memberID } = req.body;

    // Use NULL if guest
    const memberIdValue = memberID || null;

    await knex("donations").insert({
      memberid: memberIdValue,
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
  res.render("admin", {
    title: "Admin Dashboard",
    user: req.session.user
  });
});



// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
