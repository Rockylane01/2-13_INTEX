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

    req.session.user = { email };

    res.redirect("/");
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// Sign up
app.get("/signUp", (req, res) => {
  res.render("login/signUp", {title: "Sign Up"});
});

app.post("/signUp", async (req, res) => {
  try {
    let { email, password } = req.body;

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
        error_message: "An account with this email already exists." 
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

    // Inserting new user info into the database
    await knex("credentials").insert(newUser);

    // 6️⃣ Auto-login the user OR redirect to login page
    req.session.user = { email };   // logs them in automatically

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

app.get("/events", (req, res) => {
  knex.select(['eventid', 'eventtemplates.eventname', 'eventdatetimestart', 'eventlocation'])
    .from('events')
    .join('eventtemplates', 'events.templateid', '=', 'eventtemplates.templateid')
    .then(events => {
      res.render('events/events', {
        title: "Events",
        active: "events",
        events: events
      })
    });
});

app.get("/eventView/:id", (req, res) => {
  const eventId = req.params.id;

  // Get event details with template info
  knex.select(
    'events.*',
    'eventtemplates.eventname',
    'eventtemplates.eventtype',
    'eventtemplates.eventdescription',
    'eventtemplates.eventrecurrencepattern'
  )
    .from('events')
    .join('eventtemplates', 'events.templateid', '=', 'eventtemplates.templateid')
    .where('events.eventid', eventId)
    .first()
    .then(event => {
      if (!event) {
        return res.status(404).send("Event not found");
      }

      // Get participant count and details
      knex.select(
        'members.memberid',
        'members.memberfirstname',
        'members.memberlastname',
        'members.memberemail',
        'registration.registrationstatus',
        'registration.registrationcheckintime'
      )
        .from('participantevent')
        .join('members', 'participantevent.memberid', '=', 'members.memberid')
        .join('registration', 'participantevent.peid', '=', 'registration.peid')
        .where('participantevent.eventid', eventId)
        .then(participants => {
          const eventWithCount = {
            ...event,
            registeredcount: participants.length,
            participants: participants
          };

          res.render("events/eventView", {
            title: "Event Details",
            active: "events",
            event: eventWithCount,
            participants: participants
          });
        });
    })
    .catch(err => {
      console.error("Error fetching event:", err);
      res.status(500).send("Server error");
    });
});

// Render event creation form
app.get("/eventAdd", (req, res) => {
  res.render('events/eventAdd', {
    title: "Edit Event",
    active: "events"
  });
});

app.post("/deleteEvent/:id", (req, res) => {
    knex("events").where("eventid", req.params.id).del().then(events => {
        res.redirect("/events");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
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
          totalAmount: totalAmount
        });

      });
    })


});

app.get("/donationView/:id", (req, res) => {
  const donationId = req.params.id;

  // Get donation details with member info
  knex.select(
    'donations.*',
    'members.memberfirstname',
    'members.memberlastname',
    'members.memberemail',
    'members.memberphone',
    'members.membercity',
    'members.memberstate',
    'members.memberrole'
  )
    .from('donations')
    .join('members', 'donations.memberid', '=', 'members.memberid')
    .where('donations.donationid', donationId)
    .first()
    .then(donation => {
      if (!donation) {
        return res.status(404).send("Donation not found");
      }

      const memberId = donation.memberid;

      if (!memberId) {
        console.error('No memberId found for donation:', donationId);
        return res.status(500).send("Invalid donation data - no member ID");
      }

      console.log('Fetching donor summary for memberId:', memberId);

      // Get all donations for this member first
      knex('donations')
        .where('memberid', memberId)
        .then(allDonations => {
          console.log('All donations for member:', allDonations);

          // Calculate summary manually
          const totalDonations = allDonations.length;
          const totalAmount = allDonations.reduce((sum, d) => sum + parseFloat(d.donationamount || 0), 0);
          const averageDonation = totalDonations > 0 ? totalAmount / totalDonations : 0;

          const dates = allDonations.map(d => new Date(d.donationdate)).filter(d => !isNaN(d));
          const firstDonation = dates.length > 0 ? new Date(Math.min(...dates)) : null;
          const lastDonation = dates.length > 0 ? new Date(Math.max(...dates)) : null;

          const donorSummary = {
            totalDonations,
            totalAmount,
            averageDonation,
            firstDonation,
            lastDonation
          };

          console.log('Calculated donor summary:', donorSummary);

          // Filter out the current donation from other donations
          const otherDonations = allDonations
            .filter(d => d.donationid !== parseInt(donationId))
            .sort((a, b) => new Date(b.donationdate) - new Date(a.donationdate));

          res.render("donations/donationView", {
            title: "Donation Details",
            active: "donations",
            donation: donation,
            donorSummary: donorSummary,
            otherDonations: otherDonations
          });
        });
    })
    .catch(err => {
      console.error("Error fetching donation:", err);
      res.status(500).send("Server error");
    });
});

