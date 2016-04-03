"use strict";

module.exports = {
  "id": "CreateDeposit",
  "type": "object",
  "required": ["trade_link", "asset_ids"],
  "properties": {
    "trade_link": {
      "type": "string"
    },
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
