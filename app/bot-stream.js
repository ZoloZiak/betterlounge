"use strict";

const services = require("./lib/services"),
      config = require("./lib/config"),
      SteamBots = require("steambots-node-sdk"),
      Bluebird = require("bluebird"),
      _ = require("lodash"),
      redis = require("redis"),
      sdk = new SteamBots(config.steambots.key);

Bluebird.promisifyAll(redis);

const redisClient = redis.createClient(config.redis.port, config.redis.host);

const db = services.db;


/************************************************************
* If we get a trade event packet from steambots and it's a 
* completed deposit, lets give the user their credits
*************************************************************/
sdk.on("data", event => {
  switch(event.type) {
    case "trades":
      redisClient.setAsync("eventid", event.id)
      .then(() => {
        const trade = event.data;
        if (trade.type === "deposit" && trade.state === "complete") {
          const steamId = trade.user_steam_id;
          const tradeValue = _.sumBy(trade.items, "guide_price");
          redisClient.del("float");
          return db.newConnection(conn => {
            return conn.queryAsync(
              "UPDATE `user` SET credit = credit + ? WHERE steam_id = ?",
              [tradeValue, steamId]
            );
          });
        }
      });
      break;
  }
});

redisClient.getAsync("eventid")
.then(eventId => {
  eventId = eventId || 0;
  console.log("Resuming http stream from id " + eventId);
  sdk.openStream(eventId);
});


