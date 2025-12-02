const express = require("express");
const session = require("express-session");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.RDS_PORT;

// Set up EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
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
  res.render("index", { title: "Home", active: "home" });
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Login", active: "login" });
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
  res.render("events", {
    title: "Events",
    active: "events",
    events: [] // placeholder
  });
});

app.get("/donations", (req, res) => {
  // later you can pass real data from the database
  res.render("donations", {
    title: "Donations",
    active: "donations",
    donations: [], // placeholder
    totalAmount: 0 // placeholder
  });
});

app.get("/surveys", (req, res) => {
  // later you can pass real data from the database
  res.render("surveys", {
    title: "Surveys",
    active: "surveys",
    surveys: [] // placeholder
  });
});

app.get("/milestones", (req, res) => {
  // later you can pass real data from the database
  res.render("milestones", {
    title: "Milestones",
    active: "milestones",
    milestones: [] // placeholder
  });
});

app.get("/users", (req, res) => {
  // later you can pass real data from the database
  res.render("users", {
    title: "Users",
    active: "users",
    users: [] // placeholder
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
