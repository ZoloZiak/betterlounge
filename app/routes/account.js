"use strict";

const Bluebird = require("bluebird"),
  openid = require("openid"),
  config = require("../config"),
  services = require("../services"),
  _ = require("lodash"),
  Long = require("long");

const db = services.db;
const bots = services.bots;

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

      var IDENTIFIER_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]+)$/;
      var matches = IDENTIFIER_REGEX.exec(result.claimedIdentifier);

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
          // if you're interested, you can grab additional steam data here
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

  app.post("/account", (req, res) => {

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const steamId = req.session.user.steam_id;

    if (req.body.trade_link) {

      if (!validateTradeLink(steamId, req.body.trade_link)) {
        req.session.flash = {
          type: "danger",
          text: "Please enter a valid trade link for your current account"
        };
        return res.redirect("/account");
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
          return res.redirect("/account");
        });
      });
    }
    res.redirect("/account");
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
    
    if (!req.session.user) {
      return res.redirect("/login");
    }

    bots.loadInventory(req.session.user.steam_id)
    .then(inventory => {

      if (inventory.status === 200) {

        // remove any non-tradable items and items without prices
        inventory.response = _.filter(inventory.response, item => {
          return item.tradable && item.guide_price && item.guide_price < 400;
        });

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

    if (!req.session.user) {
      return res.redirect("/login");
    }
    
    if (!req.session.user.trade_link) {
      res.session.flash = {
        type: "danger",
        text: "You need to specify a trade link before depositing."
      };
      return res.render("deposit");
    }

    if (!req.body.asset_ids || req.body.asset_ids.length === 0) {
      res.session.flash = {
        type: "danger",
        text: "No items selected"
      };
      return res.render("deposit");
    }

    const tradeLink = req.session.user.trade_link;

    return bots.createDeposit(tradeLink, req.body.asset_ids)
    .then(() => {
      res.redirect("/trades");
    })
    .catch(() => {
      res.session.flash = {
        type: "danger",
        text: "There was an error creating your deposit. Please try again later"
      };
      res.render("deposit");
    });

  });

  app.post("/withdraw", (req, res) => {
    
    if (!req.session.user) {
      return res.redirect("/login");
    }

    return Bluebird.resolve()
    .then(() => {
      if (!req.session.user.trade_link) {
        throw new Error("You need to specify a trade link before withdrawing.");
      }

      if (!_.isArray(req.body.item_ids) || req.body.item_ids.length === 0) {
        throw new Error("Unknown error");
      }

      return bots.getFloatItems();
    })
    .then(inventory => {

      if (inventory.status !== 200)  {
        throw new Error("There was a problem with your withdrawal.");
      }
      
      const items = _.filter(inventory.response, item => {
        return req.body.item_ids.indexOf(item.id) > -1;
      });

      if (items.length !== req.body.item_ids.length) {
        throw new Error("Not all requested items are still available");
      }

      const tradeLink = req.session.user.trade_link;
      const steamId = req.session.user.steam_id;
      const withdrawTotal = _.sum(items, "guide_price");

      if (withdrawTotal > req.session.user.credit) {
        throw new Error("You don't have enough credit for that");
      }

      return bots.createWithdrawal(tradeLink, req.body.item_ids)
      .then(response => {
        if (response.status === 200) {
          return db.newConnection(conn => {
            return conn.queryAsync(
              "UPDATE `user` SET credit = credit - ? WHERE steam_id = ?",
              [withdrawTotal, steamId]
            );
          })
          .then(() => {
            res.redirect("/trades");
          });
        }
        throw new Error("Unknown error when withdrawing items");
      });
    })
    .catch(e => {
      req.session.flash = {
        type: "danger",
        text: e.message
      };
      res.redirect("/account");
    });
  });
};