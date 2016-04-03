"use strict";

const SteamBots = require("steambots-node-sdk"),
      config = require("./config"),
      Bluebird = require("bluebird"),
      sdk = new SteamBots(config.steambots.key),
      redis = require("redis");

Bluebird.promisifyAll(redis);

const redisClient = redis.createClient(config.redis.port, config.redis.host);

module.exports = { 
  loadInventory: steamId => {
    return sdk.loadInventory(steamId);
  },

  createWithdrawal: (tradeLink, itemIds) => {
    redisClient.del("float"); // clear the float cache
    return sdk.createWithdrawal(tradeLink, itemIds);
  },

  createDeposit: (tradeLink, assetIds) => {
    return sdk.createDeposit(tradeLink, assetIds);
  },

  getFloatItems: () => {
    // get float items from the cache if we can. if not, grab 'em and cache 'em
    return redisClient.getAsync("float")
    .then(result => {
      if (result) {
        return JSON.parse(result);
      }
      return sdk.getItems({
        state: "deposited"
      })
      .then(response => {
        redisClient.setex("float", 300, JSON.stringify(response));
        return response;
      });
    });
  },

  getUsersTrades: steamId => {
    return sdk.getTrades({
      user_steam_id: steamId,
      limit: 20
    });
  }
};