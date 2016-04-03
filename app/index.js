"use strict";

const express = require("express"),
    session = require("express-session"),
    swig = require("swig"),
    bodyParser = require("body-parser"),
    config = require("./lib/config"),
    app = express(),
    server = require("http").Server(app);


// configure swig as the express templating engine
app.engine("html", swig.renderFile);
app.set("view engine", "html");
app.set("views", __dirname + "/views");
app.set("view cache", false);
app.use("/static", express.static(__dirname + "/public"));

// enable body parsing
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// enable cookies
app.use(session({ secret: "betting", resave: true, saveUninitialized: true, cookie: { maxAge: 3600000 }}));

// for every request lets make the user session available to the templates
app.use((req, res, next) => { 
  res.locals.user = req.session.user;
  res.locals.flash = req.session.flash;
  next();
});

app.use((req, res, next) => {
  res._render = res.render;
  res.render = function() {
    res._render.apply(res, arguments);
    delete req.session.flash;
  };
  next();
});


// no cache in debug mode
swig.setDefaults({ cache: false });

swig.setFilter("currency", a => { return a.toFixed(2); });
swig.setFilter("round", a => { return Math.round(a); });
swig.setFilter("relativeTime", a => { 
  let reverse = false;
  let timeLeft = a.getTime() - Date.now();
  if (timeLeft < 0) {
    reverse = true;
    timeLeft = Math.abs(timeLeft);
  }
  const secLeft = Math.floor(timeLeft / 1000);
  const minLeft = Math.floor(secLeft / 60);
  const hourLeft = Math.floor(minLeft / 60);
  const dayLeft = Math.floor(hourLeft / 24);

  if (minLeft < 1 && !reverse) {
    return "Any time now";
  } else if (minLeft < 120) {
    return minLeft + " minute" + (minLeft > 1 ? "s" : "") + " " + (reverse ? "ago" : "from now");
  } else if (hourLeft < 24) {
    return hourLeft + " hour" + (hourLeft > 1 ? "s" : "")+ " " + (reverse ? "ago" : "from now");
  } else {
    return dayLeft + " day" + (dayLeft > 1 ? "s" : "") + " " + (reverse ? "ago" : "from now");
  }
});

require("./routes/account")(app);
require("./routes/matches")(app);

server.listen(config.port, () => {
  console.log("Server running on port " + config.port);
});