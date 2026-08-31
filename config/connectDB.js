// YaarClub DB
// const mysql = require("mysql2/promise");

// const connection = mysql.createPool({
//   host: "72.61.238.64",
//   user: "yarwin",
//   password: "eR7cj35ks4882HJy",
//   database: "yarwin",
// });

// export default connection;

const mysql = require("mysql2/promise");

const connection = mysql.createPool({
  host: "31.97.233.100",
  user: "ExpressClub",
  password: "XERpd8Gy7nKRfdcs",
  database: "expressclub",
});

export default connection;
