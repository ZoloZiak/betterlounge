"use strict";

module.exports = {
  "id": "CreateWithdrawal",
  "type": "object",
  "required": ["item_ids"],
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
