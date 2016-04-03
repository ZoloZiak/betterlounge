"use strict";

const Validator = require("jsonschema").Validator;

module.exports = {
  validate: function(data, schemaFile) {
    const v = new Validator();
    const schema = require("./schemas/" + schemaFile);
    const results = v.validate(data, schema);
    if (results.errors.length) {
      console.log(results.errors);
      return Promise.reject(new Error("Invalid request"));
    }
    return Promise.resolve();
  }
};