app.post("/deleteDonation/:id", (req, res) => {
    knex("donations").where("donationid", req.params.id).del().then(donations => {
        res.redirect("/donations");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});

app.get("/surveys", (req, res) => {
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
        surveys: surveys
      });
    });
});

app.get("/surveyView/:id", (req, res) => {
  const peid = req.params.id;

  knex.select(
    'surveys.*',
    'members.memberfirstname',
    'members.memberlastname',
    'members.memberemail',
    'eventtemplates.eventname',
    'events.eventdatetimestart',
    'npsbucketlookup.surveynpsbucket'
  )
    .from('surveys')
    .join('participantevent', 'surveys.peid', '=', 'participantevent.peid')
    .join('members', 'participantevent.memberid', '=', 'members.memberid')
    .join('events', 'participantevent.eventid', '=', 'events.eventid')
    .join('eventtemplates', 'events.templateid', '=', 'eventtemplates.templateid')
    .leftJoin('npsbucketlookup', 'surveys.surveyrecommendationscore', '=', 'npsbucketlookup.surveyrecommendationscore')
    .where('surveys.peid', peid)
    .first()
    .then(survey => {
      if (!survey) {
        return res.status(404).send("Survey not found");
      }

      res.render("surveys/surveyView", {
        title: "Survey Response",
        active: "surveys",
        survey: survey
      });
    })
    .catch(err => {
      console.error("Error fetching survey:", err);
      res.status(500).send("Server error");
    });
});

app.post("/deleteSurvey/:id", (req, res) => {
    knex("surveys").where("peid", req.params.id).del().then(sruveys => {
        res.redirect("/surveys");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
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

app.post("/deleteMilestone/:id/:title", (req, res) => {
    knex("milestones").where({memberid: req.params.id, milestonetitle: title}).del().then(milestones => {
        res.redirect("/milestones");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});

app.get("/users", (req, res) => {
  knex.select(['memberid', 'memberfirstname', 'memberlastname', 'memberemail'])
  .from('members')
  .then(users => {
    res.render("users/users", {
      title: "Users",
      active: "users",
      users: users
    });
  });
});

app.post("/deleteUser/:id", (req, res) => {
    knex("members").where("memberid", req.params.id).del().then(members => {
        res.redirect("/users");
    }).catch(err => {
        console.log(err);
        res.status(500).json({err});
    })
});

app.get("/user_profile/:id", (req, res) => {
  const memberId = req.params.id;

  // Fetch user data and their completed milestones
  knex.select('*')
    .from('members')
    .where('members.memberid', memberId)
    .first()
    .then(user => {
      if (!user) {
        return res.status(404).send("User not found");
      }

      // Fetch milestones for this user
      knex.select(['milestonetitle', 'milestonedate'])
        .from('milestones')
        .where('milestones.memberid', memberId)
        .then(milestones => {
          res.render("users/user_profile", {
            title: "User Profile",
            active: "users",
            user: user,
            milestones: milestones
          });
        });
    });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
