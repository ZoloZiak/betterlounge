"use strict";

module.exports = {
  "id": "Bet",
  "type": "object",
  "required": ["team", "bet"],
  "properties": {
    "team": {
      "type": "string"
    },
    "value": {
      "type": "string"
    }
  }
};
