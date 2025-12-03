const express = require("express");
const session = require("express-session");
const path = require("path");
require("dotenv").config();
const knex = require("knex")({
  client: "pg",
  connection: {
      host : process.env.RDS_HOSTNAME,
      user : process.env.RDS_USERNAME,
      password : process.env.RDS_PASSWORD,
      database : process.env.RDS_DB_NAME,
      port : process.env.RDS_PORT,  // PostgreSQL 16 typically uses port 5432
      // ssl: process.env.DB_SSL ? {rejectUnauthorized: false} : false 
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
  // }
  // set user in locals for views
  res.locals.user = req.session.user;
  next();
});

// Routes
app.get("/", (req, res) => {
  if (req.session.user) {
    // Logged-in version of landing page
    return res.render("landing/index-loggedin", {
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
  res.render("login/login", { title: "Login", active: "login" });
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error logging out");
    }
    res.redirect("/login");
  });
});

app.get("/participants", (req, res) => {
  // later you can pass real data from the database
  res.render("participants", {
    title: "Participants",
    active: "participants",
    participants: [] // placeholder
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

app.get("/user/:id", (req, res) => {
  const userId = req.params.id;

  // Fetch user data and their completed milestones
  // knex.select()
  // .then(([user, milestones]) => {
  //   if (!user) {
  //     return res.status(404).render("error", {
  //       title: "User Not Found",
  //       message: "The requested user could not be found."
  //     });
  //   }

  //   res.render("user-profile", {
  //     title: `${user.firstName} ${user.lastName} · Profile`,
  //     active: "users",
  //     user: user,
  //     milestones: milestones || []
  //   });
  // })
  // .catch((err) => {
  //   console.error("Error fetching user profile:", err);
  //   res.status(500).render("error", {
  //     title: "Server Error",
  //     message: "An error occurred while loading the user profile."
  //   });
  // });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
