"use strict";

const Bluebird = require("bluebird"),
  openid = require("openid"),
  config = require("../lib/config"),
  services = require("../lib/services"),
  _ = require("lodash"),
  Long = require("long");

const db = services.db;
const bots = services.bots;
const validator = services.validator;

function createRelyingParty() {
  return Bluebird.promisifyAll(
    new openid.RelyingParty(config.baseUrl + "/verify", config.baseUrl, true, false, [])
  );
}


/***********************************************************
* Quick function to validate a trade link and ensure it 
* belongs to the supplied steam id
***********************************************************/
function validateTradeLink(steamId, tradeLink) {

  var matches = tradeLink.match(/^https?:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=([0-9]+)&token=([\w\p\-]+)$/i);
  
  if (!matches) {
    return false;
  }
  
  // ensure the accountId matches the steamId
  var accountId  = matches[1];
  if (steamId != new Long(parseInt(accountId, 10), 0x1100001).toString()) {
    return false;
  }

  return true;
}

module.exports = app => {
  
  /***********************************************************
  * When the user logs in we redirect them to the openid url
  ***********************************************************/
  app.get("/login", (req, res) => {
    createRelyingParty(req)
    .authenticateAsync("http://steamcommunity.com/openid", false)
    .then(authUrl =>  {
      res.redirect(authUrl);
    })
    .catch(() => {
      return res.redirect("/");
    });
  });

  /***********************************************************
  * This is called by steam. If everything is fine, we redirect
  * back to the homepage along with a bit of session data
  ***********************************************************/
  app.get("/verify", (req, res) => {

    createRelyingParty(req)
    .verifyAssertionAsync(req)
    .then(result => {
      if (!result.authenticated) {
        return res.redirect("/");
      }
      const IDENTIFIER_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]+)$/;
      const matches = IDENTIFIER_REGEX.exec(result.claimedIdentifier);

      if (matches === null) {
        return res.redirect("/");
      }

      const steamId = matches[1];
      return db.newConnection(conn => {
        return conn.queryAsync(
          "SELECT * FROM `user` where steam_id = ? LIMIT 1",
          [steamId]
        )
        .then(results => {
          if (results.length === 0) {
            const now = new Date();
            return conn.queryAsync(
              "INSERT INTO `user` (steam_id, created_at) VALUES (?, ?)",
              [steamId, now]
            )
            .then(() => {
              return {
                steam_id: steamId,
                created_at: now,
                credit: 0
              };
            });
          }
          return results[0];
        });
      })
      .then(user => {
        req.session.user = user;
        return res.redirect("/");
      });
    });
  });

  /***********************************************************
  * To logout we simply destroy the session and go back to the
  * homepage
  ***********************************************************/
  app.get("/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });

  /***********************************************************
  * Super simple account page. Not much to see here
  ***********************************************************/
  app.get("/account", (req, res) => {

    if (!req.session.user) {
      return res.redirect("/login");
    }
    const steamId = req.session.user.steam_id;

    db.newConnection(conn => {
      return Bluebird.props({
        user: conn.queryAsync(
          "SELECT * from `user` WHERE steam_id = ? LIMIT 1",
          [steamId]
        )
        .then(results => {
          return _.first(results);
        }),
        float: bots.getFloatItems()
      })
      .then(props => {
        if (props.float.status === 200) {
          props.float.response = _.orderBy(props.float.response, ["guide_price"], ["desc"]);
        }
        res.render("account", props);
      });
    });
  });

  /***********************************************************
  * Simple post for updating a users account details (their trade link)
  ***********************************************************/
  app.post("/account", (req, res) => {

    if (!req.session.user) {
      return res.redirect("/login");
    }

    return validator.validate(req.body, "account")
    .then(() => {
      const steamId = req.session.user.steam_id;
      if (!validateTradeLink(steamId, req.body.trade_link)) {
        throw new Error("Please enter a valid trade link for your account");
      }
      return db.newConnection(conn => {
        return conn.queryAsync(
          "UPDATE `user` SET trade_link = ? WHERE steam_id = ?",
          [req.body.trade_link, req.session.user.steam_id]
        )
        .then(() => {
          req.session.user.trade_link = req.body.trade_link;
          req.session.flash = {
            type: "success",
            text: "Details updated"
          };
        });
      });
    })
    .catch(e => {
      req.session.flash = {
        type: "danger",
        message: e.message
      };
    })
    .then(() => {
      return res.redirect("/account");
    });
  });

  app.get("/trades", (req, res) => {
    if (!req.session.user) {
      return res.redirect("/login");
    }
    const steamId = req.session.user.steam_id;
    bots.getUsersTrades(steamId)
    .then(trades => {
      res.render("trades", {trades: trades});
    });
  });


  /***********************************************************
  * When the user requests /deposit lets load their steam
  * inventory, filter out untradable items, then render it all
  ***********************************************************/
  app.get("/deposit", (req, res) => {
    // if the user isnt logged in, send them to login
    if (!req.session.user) {
      return res.redirect("/login");
    }

    // load the users inventory
    bots.loadInventory(req.session.user.steam_id)
    .then(inventory => {
      if (inventory.status === 200) {
        // remove any non-tradable items and items without prices
        inventory.response = _.filter(inventory.response, item => {
          return item.tradable && item.guide_price && item.guide_price < 400;
        });

        // sort them from most valuable to least valuable
        inventory.response = _.orderBy(inventory.response, ["guide_price"], ["desc"]);
      }
      
      res.render("deposit", {
        inventory: inventory
      });
    })
    .catch(e => {
      res.session.flash = {
        type: "danger",
        text: e.message
      };
      res.render("deposit");
    });

  });

  app.get("/bets", (req, res) => {
    if (!req.session.user) {
      return res.redirect("/login");
    }
    res.render("bets");
  });

  /***********************************************************
  * When the user posts to /deposit, compile a list of asset ids
  * then send a request to the bots to create the trade
  ***********************************************************/
  app.post("/deposit", (req, res) => {

    // if they're not logged in, send them to login
    if (!req.session.user) {
      return res.redirect("/login");
    }

    // dirty hack to make sure asset ids are submitted as an array
    if (_.isString(req.body.asset_ids)) {
      req.body.asset_ids = [req.body.asset_ids];
    }

    // validate the request body
    return validator.validate(req.body, "deposit")
    .then(() => {

      //.the html will submit them as strings. lets ensure they're actual numeric strings
      for (let i = 0; i < req.body.asset_ids.length; i++) {
        let assetId = req.body.asset_ids[i];
        if (isNaN(parseFloat(assetId)) || !isFinite(assetId)) {
          throw new Error("Unknown error");
        }
      }

      // make sure the user has a trade link set up
      if (!req.session.user.trade_link) {
        throw new Error("You need to specify a trade link before depositing.");
      }

      // ok we're good to go. submit the request to steambots
      const tradeLink = req.session.user.trade_link;
      return bots.createDeposit(tradeLink, req.body.asset_ids)
      .catch(() => {
        throw new Error("There was an error creating your deposit. Please try again later");
      });
    })
    .then(() => {
      // all good, lets take them to the trades page
      res.redirect("/trades");
    })
    .catch(e => {
      // something went tits up
      req.session.flash = {
        type: "danger",
        text: e.message
      };
      return res.redirect("/deposit");
    });
  });

  /***********************************************************
  * When the user posts to /withdraw from the account page
  * we need to ensure they have enough credit for what they're withdrawing
  * then make the request to steambots, then update the database
  ***********************************************************/
  app.post("/withdraw", (req, res) => {

    // user isnt logged in, send them to login
    if (!req.session.user) {
      return res.redirect("/login");
    }

    // dirty hack to ensure they come in as an array
    if (_.isString(req.body.item_ids)) {
      req.body.item_ids = [req.body.item_ids];
    }

    // validate the request
    return validator.validate(req.body, "withdraw")
    .then(() => {

      // double check they have a trade link
      if (!req.session.user.trade_link) {
        throw new Error("You need to specify a trade link before withdrawing.");
      }

      // make sure all items are numeric
      for (let i = 0; i < req.body.item_ids.length; i++) {
        let itemId = req.body.item_ids[i];
        if (isNaN(parseFloat(itemId)) || !isFinite(itemId)) {
          throw new Error("Unknown error");
        }
      }

      // grab all of the items from the bots that arent part of an outstanding trade
      return bots.getFloatItems();
    })
    .then(inventory => {

      // uh oh, this shouldnt happen
      if (inventory.status !== 200)  {
        throw new Error("There was a problem with your withdrawal.");
      }
      
      // grab the actual item objects for the list of supplied ids
      const items = _.filter(inventory.response, item => {
        return req.body.item_ids.indexOf("" + item.id) > -1;
      });

      // if some items have gone missing another user probably has them, so 
      // lets throw an error
      if (items.length !== req.body.item_ids.length) {
        throw new Error("Not all requested items are still available");
      }

      const tradeLink = req.session.user.trade_link;
      const steamId = req.session.user.steam_id;

      // grab the sum of all the prices (so we can deduct credits)
      const withdrawTotal = _.sumBy(items, "guide_price");

      // ensure they have enough credits
      if (withdrawTotal > req.session.user.credit) {
        throw new Error("You don't have enough credit for that");
      }

      // send a withdrawal request over to steambots
      return bots.createWithdrawal(tradeLink, _.map(items, "id"))
      .then(response => {

        // if everything is peachy, lets deduct the credits from the users profile
        if (response.status === 200) {
          return db.newConnection(conn => {
            return conn.queryAsync(
              "UPDATE `user` SET credit = credit - ? WHERE steam_id = ?",
              [withdrawTotal, steamId]
            );
          })
          .then(() => {
            // finally lets send them to trades so they can see the trade
            res.redirect("/trades");
          });
        }
        // status from steambots was not 200, so something isnt good.
        throw new Error("Unknown error when withdrawing items");
      });
    })
    .catch(e => {
      // aww shit
      req.session.flash = {
        type: "danger",
        text: e.message
      };
      res.redirect("/account");
    });
  });
};