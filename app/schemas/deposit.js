"use strict";

module.exports = {
  "id": "CreateDeposit",
  "type": "object",
  "required": ["asset_ids"],
  "properties": {
    "asset_ids": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": {
        "type": "string"
      }
    }
  }
};
