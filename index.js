const express = require("express");
const session = require("express-session");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Set up EJS as the template engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
  secret: process.env.SESSION_SECRET || 'ella-rises-development-secret-key',
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
  req.session.user = {
    id: 1,
    username: "admin",
    email: "admin@example.com",
    role: "admin"
  };
  // set user in locals for views
  res.locals.user = req.session.user;
  next();
});

// Routes
app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

app.get("/login", (req, res) => {
  res.render("login", { title: "Login" });
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
    participants: [] // placeholder
  });
});

app.get("/events", (req, res) => {
  res.render("events", {
    title: "Events",
    events: [] // placeholder
  });
});

app.get("/donations", (req, res) => {
  // later you can pass real data from the database
  res.render("donations", {
    title: "Donations",
    donations: [], // placeholder
    totalAmount: 0 // placeholder
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
