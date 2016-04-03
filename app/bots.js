"use strict";

const SteamBots = require("steambots-node-sdk"),
      config = require("./config"),
      _ = require("lodash"),
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
    return sdk.createWithdrawal(tradeLink, itemIds)
    .then(res => {
      redisClient.del("float");
      return res;
    });
  },

  createDeposit: (tradeLink, assetIds) => {
    return sdk.createDeposit(tradeLink, assetIds)
    .then(res => {
      redisClient.del("float");
      return res;
    });
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
    return Bluebird.all([
      sdk.getTrades({
        user_steam_id: steamId,
        limit: 30,
        sort: "desc"
      }),
      sdk.getTrades({
        user_steam_id: steamId,
        type: "withdrawal",
        state: "cancelled",
        sort: "desc"
      })
    ])
    .then(responses => {
      let trades = [];
      _.each(responses, res => {
        _.each(res.response, trade => {
          if (!_.find(trades, {"id": trade.id})) {
            trades.push(trade);
          }
        });
      });

      trades.sort((a, b) => {
        if (a.state == "cancelled" && a.type == "withdrawal") {
          return -1;
        }
        return b.id - a.id;
      });
      return trades;
    });
  }
};