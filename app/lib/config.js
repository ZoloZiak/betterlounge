"use strict";

module.exports = {
  
  baseUrl: "http://14.14.14.14:8000",
  port: 8000,
  debug: false,
  rake: 0,
  
  mysql: {
    host: "localhost",
    user: "root",
    password: "betterlounge",
    database: "betterlounge"
  },

  redis: {
    "host": "localhost",
    "port": 6379
  },

  steambots: {
    key: ""
  }

};