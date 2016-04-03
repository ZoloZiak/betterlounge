"use strict";

module.exports = {
  "id": "CreateWithdrawal",
  "type": "object",
  "required": ["trade_link", "item_ids"],
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
