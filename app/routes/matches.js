"use strict";

const Bluebird = require("bluebird"),
  _ = require("lodash"),
  services = require("../services");

const db = services.db;

const baseSql = `SELECT \`match\`.*, team1.name AS team1_name, team1.logo AS team1_logo,
      IF (state="live", 0-UNIX_TIMESTAMP(start_at), UNIX_TIMESTAMP(start_at)) as o,
      team2.name AS team2_name, team2.logo AS team2_logo,
      (SELECT COALESCE(SUM(value), 0) from bet where match_id = match.id and team = 1) AS team1_value,
      (SELECT COALESCE(SUM(value), 0) from bet where match_id = match.id and team = 2) AS team2_value
      FROM \`match\`
      LEFT JOIN team team1 ON team1.id = \`match\`.team1 LEFT JOIN team team2 ON team2.id = \`match\`.team2 `;

function calculatePercentages(match) {
  if (!match) {
    return null;
  }
  const total = match.team1_value + match.team2_value;
  match.team1_percent = 0;
  match.team2_percent = 0;
  match.team1_ratio = 0;
  match.team2_ratio = 0;
  if (total > 0) {
    match.team1_ratio = match.team2_value > 0 ? match.team1_value / match.team2_value : 0;
    match.team2_ratio = match.team1_value > 0 ? match.team2_value / match.team1_value : 0;
    match.team1_percent = Math.round((match.team1_value / total) * 100);
    match.team2_percent = 100 - match.team1_percent;
  }
  return match;
}

const orderSql = `order by FIELD(state, 'live', 'open', 'finished'), o asc`;

module.exports = function(app) {

  app.get("/", (req, res) => {
    return db.newConnection(conn => {
      return Bluebird.props({
        tournament: conn.queryAsync(baseSql + " WHERE `match`.type = ? " + orderSql, ["tournament"])
        .each(result => {
          calculatePercentages(result);
        })
      })
      .then(categories => {
        res.render("index", categories); 
      });
    });
  });

  app.get("/match/:id", (req, res) => {

    const matchId = req.params.id;
    return db.newConnection(conn => {
      return Bluebird.props({
        match: conn.queryAsync(baseSql + " WHERE `match`.id = ? LIMIT 1", [matchId])
        .then(results => {
          return calculatePercentages(_.first(results));
        }),
        bet: Bluebird.resolve()
        .then(() => {
          if (req.session.user) {
            const steamId = req.session.user.steam_id;
            return conn.queryAsync(
              "SELECT * FROM `bet` WHERE steam_id = ? AND match_id = ?",
              [steamId, matchId]
            )
            .then(results => {
              return _.first(results);
            });
          }
        })
      })
      .then(props => {
        res.render("match", props);
      });
    });
  });

  app.post("/match/:id", (req, res) => {

    if (!req.session.user) {
      return res.redirect("/login");
    }

    const steamId = req.session.user.steam_id;
    const matchId = req.params.id;

    db.newConnection(conn => {
      return conn.queryAsync(
        "SELECT * FROM `match` WHERE id = ? LIMIT 1",
        [matchId]
      )
      .then(matches => {
        return _.first(matches);
      })
      .then(match => {
        if (!match) {
          throw new Error("Unable to find match");
        }
        if (match.state !== "open") {
          throw new Error("Match is not open");
        }


        const sql = `SELECT user.steam_id, user.credit, bet.* FROM user LEFT JOIN bet ON bet.steam_id = user.steam_id AND bet.match_id = ?
               WHERE user.steam_id = ? LIMIT 1`;

        return conn.queryAsync(
          sql,
          [matchId, steamId]
        )
        .then(results => {
          return _.first(results);
        })
        .then(result => {
          // user has already placed a bet
          if (result.match_id) {
            const difference = parseFloat((req.body.bet - result.value).toFixed(2));
            if (difference <= 0) {
              throw new Error("You can't bet lower than previous bet");
            }
            if (difference > result.credit) {
              throw new Error("You don't have enough credits");
            }
            return conn.queryAsync(
              "UPDATE bet SET value = value + ? WHERE steam_id = ? AND match_id = ?",
              [difference, steamId, matchId]
            )
            .then(() => {
              return conn.queryAsync(
                "UPDATE user SET credit = credit - ? where steam_id = ?",
                [difference, steamId]
              );
            })
            .then(() => {
              req.session.user.credit -= difference;
              req.session.flash = {type:"success", text: "Bet updated"};
            });
          } else {
            if (req.body.bet > result.credit) {
              throw new Error("You don't have enough credits");
            }
            return conn.queryAsync(
              "INSERT INTO bet (steam_id, match_id, team, value) values (?, ?, ?, ?)",
              [steamId, matchId, req.body.team, req.body.bet]
            )
            .then(() => {
              return conn.queryAsync(
                "UPDATE user SET credit = credit - ? where steam_id = ?",
                [req.body.bet, steamId]
              );
            })
            .then(() => {
              req.session.user.credit -= req.body.bet;
              req.session.flash = {type:"success", text: "Bet placed"};
            });
          }
        });
      });
    }, true)
    .then(() => {
      res.redirect("/match/" + matchId);
    })
    .catch(e => {
      req.session.flash = {type:"danger", text: e.message};
      res.redirect("/match/" + matchId);
    });
  });
};