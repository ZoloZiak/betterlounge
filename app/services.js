"use strict";

const Bluebird = require("bluebird"),
  mysql = require("mysql"),
  config = require("./config");

Bluebird.promisifyAll(require("mysql/lib/Connection").prototype);
Bluebird.promisifyAll(require("mysql/lib/Pool").prototype);

const pool = mysql.createPool(config.mysql);

module.exports = {
  bots: require("./bots"),
  db: {
    newConnection: (queries, transaction, retries) => {
      retries = retries || 0;
      return new Bluebird((resolve, reject) => {
        pool.getConnection((err, con) => {
          
          if (err) {
            return reject(err);
          }
          
          if (transaction) {
            return con.beginTransactionAsync()
            .then(() => {
              return queries(con);
            })
            .then(() => {
              return con.commitAsync();
            })
            .then(results => {
              con.release();
              resolve(results);
            })
            .catch(e => {
              return con.rollbackAsync()
              .then(() => {
                con.release();
                reject(e);
              });
            });
          }

          return queries(con)
          .catch(e => {
            console.error(e);
          })
          .then(results => {
            con.release();
            resolve(results);
          });
        });
      });
    }
  }
};