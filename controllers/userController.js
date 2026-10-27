import crypto from "crypto";
import fs from "fs";
import md5 from "md5";
import path from "path";
import QRCode from "qrcode";
import querystring from "querystring";
import request from "request";
import util from "util";
import connection from "../config/connectDB";
const moment = require("moment-timezone");
const axios = require("axios");

// ======================================================================
// HELPERS
// ======================================================================

function md5Sign2(params, key) {
  const sortedKeys = Object.keys(params).sort();
  const signStr =
    sortedKeys
      .filter(
        (k) =>
          params[k] !== undefined && params[k] !== null && params[k] !== "",
      )
      .map((k) => `${k}=${params[k]}`)
      .join("&") + `&key=${key}`;
  return crypto.createHash("md5").update(signStr).digest("hex").toUpperCase();
}

function sunpaySign(params, secret) {
  const s = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "signType" && k !== "sign_type")
    .filter(
      (k) => params[k] !== undefined && params[k] !== null && params[k] !== "",
    )
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("md5").update(`${s}&key=${secret}`).digest("hex");
}

const logsDirectory = path.join(path.resolve(), "logs");
if (!fs.existsSync(logsDirectory)) {
  fs.mkdirSync(logsDirectory);
}
const logFilePath = path.join(logsDirectory, "performance_log.txt");
const writeLog = util.promisify(fs.appendFile);

let timeNow = Date.now();

const randomNumber = (min, max) => {
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
};

function timerJoin2(params = "", addHours = 0) {
  let date = params ? new Date(Number(params)) : new Date();
  if (addHours !== 0) {
    date.setHours(date.getHours() + addHours);
  }
  const options = {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };
  const formatter = new Intl.DateTimeFormat("en-GB", options);
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find((part) => part.type === type).value;
  const formattedDate = `${getPart("year")}-${getPart("month")}-${getPart(
    "day",
  )} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
  return formattedDate;
}

function formateT(params) {
  let result = params < 10 ? "0" + params : params;
  return result;
}

function timerJoin(params = "", addHours = 0) {
  let date = "";
  if (params) {
    date = new Date(Number(params));
  } else {
    date = new Date();
  }
  date.setHours(date.getHours() + addHours);
  let years = formateT(date.getFullYear());
  let months = formateT(date.getMonth() + 1);
  let days = formateT(date.getDate());
  let hours = date.getHours() % 12;
  hours = hours === 0 ? 12 : hours;
  let ampm = date.getHours() < 12 ? "AM" : "PM";
  let minutes = formateT(date.getMinutes());
  let seconds = formateT(date.getSeconds());
  return (
    years +
    "-" +
    months +
    "-" +
    days +
    " " +
    hours +
    ":" +
    minutes +
    ":" +
    seconds +
    " " +
    ampm
  );
}

function timerJoin4(params = "", addHours = 0) {
  let date = "";
  if (params) {
    date = new Date(Number(params));
  } else {
    date = new Date();
  }
  date.setHours(date.getHours() + addHours);
  let years = formateT(date.getFullYear());
  let months = formateT(date.getMonth() + 1);
  let days = formateT(date.getDate());
  return years + "-" + months + "-" + days;
}

const generateQRCode = async (data) => {
  try {
    let qrCodeDataURL = await QRCode.toDataURL(data);
    return qrCodeDataURL;
  } catch (err) {
    console.error("Error generating QR code:", err);
  }
};

function generateOrderId() {
  const prefix = "WD";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart =
    Math.floor(Math.random() * (99999999999999 - 10000000000000 + 1)) +
    10000000000000;
  const suffix = String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return `${prefix}${date}${randomPart}${suffix}`;
}

const getRechargeOrderId = () => {
  const date = new Date();
  let id_time =
    date.getUTCFullYear() +
    "" +
    (date.getUTCMonth() + 1) +
    "" +
    date.getUTCDate();
  let id_order =
    Math.floor(Math.random() * (99999999999999 - 10000000000000 + 1)) +
    10000000000000;
  return id_time + id_order;
};

async function makePostRequest(url, data) {
  try {
    const response = await axios.post(url, querystring.stringify(data), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return response.data;
  } catch (error) {
    console.error(
      "TrexoPay API request failed:",
      error.response?.data || error.message,
    );
    throw {
      message: error.message,
      status: error.response?.status || 500,
      trexopayError: error.response?.data || null,
    };
  }
}

async function logUserAction({
  user_phone,
  action_type,
  action_id,
  money,
  status,
  ip_address,
  user_agent,
  info,
}) {
  try {
    await connection.execute(
      `INSERT INTO user_action_log (user_phone, action_type, action_id, money, status, ip_address, user_agent, info)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_phone,
        action_type,
        action_id,
        money,
        status,
        ip_address,
        user_agent,
        info,
      ],
    );
  } catch (err) {
    console.error("Log user action error:", err.message);
  }
}

// ======================================================================
// SHARED: ATOMIC + IDEMPOTENT CREDIT
// ======================================================================
async function finalizeRecharge(orderId, planFn) {
  const [rows] = await connection.query(
    "SELECT * FROM recharge WHERE id_order = ?",
    [orderId],
  );
  if (!rows.length) return { result: "notfound" };
  const rec = rows[0];
  if (rec.status === 1) return { result: "already" };

  const [first] = await connection.query(
    "SELECT id FROM recharge WHERE phone = ? AND status = 1 LIMIT 1",
    [rec.phone],
  );
  const isFirst = first.length === 0;

  // Atomic claim: only ONE concurrent callback can win
  const [claim] = await connection.query(
    "UPDATE recharge SET status = 1 WHERE id_order = ? AND status = 0",
    [orderId],
  );
  if (claim.affectedRows === 0) return { result: "already" };

  const money = Number(rec.money);
  const checkTime = timerJoin2(Date.now());
  const plan = await planFn(rec, isFirst, money);

  const hist =
    "INSERT INTO transaction_history SET phone = ?, detail = ?, balance = ?, `time` = ?";

  // principal
  await connection.query(
    "UPDATE users SET money = money + ?, total_money = total_money + ?, recharge = recharge + ?, totalRecharge = totalRecharge + ? WHERE phone = ?",
    [money, money, money, money, rec.phone],
  );
  await connection.query(hist, [rec.phone, "Deposit", money, checkTime]);

  // bonus to depositor
  if (plan.bonus > 0) {
    await connection.query(
      "UPDATE users SET money = money + ?, total_money = total_money + ? WHERE phone = ?",
      [plan.bonus, plan.bonus, rec.phone],
    );
    await connection.query(hist, [
      rec.phone,
      isFirst ? "First deposit bonus" : "Deposit bonus",
      plan.bonus,
      checkTime,
    ]);
  }

  // bonus to referrer
  if (plan.refAmount > 0) {
    const [me] = await connection.query(
      "SELECT invite FROM users WHERE phone = ?",
      [rec.phone],
    );
    const code = me[0]?.invite;
    if (code) {
      const [ref] = await connection.query(
        "SELECT phone FROM users WHERE code = ? LIMIT 1",
        [code],
      );
      if (ref[0]?.phone) {
        await connection.query(
          "UPDATE users SET money = money + ?, total_money = total_money + ? WHERE phone = ?",
          [plan.refAmount, plan.refAmount, ref[0].phone],
        );
        await connection.query(hist, [
          ref[0].phone,
          plan.refLabel || "Bonus",
          plan.refAmount,
          checkTime,
        ]);
      }
    }
  }

  // optional extra (spins etc.)
  if (plan.after) await plan.after(rec);

  return { result: "credited", rec };
}

function tierBonus(m) {
  if (m == 300) return 48;
  if (m == 500) return 108;
  if (m == 1000) return 188;
  if (m == 5000) return 288;
  if (m == 10000) return 488;
  if (m == 50000) return 5000;
  if (m == 100000) return 12000;
  return m * 0.03;
}

// ======================================================================
// USER CONTROLLERS
// ======================================================================

const userInfo = async (req, res) => {
  const startTime = Date.now();
  try {
    const timeNow = new Date();
    const auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Token undefined",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [users] = await connection.execute(
      "SELECT * FROM users WHERE `token` = ?",
      [auth],
    );
    if (!users.length) {
      return res.status(200).json({
        message: "Invalid token",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [settings] = await connection.query(
      "SELECT `telegram`, `cskh` FROM admin",
    );
    const telegram = settings.length ? settings[0].telegram : "";
    const {
      code,
      id_user,
      name_user,
      money,
      userPhoto,
      vip_level,
      rank,
      rebate,
      level,
      isdemo,
      recharge,
      totalRecharge,
      totalWithdraw,
      message,
      email,
    } = users[0];
    const phone = users[0].phone;
    const origin = req.protocol + "://" + req.get("host");
    const qrs = await generateQRCode(`${origin}/#/register?r_code=${code}`);
    const response = res.status(200).json({
      message: "User Details Successful",
      status: true,
      money: parseFloat(money),
      data: {
        code,
        id_user,
        name_user,
        phone_user: phone,
        money_user: parseFloat(money),
        userPhoto,
        rebate,
        isdemo,
        rank,
        level,
        vip_level,
        recharge,
        telegram,
        totalRecharge,
        totalWithdraw,
        betAmount: 0,
        message,
        email,
        qrs,
      },
    });
    return response;
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
      status: false,
    });
  }
};

const addutr = async (req, res) => {
  let utr = req.body.utr;
  let id = req.body.id;
  const sql = `UPDATE recharge SET utr=? WHERE id=?`;
  await connection.execute(sql, [utr, id]);
  let transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
  let mailOptions = {
    from: process.env.MAIL_USER,
    to: "adarshpushpendra@gmail.com",
    subject: "Test Email",
    text: "This is a test email sent from Node.js using nodemailer.",
  };
  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    }
  });
  return res.status(200).json({
    message: "Recharge Successfully!",
    status: true,
    timeStamp: timeNow,
  });
};

const verifyCode = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let now = new Date().getTime();
    let timeEnd = +new Date() + 1000 * (60 * 2 + 0) + 500;
    let otp = randomNumber(100000, 999999);
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!rows.length) {
      return res.status(200).json({
        message: "Account does not exist",
        status: false,
        timeStamp: timeNow,
      });
    }
    let user = rows[0];
    if (user.time_otp - now <= 0) {
      request(
        `http://47.243.168.18:9090/sms/batch/v2?appkey=${process.env.SMS_APPKEY}&appsecret=${process.env.SMS_APPSECRET}&phone=84${user.phone}&msg=Your verification code is ${otp}&extend=${now}`,
        async (error, response, body) => {
          let data = JSON.parse(body);
          if (data.code == "00000") {
            await connection.execute(
              "UPDATE users SET otp = ?, time_otp = ? WHERE phone = ? ",
              [otp, timeEnd, user.phone],
            );
            return res.status(200).json({
              message: "Submitted successfully",
              status: true,
              timeStamp: timeNow,
              timeEnd: timeEnd,
            });
          }
        },
      );
    } else {
      return res.status(200).json({
        message: "Send SMS regularly.",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const aviator = async (req, res) => {
  let auth = req.cookies.auth;
  res.redirect(
    `https://avi.bdg-club.com/theninja/src/api/userapi.php?action=loginandregisterbyauth&token=${auth}`,
  );
};

const changeUser = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let name = req.body.name;
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!rows || !name)
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    await connection.query(
      "UPDATE users SET name_user = ? WHERE `token` = ? ",
      [name, auth],
    );
    return res.status(200).json({
      message: "Username modification successful",
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const changeUserPhoto = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let photo = req.body.photo;
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!rows || !photo)
      return res.status(200).json({
        message: "Invalid photo",
        status: false,
        timeStamp: timeNow,
      });
    await connection.query(
      "UPDATE users SET userPhoto = ? WHERE `token` = ? ",
      [photo, auth],
    );
    return res.status(200).json({
      message: "User profile modification successful",
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const changePassword = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let password = req.body.password;
    let newPassWord = req.body.newPassWord;
    let cPassWord = req.body.cPassWord;
    if (!password || !newPassWord)
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? AND `password` = ? ",
      [auth, md5(password)],
    );
    if (rows.length == 0)
      return res.status(200).json({
        message: "Incorrect password",
        status: false,
        timeStamp: timeNow,
      });
    if (newPassWord !== cPassWord) {
      return res.status(200).json({
        message: "Incorrect confirm password ",
        status: false,
      });
    }
    await connection.query(
      "UPDATE users SET otp = ?, password = ?, plain_password = ? WHERE `token` = ? ",
      [randomNumber(100000, 999999), md5(newPassWord), newPassWord, auth],
    );
    return res.status(200).json({
      message: "Password modification successful",
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const checkInHandling = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let data = req.body.data;
    if (!auth)
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    const [attendencs_bonus] = await connection.query(
      "SELECT * FROM `attendencs-bonus`",
    );
    let attendencsDta = attendencs_bonus[0];
    if (!rows)
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    if (!data) {
      const [point_list] = await connection.query(
        "SELECT * FROM point_list WHERE `phone` = ? ",
        [rows[0].phone],
      );
      const [historys] = await connection.query(
        "SELECT * FROM attendance_history WHERE `phone` = ? ",
        [rows[0].phone],
      );
      return res.status(200).json({
        messages: "No More Data",
        datas: point_list[0],
        data: historys,
        status: true,
        timeStamp: timeNow,
      });
    }
    const [point_listss] = await connection.query(
      "SELECT * FROM point_list WHERE `phone` = ? ",
      [rows[0].phone],
    );
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const formattedDate = `${year}-${month}-${day}`;

    if (data && formattedDate !== point_listss[0].today) {
      // Loop over day 1..7 to avoid 7x duplicated code
      for (let d = 1; d <= 7; d++) {
        if (data != d) continue;
        const [point_lists] = await connection.query(
          "SELECT * FROM point_list WHERE `phone` = ? ",
          [rows[0].phone],
        );
        const [recharge] = await connection.query(
          "SELECT SUM(money) AS totalMoney FROM recharge WHERE `phone` = ? AND status=1 AND DATE(today) = ?",
          [rows[0].phone, formattedDate],
        );
        let check = Number(recharge[0].totalMoney) || 0;
        let point_list = point_lists[0];
        let get = Number(attendencsDta[`day${d}rech`]);
        let totalKey = `total${d}`;
        if (check >= get && point_list[totalKey] != 0) {
          await connection.query(
            "UPDATE users SET money = money + ? WHERE phone = ? ",
            [point_list[totalKey], rows[0].phone],
          );
          await connection.query(
            `UPDATE point_list SET ${totalKey} = ?, today = ? WHERE phone = ? `,
            [0, formattedDate, rows[0].phone],
          );
          await connection.query(
            "INSERT INTO attendance_history SET phone = ?,amount=?,status=?,date=? ",
            [rows[0].phone, point_list[totalKey], 1, formattedDate],
          );
          const datasql =
            "INSERT INTO transaction_history SET phone = ?, detail = ?, balance = ?, `time` = ?";
          await connection.query(datasql, [
            rows[0].phone,
            "Attendance bonus",
            point_list[totalKey],
            formattedDate,
          ]);
          return res.status(200).json({
            message: `You just received ₹ ${point_list[totalKey]}.00`,
            status: true,
            timeStamp: timeNow,
          });
        } else if (check < get && point_list[totalKey] != 0) {
          return res.status(200).json({
            message: `Please Recharge ₹ ${attendencsDta[`day${d}rech`]} to claim gift.`,
            status: false,
            timeStamp: timeNow,
          });
        } else if (point_list[totalKey] == 0) {
          return res.status(200).json({
            message: "You have already received this gift",
            status: false,
            timeStamp: timeNow,
          });
        }
      }
    } else {
      return res.status(200).json({
        message: "You have already received this gift",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const rebateCreate = async (req, res) => {
  const { amount } = req.body;
  let auth = req.cookies.auth;
  try {
    if (amount <= 0)
      return res.status(200).json({
        message: "Amount is not",
        status: false,
        timeStamp: timeNow,
      });
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!rows)
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    const sumdate = timerJoin2(Date.now());
    await connection.query(
      "INSERT INTO rebate SET phone = ?,amount=?,rate=?,commission=?,type=?, status=?,today=? ",
      [
        rows[0].phone,
        amount,
        parseFloat(rows[0].rebetRet) / 100,
        (amount * parseFloat(rows[0].rebetRet)) / 100,
        "Slotes",
        1,
        sumdate,
      ],
    );
    await connection.execute(
      "UPDATE `users` SET `money` = `money` + ?,`rebate`=`rebate`-? WHERE `token` = ? ",
      [(amount * parseFloat(rows[0].rebetRet)) / 100, amount, auth],
    );
    return res.status(200).json({
      message: `You just received successful`,
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    return res.status(500).json({
      message: `internal server error`,
      status: false,
      timeStamp: timeNow,
    });
  }
};

const getRebate = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!rows)
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    const data = await connection.query(
      "SELECT * FROM rebate WHERE phone = ?",
      [rows[0].phone],
    );
    return res.status(200).json({
      message: `You just received successful`,
      status: true,
      data: data[0],
    });
  } catch (error) {
    return res.status(500).json({
      message: `internal server error`,
      status: false,
      timeStamp: timeNow,
    });
  }
};

const promotion = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite`, `roses_f`, `roses_f1`, `roses_today` FROM users WHERE `token` = ? ",
      [auth],
    );
    const [level] = await connection.query("SELECT * FROM level");
    if (!user) {
      return res.status(200).json({
        message: "Invalid user",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    const [f1s] = await connection.query(
      "SELECT `phone`, `code`,`invite`, `time` FROM users WHERE `invite` = ? ",
      [userInfo.code],
    );
    let f1_today = 0;
    for (let i = 0; i < f1s.length; i++) {
      const f1_time = f1s[i].time;
      let check = timerJoin(f1_time) == timerJoin() ? true : false;
      if (check) f1_today += 1;
    }
    let f_all_today = 0;
    for (let i = 0; i < f1s.length; i++) {
      const f1_code = f1s[i].code;
      const f1_time = f1s[i].time;
      let check_f1 = timerJoin(f1_time) == timerJoin() ? true : false;
      if (check_f1) f_all_today += 1;
      const [f2s] = await connection.query(
        "SELECT `phone`, `code`,`invite`, `time` FROM users WHERE `invite` = ? ",
        [f1_code],
      );
      for (let i = 0; i < f2s.length; i++) {
        const f2_code = f2s[i].code;
        const f2_time = f2s[i].time;
        let check_f2 = timerJoin(f2_time) == timerJoin() ? true : false;
        if (check_f2) f_all_today += 1;
        const [f3s] = await connection.query(
          "SELECT `phone`, `code`,`invite`, `time` FROM users WHERE `invite` = ? ",
          [f2_code],
        );
        for (let i = 0; i < f3s.length; i++) {
          const f3_code = f3s[i].code;
          const f3_time = f3s[i].time;
          let check_f3 = timerJoin(f3_time) == timerJoin() ? true : false;
          if (check_f3) f_all_today += 1;
          const [f4s] = await connection.query(
            "SELECT `phone`, `code`,`invite`, `time` FROM users WHERE `invite` = ? ",
            [f3_code],
          );
          for (let i = 0; i < f4s.length; i++) {
            const f4_code = f4s[i].code;
            const f4_time = f4s[i].time;
            let check_f4 = timerJoin(f4_time) == timerJoin() ? true : false;
            if (check_f4) f_all_today += 1;
          }
        }
      }
    }
    let f2 = 0;
    for (let i = 0; i < f1s.length; i++) {
      const f1_code = f1s[i].code;
      const [f2s] = await connection.query(
        "SELECT `phone`, `code`,`invite` FROM users WHERE `invite` = ? ",
        [f1_code],
      );
      f2 += f2s.length;
    }
    let f3 = 0;
    for (let i = 0; i < f1s.length; i++) {
      const f1_code = f1s[i].code;
      const [f2s] = await connection.query(
        "SELECT `phone`, `code`,`invite` FROM users WHERE `invite` = ? ",
        [f1_code],
      );
      for (let i = 0; i < f2s.length; i++) {
        const f2_code = f2s[i].code;
        const [f3s] = await connection.query(
          "SELECT `phone`, `code`,`invite` FROM users WHERE `invite` = ? ",
          [f2_code],
        );
        if (f3s.length > 0) f3 += f3s.length;
      }
    }
    let f4 = 0;
    for (let i = 0; i < f1s.length; i++) {
      const f1_code = f1s[i].code;
      const [f2s] = await connection.query(
        "SELECT `phone`, `code`,`invite` FROM users WHERE `invite` = ? ",
        [f1_code],
      );
      for (let i = 0; i < f2s.length; i++) {
        const f2_code = f2s[i].code;
        const [f3s] = await connection.query(
          "SELECT `phone`, `code`,`invite` FROM users WHERE `invite` = ? ",
          [f2_code],
        );
        for (let i = 0; i < f3s.length; i++) {
          const f3_code = f3s[i].code;
          const [f4s] = await connection.query(
            "SELECT `phone`, `code`,`invite` FROM users WHERE `invite` = ? ",
            [f3_code],
          );
          if (f4s.length > 0) f4 += f4s.length;
        }
      }
    }
    let selectedData = [];
    let level2to6activeuser = 0;
    let currentDate = new Date();
    const previousDate = new Date(currentDate);
    previousDate.setDate(currentDate.getDate() - 1);
    currentDate = previousDate.toISOString().slice(0, 10);

    async function fetchInvitesByCode(code, depth = 1) {
      if (depth > 10) return;
      const [inviteData] = await connection.query(
        "SELECT `id_user`,`name_user`,`phone`, `code`, `invite`, `rank`, `user_level`, `total_money` FROM users WHERE `invite` = ?",
        [code],
      );
      const [level2to6activeuser_today] = await connection.query(
        "SELECT `phone`, `code`, `invite`, `time` FROM users WHERE `invite` = ? AND DATE(`today`) = ?",
        [code, currentDate],
      );
      if (level2to6activeuser_today.length > 0) {
        level2to6activeuser += level2to6activeuser_today.length;
      }
      if (inviteData.length > 0) {
        for (const invite of inviteData) {
          selectedData.push(invite);
          await fetchInvitesByCode(invite.code, depth + 1);
        }
      }
    }
    const [level1_today_rows] = await connection.query(
      "SELECT `phone`, `code`, `invite`, `time` FROM users WHERE `invite` = ?",
      [userInfo.code],
    );
    const [level1_today_rows_today] = await connection.query(
      "SELECT `phone`, `code`, `invite`, `time` FROM users WHERE `invite` = ? AND DATE(`today`) = ?",
      [userInfo.code, currentDate],
    );
    let totalDepositCount = 0;
    let totalDepositAmount = 0;
    let firstDepositCount = 0;
    for (const user of level1_today_rows) {
      await fetchInvitesByCode(user.code);
      const [deposits] = await connection.query(
        "SELECT `id`, `id_order`, `transaction_id`, `utr`, `phone`, `money`, `type`, `status`, `today`, `url`, `time` FROM `recharge` WHERE `phone` = ? AND DATE(`today`) = ? AND `status` = 1",
        [user.phone, currentDate],
      );
      totalDepositCount += deposits.length;
      deposits.forEach((deposit) => {
        totalDepositAmount += parseFloat(deposit.money);
      });
      if (deposits.length > 0) firstDepositCount++;
    }
    const level2_to_level6_today_rows = selectedData;
    let level2_to_level6totalDepositCount = 0;
    let level2_to_level6totalDepositAmount = 0;
    let level2_to_level6firstDepositCount = 0;
    let level2_to_level6count = 0;
    for (const user of level2_to_level6_today_rows) {
      const [deposits] = await connection.query(
        "SELECT `id`, `id_order`, `transaction_id`, `utr`, `phone`, `money`, `type`, `status`, `today`, `url`, `time` FROM `recharge` WHERE `phone` = ? AND DATE(`today`) = ? AND `status` = 1",
        [user.phone, currentDate],
      );
      level2_to_level6count++;
      deposits.forEach((deposit) => {
        level2_to_level6totalDepositAmount += parseFloat(deposit.money);
      });
      if (deposits.length > 0) level2_to_level6firstDepositCount++;
      level2_to_level6totalDepositCount += deposits.length;
    }

    async function countLevelOneUsers(code) {
      const [inviteData] = await connection.query(
        "SELECT COUNT(*) AS count FROM users WHERE `invite` = ?",
        [code],
      );
      return inviteData[0].count;
    }
    async function countDownlineUsers(code, end = 10, visited = new Set()) {
      return countDownline(code, 1, end, visited);
    }
    async function countDownline(code, depth, end, visited) {
      if (depth > end || visited.has(code)) return 0;
      visited.add(code);
      let totalUsers = 1;
      const [inviteData] = await connection.query(
        "SELECT DISTINCT `code` FROM users WHERE `invite` = ?",
        [code],
      );
      if (inviteData.length > 0) {
        for (const invite of inviteData) {
          totalUsers += await countDownline(
            invite.code,
            depth + 1,
            end,
            visited,
          );
        }
      }
      return totalUsers;
    }
    const level1Count = await countLevelOneUsers(userInfo.code);
    const downlineCount = await countDownlineUsers(userInfo.code);
    const total_today_count = level2_to_level6count + level1_today_rows.length;
    const rosesF1 = parseFloat(userInfo.roses_f);
    const rosesAll = parseFloat(userInfo.roses_f1);
    let rosesAdd = rosesF1 + rosesAll;
    return res.status(200).json({
      message: "Receive success",
      info: user,
      level1Count: level1Count,
      status: true,
      total_today_count: total_today_count,
      level1_count: level1_today_rows_today.length,
      level1_today_rows: level1_today_rows,
      totalDepositCount: totalDepositCount,
      currentDate: currentDate,
      totalDepositAmount: totalDepositAmount,
      firstDepositCount: firstDepositCount,
      level2_to_level6count: level2to6activeuser,
      level2_to_level6totalDepositCount: level2_to_level6totalDepositCount,
      level2_to_level6totalDepositAmount: level2_to_level6totalDepositAmount,
      level2_to_level6firstDepositCount: level2_to_level6firstDepositCount,
      total_downline_count: downlineCount - 1,
      invite: {
        f1: f1s.length,
        total_f: selectedData.length,
        f1_today: f1_today,
        f_all_today: f_all_today,
        roses_f1: userInfo.roses_f1,
        roses_f: userInfo.roses_f,
        roses_all: rosesAdd,
        roses_today: userInfo.roses_today,
      },
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("An error occurred:", error);
    return res.status(200).json({
      message: error.message,
      status: false,
      timeStamp: timeNow,
    });
  }
};

const transactionHistory = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone` FROM users WHERE `token` = ? ",
      [auth],
    );
    const limit = parseInt(req.query.limit) || 300;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;
    const data = await connection.query(
      "SELECT * FROM transaction_history WHERE phone = ? ORDER BY id DESC LIMIT ? OFFSET ?",
      [user[0].phone, limit, offset],
    );
    await connection.query(
      "DELETE FROM `transaction` WHERE `phone` = ? AND `today` <  DATE_SUB(NOW(), INTERVAL 1 MONTH)",
      [user[0].phone],
    );
    const sevenDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await connection.query(
      "DELETE FROM `roses` WHERE `phone` = ? AND time < ?",
      [user[0].phone, sevenDaysAgo],
    );
    return res.status(200).send({
      success: true,
      message: "Get transaction history successfully",
      data: data[0],
      page: page,
      limit: limit,
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Server error" });
  }
};

const totalCommission = async (req, res) => {
  let auth = req.cookies.auth;
  if (!auth) {
    return res.status(200).json({
      message: "Failed",
      status: false,
      timeStamp: timeNow,
    });
  }
  try {
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite`, `roses_f`, `roses_f1`, `roses_today` FROM users WHERE `token` = ? ",
      [auth],
    );
    const today = new Date();
    const formattedToday = today.toISOString().split("T")[0];
    const [totalCommissionBeforeToday] = await connection.execute(
      `SELECT SUM(commission) AS total FROM subordinatedata 
   WHERE phone = ? 
   AND type = "bet commission" 
   AND DATE(date) < ?`,
      [user[0].phone, formattedToday],
    );
    const totalBalance = totalCommissionBeforeToday[0]?.total || 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const formattedDate = yesterday.toISOString().split("T")[0];
    const [datas] = await connection.execute(
      `SELECT commission FROM subordinatedata WHERE phone = ? AND DATE(date) = ? AND type = "bet commission"`,
      [user[0].phone, formattedDate],
    );
    const yesterdayBalance = datas.reduce((sum, record) => {
      return sum + parseFloat(record.commission);
    }, 0);
    const sevenDaysBeforeYesterday = new Date();
    sevenDaysBeforeYesterday.setDate(sevenDaysBeforeYesterday.getDate() - 7);
    const formattedSevenDaysAgo = sevenDaysBeforeYesterday
      .toISOString()
      .split("T")[0];
    const [weeks] = await connection.execute(
      `SELECT commission FROM subordinatedata 
   WHERE phone = ? 
   AND DATE(date) BETWEEN ? AND ? 
   AND type = "bet commission"`,
      [user[0].phone, formattedSevenDaysAgo, formattedDate],
    );
    const weekBalance = weeks.reduce((sum, record) => {
      const balance = parseFloat(record.commission);
      return sum + (isNaN(balance) ? 0 : balance);
    }, 0);
    return res.status(200).send({
      success: true,
      message: "Transaction commissions retrieved successfully",
      totalBalance,
      yesterdayBalance,
      weekBalance,
    });
  } catch (error) {
    return res.status(500).send({ success: false, message: "Server error" });
  }
};

const myTeam = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    const [level] = await connection.query("SELECT * FROM level");
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    return res.status(200).json({
      message: "Receive success",
      level: level,
      info: user,
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const listMyTeam = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    const [f1] = await connection.query(
      "SELECT `id_user`, `phone`, `code`, `invite`,`roses_f`, `rank`, `name_user`,`status`,`total_money`, `time` FROM users WHERE `invite` = ? ORDER BY id DESC",
      [userInfo.code],
    );
    const [mem] = await connection.query(
      "SELECT `id_user`, `phone`, `time` FROM users WHERE `invite` = ? ORDER BY id DESC LIMIT 100",
      [userInfo.code],
    );
    const [total_roses] = await connection.query(
      "SELECT `f1`,`invite`, `code`,`phone`,`time` FROM roses WHERE `invite` = ? ORDER BY id DESC LIMIT 100",
      [userInfo.code],
    );
    const selectedData = [];
    async function fetchUserDataByCode(code, depth = 1) {
      if (depth > 6) return;
      const [userData] = await connection.query(
        "SELECT `id_user`, `name_user`, `phone`, `code`, `invite`, `rank`, `total_money` FROM users WHERE `invite` = ?",
        [code],
      );
      if (userData.length > 0) {
        for (const user of userData) {
          const [turnoverData] = await connection.query(
            "SELECT `phone`, `daily_turn_over`, `total_turn_over` FROM turn_over WHERE `phone` = ?",
            [user.phone],
          );
          const [inviteCountData] = await connection.query(
            "SELECT COUNT(*) as invite_count FROM users WHERE `invite` = ?",
            [user.code],
          );
          const inviteCount = inviteCountData[0].invite_count;
          const userObject = {
            ...user,
            invite_count: inviteCount,
            user_level: depth,
            daily_turn_over: turnoverData[0]?.daily_turn_over || 0,
            total_turn_over: turnoverData[0]?.total_turn_over || 0,
          };
          selectedData.push(userObject);
          await fetchUserDataByCode(user.code, depth + 1);
        }
      }
    }
    await fetchUserDataByCode(userInfo.code);
    let newMem = [];
    mem.map((data) => {
      let objectMem = {
        id_user: data.id_user,
        phone:
          "91" + data.phone.slice(0, 1) + "****" + String(data.phone.slice(-4)),
        time: data.time,
      };
      return newMem.push(objectMem);
    });
    return res.status(200).json({
      message: "Receive success",
      f1: selectedData,
      f1_direct: f1,
      mem: newMem,
      total_roses: total_roses,
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const wowpay = async (req, res) => {
  // placeholder — original was empty
};

// ======================================================================
// RECHARGE (manual UPI)
// ======================================================================
const recharge = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let money = req.body.amount;
    let type = req.body.type;
    let utr = req.body.utr;
    if (type != "cancel" && type != "submit" && type != "submitauto") {
      if (!auth || !money || money <= 299) {
        return res.status(200).json({
          message: "Minimum recharge 300",
          status: false,
          timeStamp: timeNow,
        });
      }
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite`,`isdemo` FROM users WHERE `token` = ?",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    if (userInfo.isdemo == 1) {
      let time = timerJoin2(Date.now());
      const date = new Date();
      let checkTime = timerJoin2(Date.now());
      let id_time =
        date.getUTCFullYear() +
        "" +
        date.getUTCMonth() +
        1 +
        "" +
        date.getUTCDate();
      let id_order =
        Math.floor(Math.random() * (99999999999999 - 10000000000000 + 1)) +
        10000000000000;
      money = Number(money);
      let client_transaction_id = id_time + id_order;
      const sql = `INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, isdemo=?`;
      await connection.execute(sql, [
        client_transaction_id,
        "0",
        userInfo.phone,
        money,
        type,
        1,
        checkTime,
        "1",
        time,
        1,
      ]);
      await connection.execute(
        "UPDATE users SET money = money + ? WHERE phone = ? ",
        [money, userInfo.phone],
      );
      return res.status(200).json({
        message: "Demo Amount is added",
        status: false,
        timeStamp: timeNow,
      });
    }
    if (type == "bank") {
      return res.status(200).json({
        message: "Order creation successful",
        pay: true,
        phone: userInfo.phone,
        orderid: client_transaction_id,
        status: true,
        timeStamp: timeNow,
      });
    }
    if (type == "submit") {
      const [utrcount] = await connection.query(
        "SELECT * FROM recharge WHERE utr = ? ",
        [utr],
      );
      if (utrcount.length == 0) {
        await connection.query(
          "UPDATE recharge SET utr = ?, userStatus=1 WHERE phone = ? AND id_order = ? AND status = ? ",
          [utr, userInfo.phone, typeid, 0],
        );
        return res.status(200).json({
          message: "Submit successful",
          status: true,
          timeStamp: timeNow,
        });
      } else {
        return res.status(200).json({
          message: "UTR already submitted",
          status: true,
          timeStamp: timeNow,
        });
      }
    }
    let time = timerJoin2(Date.now());
    const date = new Date();
    let checkTime = timerJoin2(Date.now());
    let id_time =
      date.getUTCFullYear() +
      "" +
      date.getUTCMonth() +
      1 +
      "" +
      date.getUTCDate();
    let id_order =
      Math.floor(Math.random() * (99999999999999 - 10000000000000 + 1)) +
      10000000000000;
    money = Number(money);
    let client_transaction_id = id_time + id_order;
    const sql = `INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, userStatus=?`;
    await connection.execute(sql, [
      client_transaction_id,
      "0",
      userInfo.phone,
      money,
      type,
      0,
      checkTime,
      "0",
      time,
      0,
    ]);
    return res.status(200).json({
      message: "Order creation successful",
      pay: true,
      orderid: client_transaction_id,
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

// ======================================================================
// FIXED CALLBACKS
// ======================================================================

// 1) ZILPAY
const zilpayCallback = async (req, res) => {
  console.log("CB HIT zilpay", req.method, req.body, req.query);
  try {
    const body = { ...req.query, ...req.body };
    const merchanttransid = body.merchanttransid;
    const status = String(body.status || "").toLowerCase();
    if (!merchanttransid) return res.status(400).send("bad request");
    if (status !== "success") return res.send("ignored");
    const out = await finalizeRecharge(
      merchanttransid,
      async (rec, isFirst, money) => {
        let bonus = 0;
        if (isFirst) {
          const [tiers] = await connection.execute(
            "SELECT * FROM rechargeBonus ORDER BY id DESC",
          );
          for (let i = 0; i < tiers.length; i++) {
            const el = tiers[i];
            const cur = parseFloat(el.recAmount);
            const next = tiers[i + 1]
              ? parseFloat(tiers[i + 1].recAmount)
              : Infinity;
            if (
              parseInt(el.is_fisrtrecharge) === 1 &&
              money >= cur &&
              money < next
            ) {
              bonus =
                parseInt(el.is_persent) === 1
                  ? (money * parseFloat(el.bonus)) / 100
                  : parseFloat(el.bonus);
              break;
            }
          }
        }
        return {
          bonus,
          refAmount: isFirst ? bonus : 0,
          refLabel: "Bonus",
          after: async (r) => {
            const [spin] = await connection.query(
              "SELECT task_amount, num_of_spin FROM spin_data ORDER BY task_amount ASC LIMIT 1",
            );
            if (spin.length && money >= spin[0].task_amount) {
              const totalSpins =
                Math.floor(money / spin[0].task_amount) * spin[0].num_of_spin;
              if (totalSpins > 0) {
                await connection.query(
                  "UPDATE users SET total_spin = total_spin + ?, spin_recharge = spin_recharge + ? WHERE phone = ?",
                  [totalSpins, money, r.phone],
                );
              }
            }
          },
        };
      },
    );
    if (out.result === "notfound") return res.status(404).send("not found");
    return res.send("success");
  } catch (e) {
    console.error("zilpayCallback error:", e);
    return res.status(500).send("error");
  }
};

// 2) SUNPAY / watchglbpay
const callbackdata = async (req, res) => {
  console.log("CB HIT sunpay", req.method, req.body, req.query);
  try {
    const body = { ...req.query, ...req.body };
    const { mchOrderNo, tradeResult, sign } = body;
    if (!mchOrderNo) return res.status(400).send("bad request");
    const expected = sunpaySign(body, process.env.SUNPAY_SECRET);
    if (!sign || String(sign).toLowerCase() !== expected.toLowerCase()) {
      console.warn("sunpay: bad signature", mchOrderNo);
      return res.status(403).send("invalid sign");
    }
    if (String(tradeResult) !== "1") return res.send("success");
    const out = await finalizeRecharge(
      mchOrderNo,
      async (rec, isFirst, money) => ({
        bonus: tierBonus(money),
        refAmount: isFirst ? 18 : 0,
        refLabel: "Active member",
      }),
    );
    if (out.result === "notfound") return res.send("success");
    return res.send("success");
  } catch (e) {
    console.error("callbackdata error:", e);
    return res.status(500).send("error");
  }
};

// 3) TREXOPAY
async function trexoCheckOrder(orderId) {
  const r = await axios.post(
    "https://merchant.trexopayment.com/api/check-order-status",
    new URLSearchParams({
      user_token: process.env.TREXO_USER_TOKEN,
      order_id: orderId,
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  return r.data;
}

const verifyTrexoPayPayment = async (req, res) => {
  console.log("CB HIT trexo", req.method, req.body, req.query);
  try {
    const data = { ...req.query, ...req.body };
    const order_id = data.order_id;
    if (!order_id)
      return res
        .status(400)
        .json({ status: false, message: "order_id missing" });
    const chk = await trexoCheckOrder(order_id);
    const paid =
      chk?.status === true &&
      String(
        chk?.result?.txnStatus || chk?.result?.status || "",
      ).toUpperCase() === "SUCCESS";
    if (!paid)
      return res.json({ status: false, message: "payment not successful" });
    const out = await finalizeRecharge(
      order_id,
      async (rec, isFirst, money) => ({
        bonus: money > 99 && money <= 1000 ? money * 0.05 : money * 0.1,
        refAmount: isFirst ? 10 : money * 0.02,
        refLabel: "Bonus",
      }),
    );
    if (out.result === "notfound")
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    return res.json("success");
  } catch (e) {
    console.error("verifyTrexoPayPayment error:", e);
    return res.status(500).json({ status: false, message: e.message });
  }
};

// 4) PPAY
const callbackdatappay = async (req, res) => {
  console.log("CB HIT ppay", req.method, req.body, req.query);
  try {
    const { payOrderId, mchOrderNo } = { ...req.query, ...req.body };
    if (!payOrderId || !mchOrderNo)
      return res.status(400).send("bad request");
    const params = {
      mchNo: process.env.PPAY_MCH_NO,
      appId: process.env.PPAY_APP_ID,
      payOrderId,
      mchOrderNo,
    };
    params.sign = md5Sign2(params, process.env.PPAY_KEY);
    const r = await axios.post(
      "https://pay.ppaypros.com/api/pay/query",
      params,
      { headers: { "Content-Type": "application/json" } },
    );
    const state = r?.data?.data?.state;
    if (r?.data?.code !== 0 || Number(state) !== 2) {
      return res.send("success");
    }
    await finalizeRecharge(mchOrderNo, async (rec, isFirst, money) => ({
      bonus: tierBonus(money),
      refAmount: isFirst ? 18 : 0,
      refLabel: "Active member",
    }));
    return res.send("success");
  } catch (e) {
    console.error("callbackdatappay error:", e.response?.data || e.message);
    return res.status(500).send("error");
  }
};

// ======================================================================
// OLD CALLBACK (kept for compat, bank callback)
// ======================================================================
const handleCallback = async (req, res) => {
  const { order_id, status } = req.body;
  if (!order_id || !status) {
    return res.status(200).json({
      message: "Failed",
      status: false,
      timeStamp: timeNow,
    });
  }
  try {
    if (status == "success") {
      const out = await finalizeRecharge(order_id, async (rec, isFirst, money) => {
        const bonus = 0;
        return { bonus, refAmount: isFirst ? money * 0.2 : 0, refLabel: "Bonus" };
      });
      if (out.result === "notfound") {
        return res.status(404).json({ message: "Recharge not found", status: false });
      }
      return res.status(200).json({
        message: "Application confirmed successfully",
        status: true,
      });
    } else {
      return res.status(400).json({ message: "Invalid type", status: false });
    }
  } catch (e) {
    return res.status(500).json({
      message: "Internal server error",
      status: false,
      error: e.message,
    });
  }
};

// ======================================================================
// ONLINE RECHARGE (QuikPay) — FIXED https://
// ======================================================================
const onlineRecharge = async (req, res) => {
  try {
    const token = req.cookies.auth;
    const money = Number(req.body.amount);
    const type = req.body.type;
    if (!token || !money || money <= 299) {
      return res.status(200).json({
        message: "Minimum recharge 300",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [users] = await connection.query(
      "SELECT `phone`, `code`,`invite`,`isdemo` FROM users WHERE `token` = ?",
      [token],
    );
    let userInfo = users[0];
    if (!users) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let checkTime = timerJoin2(Date.now());
    let time = timerJoin2(Date.now());
    if (userInfo.isdemo == 1) {
      const date = new Date();
      let id_time =
        date.getUTCFullYear() +
        "" +
        date.getUTCMonth() +
        1 +
        "" +
        date.getUTCDate();
      let id_order =
        Math.floor(Math.random() * (99999999999999 - 10000000000000 + 1)) +
        10000000000000;
      money = Number(money);
      let client_transaction_id = id_time + id_order;
      const sql = `INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, isdemo=?`;
      await connection.execute(sql, [
        client_transaction_id,
        "0",
        userInfo.phone,
        money,
        "demo",
        1,
        checkTime,
        "1",
        time,
        1,
      ]);
      await connection.execute(
        "UPDATE users SET money = money + ? WHERE phone = ? ",
        [money, userInfo.phone],
      );
      return res.status(200).json({
        message: "Demo Amount is added",
        status: false,
        timeStamp: timeNow,
      });
    }
    const domain = req.headers.host;
    const [rows] = await connection.execute(
      "SELECT key_id FROM recharge_chennal",
    );
    let channelKey = rows[0].key_id;
    console.log(domain);
    const postData = {
      amount: money,
      user: userInfo.phone,
      auth: channelKey,
      callback: `https://${domain}/api/webapi/bhatclub_callback`,
      redirect_url: `https://${domain}/wallet/rechargerecord`,
    };
    const response = await axios.post(
      "https://api.quikpay.live/api/payin2",
      postData,
      { headers: { "Content-Type": "application/json" } },
    );
    const cleanResponse = response.data.substring(
      response.data.indexOf("{"),
    );
    const jsonResponse = JSON.parse(cleanResponse);
    const decodedUrl = jsonResponse.url.replace(/\\/g, "");
    const data = jsonResponse;
    if (data.status == "success") {
      const { url, order_id } = data;
      await connection.execute(
        "INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, userStatus = ?",
        [
          order_id,
          "0",
          userInfo.phone,
          money,
          type,
          0,
          checkTime,
          url,
          time,
          0,
        ],
      );
      return res.status(200).json({
        success: true,
        message: "Recharge initiated successfully",
        data: jsonResponse,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: data.message || "Failed to initiate recharge",
      });
    }
  } catch (error) {
    console.error("Error in recharge controller:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

const cancelRecharge = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Authorization is required to access this API!",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`name_user`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!user) {
      return res.status(200).json({
        message: "Authorization is required to access this API!",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    const result = await connection.query(
      "DELETE FROM recharge WHERE phone = ? AND status = ?",
      [userInfo.phone, 0],
    );
    if (result.affectedRows > 0) {
      return res.status(200).json({
        message: "All the pending recharges has been deleted successfully!",
        status: true,
        timeStamp: timeNow,
      });
    } else {
      return res.status(200).json({
        message:
          "There was no pending recharges for this user or delete operation has been failed!",
        status: true,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("API error: ", error);
    return res.status(500).json({
      message: "API Request failed!",
      status: false,
      timeStamp: timeNow,
    });
  }
};

const addBank = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let name_bank = req.body.name_bank;
    let name_user = req.body.name_user;
    let stk = req.body.stk;
    let email = req.body.ifsc;
    let sdt = req.body.sdt;
    let tinh = req.body.tinh;
    let chi_nhanh = req.body.usdt;
    let time = timerJoin2(Date.now());
    if (!auth || !name_bank || !name_user || !stk || !tinh) {
      return res.status(200).json({
        message: "Please enter all field",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Invalid user",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user_bank] = await connection.query(
      "SELECT * FROM user_bank WHERE tinh = ? ",
      [tinh],
    );
    const [user_bank2] = await connection.query(
      "SELECT * FROM user_bank WHERE phone = ? ",
      [userInfo.phone],
    );
    if (tinh != userInfo.phone) {
      return res.status(200).json({
        message: "Invalid phone number",
        status: false,
      });
    }
    if (user_bank2[0]?.stk >= 5) {
      return res.status(200).json({
        message: "Bank Already updated",
        status: false,
      });
    }
    if (user_bank.length == 0 && user_bank2.length == 0) {
      const sql = `INSERT INTO user_bank SET phone = ?, name_bank = ?, name_user = ?, stk = ?, email = ?, sdt = ?, tinh = ?, chi_nhanh=?, time = ?`;
      await connection.execute(sql, [
        userInfo.phone,
        name_bank,
        name_user,
        stk,
        email,
        "0",
        tinh,
        "0",
        time,
      ]);
      return res.status(200).json({
        message: "Successfully added bank",
        status: true,
        timeStamp: timeNow,
      });
    } else if (user_bank2.length > 0) {
      await connection.query(
        "UPDATE user_bank SET name_bank = ?, name_user = ?, stk = ?, email = ?, sdt = ?, tinh = ?,chi_nhanh=?, time = ? WHERE phone = ?",
        [
          name_bank,
          name_user,
          stk,
          email,
          "0",
          tinh,
          "0",
          time,
          userInfo.phone,
        ],
      );
      return res.status(200).json({
        message: "your account is updated",
        status: true,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const addUSDT = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let remarkType = req.body.remarkType;
    let sdt = req.body.sdt;
    let time = timerJoin2(Date.now());
    if (!auth || !sdt || !remarkType) {
      return res.status(200).json({
        message: "Please enter all field",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Invalid user",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user_bank2] = await connection.query(
      "SELECT * FROM user_bank WHERE phone = ? ",
      [userInfo.phone],
    );
    if (sdt.length == 0 && user_bank2.length == 0) {
      const sql = `INSERT INTO user_bank SET phone = ?, name_bank = ?, name_user = ?, stk = ?, email = ?, sdt = ?, tinh = ?, chi_nhanh=?, remarkType=?, time = ?`;
      await connection.execute(sql, [
        userInfo.phone,
        "0",
        "0",
        "0",
        "0",
        sdt,
        "0",
        "0",
        remarkType,
        time,
      ]);
      return res.status(200).json({
        message: "Successfully added bank",
        status: true,
        timeStamp: timeNow,
      });
    } else if (user_bank2.length > 0) {
      await connection.query(
        "UPDATE user_bank SET sdt = ?,remarkType=? WHERE phone = ?",
        [sdt, remarkType, userInfo.phone],
      );
      return res.status(200).json({
        message: "your account is updated",
        status: true,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const infoUserBank = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite`, `money` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let date = new Date().getTime();
    let checkTime = timerJoin(date);
    const [recharge] = await connection.query(
      "SELECT * FROM recharge WHERE phone = ? AND status = 1",
      [userInfo.phone],
    );
    const [minutes_1] = await connection.query(
      "SELECT * FROM minutes_1 WHERE phone = ?",
      [userInfo.phone],
    );
    let total = 0;
    recharge.forEach((data) => {
      total += parseFloat(data.money);
    });
    let total2 = 0;
    minutes_1.forEach((data) => {
      total2 += parseFloat(data.money);
    });
    let fee = 0;
    minutes_1.forEach((data) => {
      fee += parseFloat(data.fee);
    });
    let result = 0;
    if (total - total2 > 0) result = total - total2 - fee;
    const [userBank] = await connection.query(
      "SELECT * FROM user_bank WHERE phone = ? ",
      [userInfo.phone],
    );
    return res.status(200).json({
      message: "Received successfully",
      datas: userBank,
      userInfo: user,
      result: result,
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const withdrawal3 = async (req, res) => {
  const ip =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress || "";
  const agent = req.headers["user-agent"] || "";
  let user_phone = null;
  let action_id = "1234567890";
  let action_status = "fail";
  let info = "";
  let money = req.body.money || null;
  try {
    let auth = req.cookies.auth;
    let type = req.body.type;
    let password = req.body.password;
    let timeNow = Date.now();
    if (type === "USDT" && money < 850) {
      info = JSON.stringify({ reason: "usdt_below_min" });
      return res.status(200).json({
        message: "withdraw amount $10 to $500",
        status: false,
        timeStamp: timeNow,
      });
    }
    if (!auth || !money || money < 109) {
      info = JSON.stringify({ reason: "below_minimum" });
      return res.status(200).json({
        message: "Minimum amount 110",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? AND password = ?",
      [auth, md5(password)],
    );
    if (type === "BANK CARD" && money > 50000) {
      user_phone = user[0]?.phone || null;
      info = JSON.stringify({ reason: "bankcard_above_max" });
      return res.status(200).json({
        message: "withdraw amount 110 to 50000",
        status: false,
        timeStamp: timeNow,
      });
    }
    if (user.length == 0) {
      info = JSON.stringify({ reason: "invalid_user" });
      return res.status(200).json({
        message: "Invalid user",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    user_phone = userInfo.phone;
    if (userInfo.enableWithdraw === 0) {
      info = JSON.stringify({ reason: "enableWithdraw_blocked" });
      return res.status(200).json({
        message:
          "Withdrawals are currently disabled. Please contact customer support.",
        status: false,
      });
    }
    const date = new Date();
    let id_time =
      date.getUTCFullYear() +
      "" +
      (date.getUTCMonth() + 1) +
      "" +
      date.getUTCDate();
    let id_order = generateOrderId();
    let dates = timerJoin2(Date.now());
    let checkTime = timerJoin2(Date.now());
    let checkTime4 = timerJoin4(Date.now());
    const [recharge] = await connection.query(
      "SELECT * FROM recharge WHERE phone = ? AND status = 1",
      [userInfo.phone],
    );
    const [minutes_1] = await connection.query(
      "SELECT * FROM minutes_1 WHERE phone = ?",
      [userInfo.phone],
    );
    let total = 0;
    recharge.forEach((data) => {
      total += parseFloat(data.money);
    });
    let total2 = 0;
    minutes_1.forEach((data) => {
      total2 += parseFloat(data.money);
    });
    let result = 0;
    if (total - total2 > 0) result = total - total2;
    result = Math.max(result, 0);
    const [user_bank] = await connection.query(
      "SELECT * FROM user_bank WHERE `phone` = ?",
      [userInfo.phone],
    );
    let needbet = userInfo.recharge;
    const [withdraw] = await connection.query(
      "SELECT * FROM withdraw WHERE `phone` = ? AND DATE(today)=?",
      [userInfo.phone, checkTime4],
    );
    const [rowss] = await connection.query(
      "SELECT SUM(money) AS total_recharge FROM recharge WHERE phone = ? AND status = 1",
      [userInfo.phone],
    );
    if (!rowss[0].total_recharge || rowss[0].total_recharge < 200) {
      const info = JSON.stringify({ reason: "insufficient_recharge" });
      return res.status(200).json({
        message: "Need at least ₹200 recharge",
        status: false,
      });
    }
    if (userInfo.isdemo == 1) {
      const sql = `INSERT INTO withdraw SET id_order = ?, phone = ?, money = ?, stk = ?, sdt = ?, type=?, usdt=?, name_bank = ?, ifsc = ?, name_user = ?, status = ?, today = ?, time = ?, isdemo=?`;
      await connection.execute(sql, [
        action_id,
        userInfo.phone,
        money,
        "demo",
        "demo",
        "demo",
        "demo",
        "demo",
        "demo",
        "demo",
        "1",
        checkTime,
        dates,
        1,
      ]);
      await connection.execute(
        "UPDATE users SET money = money - ? WHERE phone = ? ",
        [money, userInfo.phone],
      );
      action_status = "success";
      info = JSON.stringify({ type: "demo" });
      return res.status(200).json({
        message: "Withdrawal successful",
        status: true,
        money: userInfo.money - money,
        timeStamp: timeNow,
      });
    }
    if (user_bank.length != 0) {
      if (withdraw.length < 3) {
        if (userInfo.money - money >= 0) {
          if (needbet == 0) {
            let infoBank = user_bank[0];
            const sql = `INSERT INTO withdraw SET id_order = ?, phone = ?, money = ?, stk = ?, sdt = ?, type=?, usdt=?, name_bank = ?, ifsc = ?, name_user = ?, status = ?, today = ?, time = ?`;
            await connection.execute(sql, [
              action_id,
              userInfo.phone,
              money,
              infoBank.stk,
              infoBank.sdt,
              type,
              infoBank.chi_nhanh,
              infoBank.name_bank,
              infoBank.email,
              infoBank.name_user,
              0,
              checkTime,
              dates,
            ]);
            await connection.execute(
              "UPDATE users SET money = money - ? WHERE phone = ? ",
              [money, userInfo.phone],
            );
            action_status = "success";
            info = JSON.stringify({ type });
            return res.status(200).json({
              message: "Withdrawal successful",
              status: true,
              money: userInfo.money - money,
              timeStamp: timeNow,
            });
          } else {
            info = JSON.stringify({ reason: "need_bet", result });
            return res.status(200).json({
              message: "The total bet is not enough to fulfill the request",
              status: false,
              result: result,
              timeStamp: timeNow,
            });
          }
        } else {
          info = JSON.stringify({ reason: "insufficient_balance" });
          return res.status(200).json({
            message: "The balance is not enough to fulfill the request",
            status: false,
            timeStamp: timeNow,
          });
        }
      } else {
        info = JSON.stringify({ reason: "max_daily_withdraw" });
        return res.status(200).json({
          message: "You can only make 2 withdrawals  request per day",
          status: false,
          timeStamp: timeNow,
        });
      }
    } else {
      info = JSON.stringify({ reason: "no_bank_linked" });
      return res.status(200).json({
        message: "Please link your bank first",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    info = JSON.stringify({ error: error.message });
    return res
      .status(500)
      .json({ message: "Internal server error", status: false });
  } finally {
    if (user_phone || money) {
      await logUserAction({
        user_phone,
        action_type: "withdraw",
        action_id,
        money,
        status: action_status,
        ip_address: ip,
        user_agent: agent,
        info,
      });
    }
  }
};

const transfer = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let amount = req.body.amount;
    let receiver_phone = req.body.phone;
    const date = new Date();
    let id_order =
      Math.floor(Math.random() * (99999999999999 - 10000000000000 + 1)) +
      10000000000000;
    let time = timerJoin2(Date.now());
    let client_transaction_id = id_order;
    const [user] = await connection.query(
      "SELECT `phone`,`money`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    let sender_phone = userInfo.phone;
    let sender_money = parseInt(userInfo.money);
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let dates = new Date().getTime();
    let checkTime = timerJoin(dates);
    const [recharge] = await connection.query(
      "SELECT * FROM recharge WHERE phone = ? AND status = 1 ",
      [userInfo.phone],
    );
    const [minutes_1] = await connection.query(
      "SELECT * FROM minutes_1 WHERE phone = ? ",
      [userInfo.phone],
    );
    let total = 0;
    recharge.forEach((data) => {
      total += data.money;
    });
    let total2 = 0;
    minutes_1.forEach((data) => {
      total2 += data.money;
    });
    let result = 0;
    if (total - total2 > 0) result = total - total2;
    if (result == 0) {
      if (sender_money >= amount) {
        let [receiver] = await connection.query(
          "SELECT * FROM users WHERE `phone` = ?",
          [receiver_phone],
        );
        if (receiver.length === 1 && sender_phone !== receiver_phone) {
          let money = sender_money - amount;
          let total_money = amount + receiver[0].total_money;
          const sql =
            "INSERT INTO balance_transfer (sender_phone, receiver_phone, amount) VALUES (?, ?, ?)";
          await connection.execute(sql, [sender_phone, receiver_phone, amount]);
          const sql_recharge =
            "INSERT INTO recharge (id_order, transaction_id, phone, money, type, status, today, url, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
          await connection.execute(sql_recharge, [
            client_transaction_id,
            0,
            receiver_phone,
            amount,
            "wallet",
            0,
            checkTime,
            0,
            time,
          ]);
          return res.status(200).json({
            message: `Requested ${amount} sent successfully`,
            status: true,
            timeStamp: timeNow,
          });
        } else {
          return res.status(200).json({
            message: `${receiver_phone} is not a valid user mobile number`,
            status: false,
            timeStamp: timeNow,
          });
        }
      } else {
        return res.status(200).json({
          message: "Your balance is not enough",
          status: false,
          timeStamp: timeNow,
        });
      }
    } else {
      return res.status(200).json({
        message: "The total bet is not enough to fulfill the request",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const transferHistory = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    const [user] = await connection.query(
      "SELECT `phone`,`money`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [history] = await connection.query(
      "SELECT * FROM balance_transfer WHERE sender_phone = ?",
      [userInfo.phone],
    );
    const [receive] = await connection.query(
      "SELECT * FROM balance_transfer WHERE receiver_phone = ?",
      [userInfo.phone],
    );
    if (receive.length > 0 || history.length > 0) {
      return res.status(200).json({
        message: "Success",
        receive: receive,
        datas: history,
        status: true,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const recharge2 = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let money = req.body.money;
    if (!auth || money) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [recharge] = await connection.query(
      "SELECT * FROM recharge WHERE phone = ? AND status = ? ORDER BY id DESC LIMIT 1",
      [userInfo.phone, 0],
    );
    const [bank_recharge] = await connection.query(
      "SELECT * FROM bank_recharge",
    );
    const upiUrl1 = `upi://pay?pa=${bank_recharge[0]?.stk}&pn="bdg"&am=${recharge[0]?.money}`;
    const qrcode1 = await generateQRCode(upiUrl1);
    const upiUrl2 = `upi://pay?pa=${bank_recharge[0]?.upi2}&pn="bdg"&am=${recharge[0]?.money}`;
    const qrcode2 = await generateQRCode(upiUrl2);
    const upiUrl3 = `upi://pay?pa=${bank_recharge[0]?.upi3}&pn="bdg"&am=${recharge[0]?.money}`;
    const qrcode3 = await generateQRCode(upiUrl3);
    if (recharge.length != 0) {
      return res.status(200).json({
        message: "Received successfully",
        datas: recharge[0],
        infoBank: bank_recharge,
        qrcode1: qrcode1,
        qrcode2: qrcode2,
        qrcode3: qrcode3,
        status: true,
        timeStamp: timeNow,
      });
    } else {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const listRecharge = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [admindata] = await connection.execute(
      "SELECT deposite_requre FROM admin",
    );
    const depositRequre = admindata[0].deposite_requre;
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [recharge] = await connection.query(
      "SELECT * FROM recharge WHERE phone = ? ORDER BY id DESC ",
      [userInfo.phone],
    );
    return res.status(200).json({
      message: "Receive success",
      datas: { recharge, depositRequre },
      depositRequre: depositRequre,
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const listRecharge2 = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [recharge2] = await connection.query(
      "SELECT * FROM recharge WHERE phone = ? AND status = 1 ORDER BY id DESC LIMIT 1",
      [userInfo.phone],
    );
    const [dpositReq] = await connection.execute(
      `SELECT deposite_requre FROM admin`,
    );
    if (dpositReq[0].deposite_requre == 1) {
      return res.status(200).json({
        message: "Receive success",
        data2: recharge2,
        status: true,
        timeStamp: timeNow,
      });
    } else {
      return res.status(200).json({
        message: "Receive success",
        status: true,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const search = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let phone = req.body.phone;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite`, `level` FROM users WHERE `token` = ? ",
      [auth],
    );
    if (user.length == 0) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    if (userInfo.level == 1) {
      const [users] = await connection.query(
        `SELECT * FROM users WHERE phone = ? ORDER BY id DESC `,
        [phone],
      );
      return res.status(200).json({
        message: "Receive success",
        datas: users,
        status: true,
        timeStamp: timeNow,
      });
    } else if (userInfo.level == 2) {
      const [users] = await connection.query(
        `SELECT * FROM users WHERE phone = ? ORDER BY id DESC `,
        [phone],
      );
      if (users.length == 0) {
        return res.status(200).json({
          message: "Receive success",
          datas: [],
          status: true,
          timeStamp: timeNow,
        });
      } else {
        if (users[0].ctv == userInfo.phone) {
          return res.status(200).json({
            message: "Receive success",
            datas: users,
            status: true,
            timeStamp: timeNow,
          });
        } else {
          return res.status(200).json({
            message: "Failed",
            status: false,
            timeStamp: timeNow,
          });
        }
      }
    } else {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const downlinerecharge = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    const date = new Date().toISOString().slice(0, 10);
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: new Date().getTime(),
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ?",
      [auth],
    );
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: new Date().getTime(),
      });
    }
    let userInfo = user[0];
    const selectedData = [];
    async function fetchUserDataByCode(code, depth = 1) {
      if (depth > 6) return;
      const [userData] = await connection.query(
        "SELECT `id_user`, `name_user`, `phone`, `code`, `invite`, `rank`, `total_money`, `time` FROM users WHERE `invite` = ?",
        [code],
      );
      if (userData.length > 0) {
        for (const user of userData) {
          const userObject = { ...user, level: depth };
          selectedData.push(userObject);
          await fetchUserDataByCode(user.code, depth + 1);
        }
      }
    }
    await fetchUserDataByCode(userInfo.code);
    const rechargeData_record = [];
    let total_recharge_count = 0;
    let total_recharge_amount = 0;
    let total_bet_count = 0;
    let total_bet_amount = 0;
    let total_first_recharge_count = 0;
    let better_number = 0;
    let totalCommsionsAmount = 0;
    async function fetchUserRechargeByCode(date) {
      for (let i = 0; i < selectedData.length; i++) {
        try {
          const [userCombinedTotal] = await connection.query(
            `SELECT IFNULL(SUM(overall_total_money), 0) as grand_total_money FROM ( SELECT SUM(\`money\`) as overall_total_money FROM minutes_1 WHERE \`phone\` = ? AND DATE(\`today\`) = ? UNION ALL SELECT SUM(\`money\`) as overall_total_money FROM result_k3 WHERE \`phone\` = ? AND DATE(\`bet_data\`) = ? UNION ALL SELECT SUM(\`money\`) as overall_total_money FROM result_5d WHERE \`phone\` = ? AND DATE(\`bet_data\`) = ? ) combined_table`,
            [
              selectedData[i].phone,
              date,
              selectedData[i].phone,
              date,
              selectedData[i].phone,
              date,
            ],
          );
          const [rechargeRecord] = await connection.query(
            `SELECT IFNULL(SUM(\`money\`), 0) as grand_total_money FROM \`recharge\` WHERE \`phone\` = ? AND \`status\` = 1 AND DATE(\`today\`) = ?`,
            [selectedData[i].phone, date],
          );
          const [deposits] = await connection.query(
            `SELECT \`id\`, \`id_order\`, \`transaction_id\`, \`utr\`, \`phone\`, \`money\`, \`type\`, \`status\`, \`today\`, \`url\`, \`time\` FROM \`recharge\` WHERE \`phone\` = ? AND \`status\` = 1 AND DATE(\`today\`) = ?`,
            [selectedData[i].phone, date],
          );
          const [userCombinedTotal_count] = await connection.query(
            `SELECT COUNT(*) AS row_count FROM ( SELECT phone FROM minutes_1 WHERE \`phone\` = ? AND DATE(\`today\`) = ? UNION ALL SELECT phone FROM result_k3 WHERE \`phone\` = ? AND DATE(\`bet_data\`) = ? UNION ALL SELECT phone FROM result_5d WHERE \`phone\` = ? AND DATE(\`bet_data\`) = ? ) AS combined_table`,
            [
              selectedData[i].phone,
              date,
              selectedData[i].phone,
              date,
              selectedData[i].phone,
              date,
            ],
          );
          const [commsions] = await connection.query(
            "SELECT SUM(`commission`) AS total_subordinatedata_amount, `date` FROM `subordinatedata` WHERE `phone` = ? AND DATE(`date`) = ?",
            [selectedData[i].phone, date],
          );
          const totalCommsionsAmount =
            commsions[0].total_subordinatedata_amount !== null
              ? commsions[0].total_subordinatedata_amount
              : 0;
          const rowCount = userCombinedTotal_count[0].row_count;
          total_bet_count += rowCount;
          deposits.forEach((deposit) => {
            total_recharge_amount += parseFloat(deposit.money);
          });
          if (deposits.length > 0) {
            total_first_recharge_count += 1;
          }
          const grandTotalMoney = userCombinedTotal[0].grand_total_money;
          const grandRechargeTotalMoney = rechargeRecord[0].grand_total_money;
          if (grandTotalMoney > 0) better_number += 1;
          total_recharge_count += deposits.length;
          total_bet_amount += parseFloat(grandTotalMoney);
          const userObject = {
            totalBetAmount: grandTotalMoney,
            totalRechargeAmount: grandRechargeTotalMoney,
            totalCommsionsAmount: totalCommsionsAmount,
            userLevel: selectedData[i].level,
            userId: selectedData[i].id_user,
            dates: selectedData[i]?.time,
          };
          rechargeData_record.push(userObject);
        } catch (error) {
          console.error("Error fetching data:", error);
          return res.status(500).json({
            message: error.message,
            status: true,
            timeStamp: new Date().getTime(),
          });
        }
      }
    }
    function maskPhoneNumber(phone) {
      if (phone.length === 10) {
        return phone.substring(0, 4) + "****" + phone.substring(7);
      }
      return phone;
    }
    await fetchUserRechargeByCode(date);
    return res.status(200).json({
      message: "Success",
      status: true,
      timeStamp: new Date().getTime(),
      total_first_recharge_count: total_first_recharge_count,
      total_recharge_count: total_recharge_count,
      total_recharge_amount: total_recharge_amount,
      total_bet_count: total_bet_count,
      total_bet_amount: total_bet_amount,
      better_number: better_number,
      datas: rechargeData_record,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const downlinerecharge_data = async (req, res) => {
  let auth = req.cookies.auth;
  const { date } = req.body;
  if (!auth) {
    return res.status(200).json({
      message: "Failed",
      status: false,
      timeStamp: new Date().getTime(),
    });
  }
  try {
    const [user] = await connection.query(
      "SELECT `phone`, `code`, `invite` FROM users WHERE `token` = ?",
      [auth],
    );
    if (!user.length) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: new Date().getTime(),
      });
    }
    let userInfo = user[0];
    const [allUsers] = await connection.query(
      `WITH RECURSIVE InviteCTE AS ( SELECT id_user, name_user, phone, code, invite, rank, total_money, 1 AS depth FROM users WHERE invite = ? UNION ALL SELECT u.id_user, u.name_user, u.phone, u.code, u.invite, u.rank, u.total_money, c.depth + 1 FROM users u INNER JOIN InviteCTE c ON u.invite = c.code WHERE c.depth < 6 ) SELECT * FROM InviteCTE;`,
      [userInfo.code],
    );
    const [level] = await connection.query("SELECT * FROM level");
    const commissionRatios = {
      1: level[0]?.f1 / 100,
      2: level[1]?.f1 / 100,
      3: level[2]?.f1 / 100,
      4: level[3]?.f1 / 100,
      5: level[4]?.f1 / 100,
      6: level[5]?.f1 / 100,
    };
    const rechargePromises = allUsers.map(async (user) => {
      const levelRatio = commissionRatios[user.depth] || 0;
      const [userCombinedTotal] = await connection.query(
        `SELECT IFNULL(SUM(overall_total_money), 0) as grand_total_money FROM ( SELECT SUM(\`money\`) as overall_total_money FROM minutes_1 WHERE \`phone\` = ? AND DATE(\`today\`) = ? UNION ALL SELECT SUM(\`money\`) as overall_total_money FROM result_k3 WHERE \`phone\` = ? AND DATE(\`bet_data\`) = ? UNION ALL SELECT SUM(\`money\`) as overall_total_money FROM result_5d WHERE \`phone\` = ? AND DATE(\`bet_data\`) = ? ) combined_table`,
        [user.phone, date, user.phone, date, user.phone, date],
      );
      const [rechargeRecord] = await connection.query(
        `SELECT IFNULL(SUM(\`money\`), 0) as grand_total_money FROM \`recharge\` WHERE \`phone\` = ? AND \`status\` = 1 AND DATE(\`today\`) = ?`,
        [user.phone, date],
      );
      const [deposits] = await connection.query(
        `SELECT \`id\`, \`id_order\`, \`transaction_id\`, \`utr\`, \`phone\`, \`money\`, \`type\`, \`status\`, \`today\`, \`url\`, \`time\` FROM \`recharge\` WHERE \`phone\` = ? AND \`status\` = 1 AND DATE(\`today\`) = ?`,
        [user.phone, date],
      );
      const [userCombinedTotalCount] = await connection.query(
        `SELECT COUNT(*) AS row_count FROM ( SELECT phone FROM minutes_1 WHERE \`phone\` = ? AND DATE(\`today\`) = ? UNION ALL SELECT phone FROM result_k3 WHERE \`phone\` = ? AND DATE(\`bet_data\`) = ? UNION ALL SELECT phone FROM result_5d WHERE \`phone\` = ? AND DATE(\`bet_data\`) = ? ) AS combined_table`,
        [user.phone, date, user.phone, date, user.phone, date],
      );
      const rowCount = userCombinedTotalCount[0]?.row_count || 0;
      const isBetter =
        parseFloat(userCombinedTotal[0]?.grand_total_money || 0) > 0;
      const totalCommissionsAmount = parseFloat(
        (
          parseFloat(userCombinedTotal[0]?.grand_total_money || 0) * levelRatio
        ).toFixed(2),
      );
      let date1 = new Date(date);
      date1.setUTCHours(0, 0, 0, 0);
      let timestamp = date1.getTime();
      return {
        totalBetAmount: parseFloat(
          userCombinedTotal[0]?.grand_total_money || 0,
        ).toFixed(2),
        totalRechargeAmount: parseFloat(
          rechargeRecord[0]?.grand_total_money || 0,
        ).toFixed(2),
        totalCommsionsAmount: totalCommissionsAmount,
        userLevel: user.depth,
        userId: user.id_user,
        dates: timestamp,
        rechargeCount: deposits.length,
        betCount: rowCount,
        isBetter,
        firstRecharge: deposits.length > 0,
      };
    });
    let rechargeData = await Promise.all(rechargePromises);
    rechargeData = rechargeData.filter(
      (data) =>
        data.totalBetAmount > 0 ||
        data.totalRechargeAmount > 0 ||
        data.totalCommsionsAmount > 0,
    );
    const total_first_recharge_count = rechargeData.filter(
      (data) => data.firstRecharge,
    ).length;
    const total_recharge_count = rechargeData.reduce(
      (sum, data) => sum + data.rechargeCount,
      0,
    );
    const total_recharge_amount = rechargeData
      .reduce((sum, data) => sum + parseFloat(data.totalRechargeAmount), 0)
      .toFixed(2);
    const total_bet_count = rechargeData.reduce(
      (sum, data) => sum + data.betCount,
      0,
    );
    const total_bet_amount = rechargeData
      .reduce((sum, data) => sum + parseFloat(data.totalBetAmount), 0)
      .toFixed(2);
    const better_number = rechargeData.filter((data) => data.isBetter).length;
    const levelData = rechargeData.reduce((acc, data) => {
      const level = data.userLevel;
      if (!acc[level]) {
        acc[level] = {
          total_first_recharge_count: 0,
          total_recharge_count: 0,
          total_recharge_amount: 0,
          total_bet_count: 0,
          total_bet_amount: 0,
          better_number: 0,
        };
      }
      acc[level].total_first_recharge_count += data.firstRecharge ? 1 : 0;
      acc[level].total_recharge_count += data.rechargeCount;
      acc[level].total_recharge_amount += parseFloat(data.totalRechargeAmount);
      acc[level].total_bet_count += data.betCount;
      acc[level].total_bet_amount += parseFloat(data.totalBetAmount);
      acc[level].better_number += data.isBetter ? 1 : 0;
      return acc;
    }, {});
    const levelDataArray = Object.keys(levelData).map((level) => ({
      level: parseInt(level),
      total_first_recharge_count: levelData[level].total_first_recharge_count,
      total_recharge_count: levelData[level].total_recharge_count,
      total_recharge_amount: levelData[level].total_recharge_amount.toFixed(2),
      total_bet_count: levelData[level].total_bet_count,
      total_bet_amount: levelData[level].total_bet_amount.toFixed(2),
      better_number: levelData[level].better_number,
    }));
    return res.status(200).json({
      message: "Success",
      status: true,
      timeStamp: new Date().getTime(),
      total_first_recharge_count,
      total_recharge_count,
      total_recharge_amount,
      date,
      total_bet_count,
      total_bet_amount,
      better_number,
      datas: rechargeData,
      levelData: levelDataArray,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({
      message: error.message,
      status: false,
      timeStamp: new Date().getTime(),
    });
  }
};

const subordinatedata = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    const [user] = await connection.query(
      "SELECT `phone`, `money`, `code`, `invite`, `user_level` FROM users WHERE `token` = ?",
      [auth],
    );
    let userInfo = user[0];
    if (!userInfo) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let selectedData = [];
    const currentDate = new Date().toISOString().slice(0, 10);
    async function fetchInvitesByCode(code, depth = 1) {
      if (depth > 6) return;
      const [inviteData] = await connection.query(
        "SELECT `id_user`, `name_user`, `phone`, `code`, `invite`, `rank`, `user_level`, `total_money` FROM users WHERE `invite` = ?",
        [code],
      );
      if (inviteData.length > 0) {
        for (const invite of inviteData) {
          selectedData.push({
            id_user: invite.id_user,
            name_user: invite.name_user,
            phone: invite.phone,
            code: invite.code,
            invite: invite.invite,
            rank: invite.rank,
            user_level: depth,
            total_money: invite.total_money,
          });
          await fetchInvitesByCode(invite.code, depth + 1);
        }
      }
    }
    await fetchInvitesByCode(userInfo.code);
    let downlineUsers = [userInfo];
    downlineUsers = downlineUsers.concat(selectedData);
    let results = [];
    for (const user of downlineUsers) {
      let totalRechargeAmount = 0;
      let totalBetAmount = 0;
      let totalCommsionsAmount = 0;
      let dates = 0;
      const [recharges] = await connection.query(
        "SELECT SUM(`money`) as total_recharge_amount FROM `recharge` WHERE `phone` = ? AND `status` = 1",
        [user.phone],
      );
      totalRechargeAmount =
        recharges[0].total_recharge_amount !== null
          ? recharges[0].total_recharge_amount
          : 0;
      const [commsions] = await connection.query(
        "SELECT SUM(`commission`) as total_subordinatedata_amount,`date` FROM `subordinatedata` WHERE `phone` = ? AND `bonusby`=?",
        [userInfo.phone, user.phone],
      );
      totalCommsionsAmount =
        commsions[0].total_subordinatedata_amount !== null
          ? commsions[0].total_subordinatedata_amount
          : 0;
      dates = commsions[0].date !== null ? commsions[0].date : 0;
      const [userCombinedTotal] = await connection.query(
        `SELECT SUM(overall_total_money) as total_bet_amount FROM ( SELECT SUM(\`money\`) as overall_total_money FROM minutes_1 WHERE \`phone\` = ? UNION SELECT SUM(\`money\`) as overall_total_money FROM result_k3 WHERE \`phone\` = ? UNION SELECT SUM(\`money\`) as overall_total_money FROM result_5d WHERE \`phone\` = ? ) combined_table`,
        [user.phone, user.phone, user.phone],
      );
      totalBetAmount =
        userCombinedTotal[0].total_bet_amount !== null
          ? userCombinedTotal[0].total_bet_amount
          : 0;
      results.push({
        phone: user.phone,
        name: user.name_user,
        userLevel: user.user_level,
        userId: user.id_user,
        totalRechargeAmount,
        totalBetAmount,
        totalCommsionsAmount,
        dates,
      });
    }
    return res.status(200).json({
      message: "Success",
      datas: results,
      success: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const commissiondata = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    const [user] = await connection.query(
      "SELECT `phone`, `money`, `code`, `invite`, `user_level` FROM users WHERE `token` = ?",
      [auth],
    );
    let userInfo = user[0];
    if (!userInfo) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [commsions] = await connection.query(
      "SELECT * FROM `subordinatedata` WHERE `phone` = ?",
      [userInfo.phone],
    );
    return res.status(200).json({
      message: "Success",
      datas: commsions,
      success: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      success: false,
    });
  }
};

const vipLevel = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    const [user] = await connection.query(
      "SELECT `phone`, `money`, `code`, `invite`, `user_level` FROM users WHERE `token` = ?",
      [auth],
    );
    let userInfo = user[0];
    if (!userInfo) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [userTotalMoney] = await connection.query(
      `SELECT SUM(total_money) as total_money_sum FROM ( SELECT SUM(money) as total_money FROM minutes_1 WHERE \`phone\` = ? UNION ALL SELECT SUM(money) as total_money FROM result_k3 WHERE \`phone\` = ? UNION ALL SELECT SUM(money) as total_money FROM result_5d WHERE \`phone\` = ? ) combined_table`,
      [userInfo.phone, userInfo.phone, userInfo.phone],
    );
    let validDepositsCount = userTotalMoney[0]?.total_money_sum;
    const [data] = await connection.query(
      "SELECT * FROM vip_record WHERE `phone` = ?",
      [userInfo.phone],
    );
    return res.status(200).json({
      message: "Success",
      data: data,
      levels: validDepositsCount,
      success: true,
      timeStamp: timeNow,
    });
  } catch (err) {
    return res.status(500).json({
      message: "internal server error",
      success: true,
      timeStamp: timeNow,
    });
  }
};

const vipLevelEvery = async () => {
  try {
    const [minutesData] = await connection.execute(
      "SELECT phone, money FROM minutes_1",
    );
    const [resultK3Data] = await connection.execute(
      "SELECT phone, money FROM result_k3",
    );
    const [result5DData] = await connection.execute(
      "SELECT phone, money FROM result_5d",
    );
    const [vipdata] = await connection.execute("SELECT * FROM vip_data");
    const alldata = [...minutesData, ...resultK3Data, ...result5DData];
    let validDepositsCount = {};
    let phoneCount = {};
    for (const item of alldata) {
      const { phone, money } = item;
      const moneyValue = parseInt(money);
      if (validDepositsCount[phone]) {
        validDepositsCount[phone] += moneyValue;
        phoneCount[phone] += 1;
      } else {
        validDepositsCount[phone] = moneyValue;
        phoneCount[phone] = 1;
      }
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const sumdate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    for (const phone in validDepositsCount) {
      const totalAmount = validDepositsCount[phone];
      let bonusAmount = 0;
      let level = 0;
      let rebetRet = 0;
      if (totalAmount >= vipdata[9].amount) {
        bonusAmount = vipdata[9].onetime;
        rebetRet = vipdata[9].rebet;
        level = 10;
      } else if (totalAmount >= vipdata[8].amount) {
        bonusAmount = vipdata[8].onetime;
        rebetRet = vipdata[8].rebet;
        level = 9;
      } else if (totalAmount >= vipdata[7].amount) {
        bonusAmount = vipdata[7].onetime;
        rebetRet = vipdata[7].rebet;
        level = 8;
      } else if (totalAmount >= vipdata[6].amount) {
        bonusAmount = vipdata[6].onetime;
        rebetRet = vipdata[6].rebet;
        level = 7;
      } else if (totalAmount >= vipdata[5].amount) {
        bonusAmount = vipdata[5].onetime;
        rebetRet = vipdata[5].rebet;
        level = 6;
      } else if (totalAmount >= vipdata[4].amount) {
        bonusAmount = vipdata[4].onetime;
        rebetRet = vipdata[4].rebet;
        level = 5;
      } else if (totalAmount >= vipdata[3].amount) {
        bonusAmount = vipdata[3].onetime;
        rebetRet = vipdata[3].rebet;
        level = 4;
      } else if (totalAmount >= vipdata[2].amount) {
        bonusAmount = vipdata[2].onetime;
        rebetRet = vipdata[2].rebet;
        level = 3;
      } else if (totalAmount >= vipdata[1].amount) {
        bonusAmount = vipdata[1].onetime;
        rebetRet = vipdata[1].rebet;
        level = 2;
      } else if (totalAmount >= vipdata[0].amount) {
        bonusAmount = vipdata[0].onetime;
        rebetRet = vipdata[0].rebet;
        level = 1;
      }
      if (bonusAmount > 0) {
        const [user] = await connection.execute(
          "SELECT * FROM users WHERE phone = ?",
          [phone],
        );
        let userInfo = user[0];
        if (userInfo) {
          const prevLevel = userInfo.vip_level;
          if (prevLevel < level && totalAmount >= vipdata[prevLevel]?.amount) {
            await connection.execute(
              "UPDATE users SET money = money + ?, vip_level = ?, needbet = needbet + ?, rebetRet = ? WHERE phone = ?",
              [bonusAmount, level, bonusAmount, rebetRet, phone],
            );
            await connection.execute(
              "INSERT INTO vip_record (phone, amount, level, date) VALUES (?, ?, ?, ?)",
              [phone, bonusAmount, level, sumdate],
            );
            await connection.query(
              "INSERT INTO transaction_history SET phone = ?, detail = ?, balance = ?, time = ?",
              [phone, `vip level${prevLevel} bonus`, bonusAmount, sumdate],
            );
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
};

const vipLevelMonthly = async (req, res) => {
  try {
    const now = new Date();
    const [vipdata] = await connection.execute("SELECT * FROM vip_data");
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const sumdate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    const [userData] = await connection.query(
      "SELECT * FROM users WHERE vip_level >= 1",
    );
    const bonusAmounts = [
      vipdata[0].monthstime,
      vipdata[1].monthstime,
      vipdata[2].monthstime,
      vipdata[3].monthstime,
      vipdata[4].monthstime,
      vipdata[5].monthstime,
      vipdata[6].monthstime,
      vipdata[7].monthstime,
      vipdata[8].monthstime,
      vipdata[9].monthstime,
    ];
    for (const userInfo of userData) {
      const level = userInfo.vip_level;
      if (level >= 1 && level <= 10) {
        const bonusAmount = bonusAmounts[level - 1];
        await connection.query(
          "UPDATE `users` SET `money` = `money` + ? WHERE `phone` = ?",
          [bonusAmount, userInfo.phone],
        );
        await connection.query(
          "INSERT INTO vip_record SET phone=?, amount=?, level=?, type=?, date=?",
          [userInfo.phone, bonusAmount, level, "Month", sumdate],
        );
      }
    }
    res.send({ message: "VIP monthly bonuses processed successfully." });
  } catch (err) {
    console.error("Error processing VIP bonuses:", err);
    res
      .status(500)
      .send({ error: "An error occurred while processing VIP bonuses." });
  }
};

const newSubordinateData = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    const [user] = await connection.query(
      "SELECT `phone`,`money`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let [data] = await connection.query(
      "SELECT * FROM users WHERE invite = ?  ORDER BY id DESC ",
      [userInfo.code],
    );
    return res.status(200).json({
      message: "new subordinate Successfull",
      datas: data,
      success: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    return res.status(500).json({
      message: "internal server",
      success: false,
    });
  }
};

const getInvitationBonus = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: new Date().getTime(),
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`, `invite` FROM `users` WHERE `token` = ?",
      [auth],
    );
    if (!user || !user.length) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: new Date().getTime(),
      });
    }
    const userinfo = user[0];
    const [downlineUsers] = await connection.query(
      "SELECT `id`, `phone`, `invite` FROM `users` WHERE `invite` = ?",
      [userinfo.code],
    );
    const [result] = await connection.query(
      `SELECT * FROM invitation_bonus ORDER BY id DESC`,
    );
    const getTotalDeposits = async (phone) => {
      const [firstDeposit] = await connection.query(
        "SELECT money FROM recharge WHERE phone = ? AND status = 1 ORDER BY id ASC LIMIT 1",
        [phone],
      );
      return firstDeposit[0] ? firstDeposit[0].money : null;
    };
    var validDepositsCount = 0;
    for (const downlineUser of downlineUsers) {
      const totalDeposits = await getTotalDeposits(downlineUser.phone);
      if (totalDeposits >= result[0].amount) {
        validDepositsCount++;
      }
    }
    const now = new Date();
    const sumDate = timerJoin2(now.getTime());
    const [bonusRecordAll] = await connection.query(
      "SELECT * FROM `activity_bonus` WHERE `phone` = ?",
      [userinfo.phone],
    );
    const [highBonus] = await connection.query(
      `SELECT * FROM invitation_bonus ORDER BY CAST(bonus AS UNSIGNED) DESC LIMIT 1`,
    );
    const totalRules = result.length;
    const HighestBonus = highBonus[0].bonus;
    const AvgDeposit = highBonus[0].amount;
    return res.status(200).json({
      message: "Data fetched successfully",
      success: true,
      data: result,
      totalRules: totalRules,
      hightBonus: HighestBonus,
      AvgDeposit: AvgDeposit,
      validDepositsCount: validDepositsCount,
      downline: downlineUsers.length,
    });
  } catch (error) {
    console.error("Error fetching active users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const calculateDownlineBonuses = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: new Date().getTime(),
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`, `invite` FROM `users` WHERE `token` = ?",
      [auth],
    );
    if (!user || !user.length) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: new Date().getTime(),
      });
    }
    const userinfo = user[0];
    const [downlineUsers] = await connection.query(
      "SELECT phone FROM `users` WHERE `invite` = ?",
      [userinfo.code],
    );
    if (!downlineUsers.length) {
      return res.status(200).json({
        message: "No downline users found",
        status: false,
        timeStamp: new Date().getTime(),
      });
    }
    let userDeposits = [];
    for (const downlineUser of downlineUsers) {
      const [depositResult] = await connection.query(
        "SELECT SUM(money) AS totalmoney FROM recharge WHERE phone = ?",
        [downlineUser.phone],
      );
      userDeposits.push({
        phone: downlineUser.phone,
        totalmoney: depositResult[0]?.totalmoney || 0,
      });
    }
    const [bonusLevels] = await connection.query(
      "SELECT `id`, `rule`, `amount`, `bonus`, `count` FROM `invitation_bonus` ORDER BY amount DESC",
    );
    let validCounts = [];
    let bonusesToGive = [];
    for (const tier of bonusLevels) {
      let validDepositsCount = userDeposits.filter(
        (user) => user.totalmoney >= tier.amount,
      ).length;
      validCounts.push({ tierId: tier.id, validCount: validDepositsCount });
      if (validDepositsCount >= tier.count) {
        bonusesToGive.push(tier);
      }
    }
    for (const tier of bonusesToGive) {
      const [existingBonus] = await connection.query(
        "SELECT * FROM `activity_bonus` WHERE `phone` = ? AND `invitation_bonusid` = ?",
        [userinfo.phone, tier.id],
      );
      if (!existingBonus.length) {
        await connection.query(
          "INSERT INTO `activity_bonus` (`phone`, `invitation_bonusid`, `amount`, `description`, `type`, `status`, `date`) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            userinfo.phone,
            tier.id,
            tier.bonus,
            "Invitation bonus received",
            "credit",
            1,
            new Date(),
          ],
        );
        await connection.query(
          "UPDATE users SET money = money + ? WHERE `phone` = ? ",
          [tier.bonus, userinfo.phone],
        );
        let checkTime = timerJoin2(Date.now());
        await connection.query(
          "INSERT INTO transaction_history (phone, detail, balance, `time`) VALUES (?, ?, ?, ?)",
          [userinfo.phone, `Invitation Bonus`, tier.bonus, checkTime],
        );
      }
    }
    const [bonusRecordAll] = await connection.query(
      "SELECT * FROM `activity_bonus` WHERE `phone` = ?",
      [userinfo.phone],
    );
    return res.status(200).json({
      message: "Success",
      status: true,
      timeStamp: new Date().getTime(),
      userDeposits,
      downline: downlineUsers.length,
      validCounts,
      earnedBonuses: bonusesToGive.map((tier) => ({
        tierId: tier.id,
        amount: tier.bonus,
      })),
      data: bonusRecordAll,
    });
  } catch (error) {
    console.error("Error in calculateDownlineBonuses function:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
      error: error.message,
      timeStamp: new Date().getTime(),
    });
  }
};

const feedback = async (req, res) => {
  let auth = req.cookies.auth;
  const { title } = req.body;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Invalid user",
        status: false,
        timeStamp: timeNow,
      });
    }
    const sumdate = timerJoin2(Date.now());
    const [feedback] = await connection.query(
      "INSERT INTO  feedback SET phone = ?,title=?,date=?",
      [userInfo.phone, title, sumdate],
    );
    return res.status(200).json({
      message: "Feedback successful",
      data: feedback,
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "internal server error",
      status: false,
    });
  }
};

const listWithdraw = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [recharge] = await connection.query(
      "SELECT * FROM withdraw WHERE phone = ? ORDER BY id DESC ",
      [userInfo.phone],
    );
    return res.status(200).json({
      message: "Receive success",
      datas: recharge,
      status: true,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const useRedenvelope = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let code = req.body.code;
    const timeNow = new Date();
    if (!auth || !code) {
      return res.status(400).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ?",
      [auth],
    );
    if (!user.length) {
      return res.status(404).json({
        message: "User not found",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    const [redenvelopes_usedbyuser] = await connection.query(
      "SELECT * FROM redenvelopes_used WHERE id_redenvelops = ? AND phone_used = ?",
      [code, userInfo.phone],
    );
    if (redenvelopes_usedbyuser.length >= 1) {
      return res.status(200).json({
        message: "Gift code already used on your id",
        status: true,
        timeStamp: timeNow,
      });
    }
    const [redenvelopes] = await connection.query(
      "SELECT * FROM redenvelopes WHERE id_redenvelope = ?",
      [code],
    );
    if (redenvelopes.length === 0) {
      return res.status(200).json({
        message: "Red envelope not found",
        status: true,
        timeStamp: timeNow,
      });
    }
    const currentTime = timerJoin2(Date.now());
    const checkTime2 = timerJoin4(Date.now());
    if (redenvelopes[0].recharge > 10) {
      const [recharge] = await connection.query(
        "SELECT * FROM recharge WHERE phone = ? AND money >=? AND status=1 AND DATE(today)=?",
        [userInfo.phone, redenvelopes[0].recharge, checkTime2],
      );
      if (recharge.length === 0) {
        return res.status(200).json({
          message: `You need to recharge ${redenvelopes[0].recharge} today`,
          status: true,
          timeStamp: currentTime,
          data: recharge,
        });
      }
    }
    if (redenvelopes[0].used == 0) {
      return res.status(200).json({
        message: "Red envelope already used",
        status: true,
        timeStamp: timeNow,
      });
    }
    const infoRe = redenvelopes[0];
    if (infoRe.used !== 0 && infoRe.used >= 0) {
      await connection.query(
        "UPDATE redenvelopes SET used=used-?, status = 0 WHERE `id_redenvelope` = ? ",
        [1, infoRe.id_redenvelope],
      );
      await connection.query(
        "UPDATE users SET money = money + ? WHERE `phone` = ? ",
        [infoRe.money, userInfo.phone],
      );
      const sql =
        "INSERT INTO redenvelopes_used SET phone = ?, phone_used = ?, id_redenvelops = ?, money = ?, `time` = ? ";
      await connection.query(sql, [
        infoRe.phone,
        userInfo.phone,
        infoRe.id_redenvelope,
        infoRe.money,
        currentTime,
      ]);
      await connection.query(
        `INSERT INTO transaction_history SET phone=?, detail=?,balance=?, time = NOW()`,
        [userInfo.phone, "Red envelope", infoRe.money],
      );
      return res.status(200).json({
        message: `Successfully received +${infoRe.money}`,
        status: true,
        timeStamp: timeNow,
      });
    } else {
      return res.status(200).json({
        message: "Gift code already used",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error in useRedenvelope:", error);
    return res.status(200).json({
      message: "Internal Server Error",
      error: error,
      status: false,
      timeStamp: timeNow,
    });
  }
};

const getRedenvelope = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Invalid token ",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Invalid user",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [redenvelopes] = await connection.query(
      "SELECT * FROM redenvelopes_used WHERE phone_used = ?",
      [userInfo?.phone],
    );
    return res.status(200).json({
      message: "get redenvelopes_used successfull",
      datas: redenvelopes,
      status: true,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const callback_bank = async (req, res) => {
  try {
    let transaction_id = req.body.transaction_id;
    let client_transaction_id = req.body.client_transaction_id;
    let amount = req.body.amount;
    let status = req.body.status;
    if (!transaction_id) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    if (status == 2) {
      await connection.query(
        `UPDATE recharge SET status = 1 WHERE id_order = ?`,
        [client_transaction_id],
      );
      return res.status(200).json({ message: 0, status: true });
    } else {
      return res.status(200).json({
        message: "Cancellation successful",
        status: true,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const confirmRecharge = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let client_txn_id = req.body?.client_txn_id;
    if (!client_txn_id) {
      return res.status(200).json({
        message: "client_txn_id is required",
        status: false,
        timeStamp: timeNow,
      });
    }
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [recharge] = await connection.query(
      "SELECT * FROM recharge WHERE phone = ? AND status = ? ",
      [userInfo.phone, 0],
    );
    if (recharge.length != 0) {
      const rechargeData = recharge[0];
      const date = new Date(rechargeData.today);
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yyyy = date.getFullYear();
      const formattedDate = `${dd}-${mm}-${yyyy}`;
      const apiData = {
        key: process.env.PAYMENT_KEY,
        client_txn_id: client_txn_id,
        txn_date: formattedDate,
      };
      try {
        const apiResponse = await axios.post(
          "https://api.ekqr.in/api/check_order_status",
          apiData,
        );
        const apiRecord = apiResponse.data.data;
        if (apiRecord.status === "scanning") {
          return res.status(200).json({
            message: "Waiting for confirmation",
            status: false,
            timeStamp: timeNow,
          });
        }
        if (
          apiRecord.client_txn_id === rechargeData.id_order &&
          apiRecord.customer_mobile === rechargeData.phone &&
          apiRecord.amount === rechargeData.money
        ) {
          if (apiRecord.status === "success") {
            const out = await finalizeRecharge(
              rechargeData.id_order,
              async () => ({ bonus: 0, refAmount: 0 }),
            );
            return res.status(200).json({
              message: "Successful application confirmation",
              status: true,
              datas: recharge,
            });
          } else if (
            apiRecord.status === "failure" ||
            apiRecord.status === "close"
          ) {
            await connection.query(
              `UPDATE recharge SET status = 2 WHERE id = ? AND id_order = ? AND phone = ? AND money = ?`,
              [
                rechargeData.id,
                apiRecord.client_txn_id,
                apiRecord.customer_mobile,
                apiRecord.amount,
              ],
            );
            return res.status(200).json({
              message: "Payment failure",
              status: true,
              timeStamp: timeNow,
            });
          }
        } else {
          return res.status(200).json({
            message: "Mismtach data",
            status: true,
            timeStamp: timeNow,
          });
        }
      } catch (error) {
        console.error(error);
      }
    } else {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const confirmUSDTRecharge = async (req, res) => {
  console.log(res?.body);
  console.log(res?.query);
  console.log(res?.cookies);
};

const updateRecharge = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let money = req.body.money;
    let order_id = req.body.id_order;
    let data = req.body.inputData;
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "user not found",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [utr] = await connection.query(
      "SELECT * FROM recharge WHERE `utr` = ? ",
      [data],
    );
    let utrInfo = utr[0];
    if (!utrInfo) {
      await connection.query(
        "UPDATE recharge SET utr = ? WHERE phone = ? AND id_order = ?",
        [data, userInfo.phone, order_id],
      );
      return res.status(200).json({
        message: "UTR updated",
        status: true,
        timeStamp: timeNow,
      });
    } else {
      return res.status(200).json({
        message: "UTR is already in use",
        status: false,
        timeStamp: timeNow,
      });
    }
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const userProblem = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    var { gameId, orderNo, amount, issue, utr } = req.body;
    if (orderNo == "") {
      orderNo = 0;
    } else if (utr == "") {
      utr = 0;
    }
    if (!auth) {
      return res.status(200).json({
        message: "user Not found",
        status: false,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "user not found",
        status: false,
        timeStamp: timeNow,
      });
    }
    const data = await connection.query(
      "INSERT INTO user_problem SET phone=?,user_id=?,issue=?,	amount=?,orderNo=?,utr=?,today=NOW()",
      [userInfo.phone, gameId, issue, amount, orderNo, utr],
    );
    return res.status(200).json({
      message: "Requst submited successfull",
      status: true,
      data: data,
    });
  } catch (error) {
    console.error("Error :", error.message);
    res.status(500).json({ message: "Internal server error", status: false });
  }
};

const userProblemGet = async (req, res) => {
  let auth = req.cookies.auth;
  var { id, issue } = req.body;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "user Not found",
        status: false,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!user) {
      return res.status(200).json({
        message: "user not found",
        status: false,
      });
    }
    const datas = await connection.execute(
      "SELECT * FROM user_problem WHERE user_id=? AND issue=?",
      [id, issue],
    );
    return res.status(200).json({
      message: "Requst submited successfull",
      success: true,
      data: datas[0],
    });
  } catch (error) {}
};

const adminProblemGet = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "user Not found",
        status: false,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!user) {
      return res.status(200).json({
        message: "user not found",
        status: false,
      });
    }
    const datas = await connection.execute(
      "SELECT * FROM user_problem WHERE status=0",
    );
    return res.status(200).json({
      message: "Requst submited successfull",
      success: true,
      data: datas[0],
    });
  } catch (error) {}
};

const adminProblemSubmit = async (req, res) => {
  let auth = req.cookies.auth;
  const { type, remark, id } = req.body;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "user Not found",
        status: false,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite` FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!user) {
      return res.status(200).json({
        message: "user not found",
        status: false,
      });
    }
    if (type === "confirm") {
      await connection.execute("UPDATE user_problem SET status=1 WHERE id=?", [
        id,
      ]);
      return res.status(200).json({
        message: "Requst submited successful",
        success: true,
      });
    }
    if (type === "delete") {
      await connection.execute(
        "UPDATE user_problem SET status=2,remark=? WHERE id=?",
        [remark, id],
      );
      return res.status(200).json({
        message: "Requst submited successful",
        success: true,
      });
    }
  } catch (error) {}
};

const getpromotiondata = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "user Not found",
        status: false,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone` FROM users WHERE `token` = ? ",
      [auth],
    );
    if (!user) {
      return res.status(200).json({
        message: "user not found",
        status: false,
      });
    }
    const [rows] = await connection.query(
      "SELECT * FROM promotion WHERE phone = ?",
      [user[0].phone],
    );
    if (!rows) {
      return res.status(200).json({
        message: "user not found",
        status: false,
      });
    }
    return res.status(200).json({
      message: "get promotion ",
      success: true,
      data: rows[0],
    });
  } catch (error) {
    return res.status(200).json({
      message: "internal server error",
      success: false,
      error: error.message,
    });
  }
};

const updateRandomPromotion = async (req, res) => {
  try {
    const {
      phone,
      dregister,
      damount,
      ddeposit,
      dfirst,
      tregister,
      tamount,
      tdeposit,
      tfirst,
      type,
      commission,
      weekBalance,
      totalBalance,
      direct,
      team,
    } = req.body;
    const [rows] = await connection.query(
      "SELECT * FROM promotion WHERE phone = ?",
      [phone],
    );
    const checkTime = timerJoin2(Date.now());
    if (rows?.length === 0) {
      await connection.query(
        "INSERT INTO promotion SET phone = ?,dregister=?,damount=?,ddeposit=?,dfirst=?,tregister=?,tamount=?,tdeposit=?,tfirst=?,commission=?,weekBalance=?,totalBalance=?,direct=?,team=?,time=? ",
        [
          phone,
          dregister,
          damount,
          ddeposit,
          dfirst,
          tregister,
          tamount,
          tdeposit,
          tfirst,
          commission,
          weekBalance,
          totalBalance,
          direct,
          team,
          checkTime,
        ],
      );
      return res.status(200).json({
        message: "promotion update success",
        success: true,
      });
    }
    await connection.query(
      "UPDATE promotion SET dregister=?,damount=?,ddeposit=?,dfirst=?,tregister=?,tamount=?,tdeposit=?,tfirst=?,commission=?,weekBalance=?,totalBalance=?,direct=?,team=? WHERE phone=? ",
      [
        dregister,
        damount,
        ddeposit,
        dfirst,
        tregister,
        tamount,
        tdeposit,
        tfirst,
        commission,
        weekBalance,
        totalBalance,
        direct,
        team,
        phone,
      ],
    );
    return res.status(200).json({
      message: "promotion update success",
      success: true,
    });
  } catch (error) {
    return res.status(200).json({
      message: "internal server error",
      success: false,
      error: error.message,
    });
  }
};

const makePromotion = async (req, res) => {
  try {
    const { phone, rank } = req.body;
    const [rows] = await connection.query(
      "SELECT * FROM users WHERE phone = ?",
      [phone],
    );
    if (!rows) {
      return res.status(200).json({
        message: "user not found",
        success: false,
      });
    }
    await connection.query("UPDATE users SET rank=? WHERE  phone=?", [
      rank,
      phone,
    ]);
    return res.status(200).json({
      message: "promotion update success",
      success: true,
    });
  } catch (error) {
    return res.status(200).json({
      message: "internal server error",
      success: false,
      error: error.message,
    });
  }
};

const getVipData = async (req, res) => {
  try {
    const [vipdata] = await connection.execute("SELECT * FROM vip_data");
    if (!vipdata) {
      return res.status(200).json({
        message: "user not found",
        status: false,
      });
    }
    return res.status(200).json({
      message: "get promotion ",
      success: true,
      data: vipdata,
    });
  } catch (error) {
    return res.status(200).json({
      message: "internal server error",
      success: false,
      error: error.message,
    });
  }
};

const getdailyactivyreward = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "User not found",
        status: false,
      });
    }
    const [user] = await connection.query(
      "SELECT * FROM users WHERE `token` = ?",
      [auth],
    );
    if (user.length === 0) {
      return res.status(200).json({
        message: "User not found",
        status: false,
      });
    }
    const userInfo = user[0];
    const phone = userInfo.phone;
    const today = new Date();
    const formattedToday = today.toISOString().split("T")[0];
    const formattedWeekStart = new Date();
    formattedWeekStart.setDate(today.getDate() - 6);
    const weekStartDate = formattedWeekStart.toISOString().split("T")[0];
    const [betResults] = await connection.query(
      `SELECT 
          (SELECT COALESCE(SUM(money), 0) FROM minutes_1 WHERE phone = ? AND DATE(today) = ?) +
          (SELECT COALESCE(SUM(money), 0) FROM result_k3 WHERE phone = ? AND DATE(bet_data) = ?) +
          (SELECT COALESCE(SUM(money), 0) FROM result_5d WHERE phone = ? AND DATE(bet_data) = ?) 
          AS total_daily,
          (SELECT COALESCE(SUM(money), 0) FROM minutes_1 WHERE phone = ? AND DATE(today) BETWEEN ? AND ?) +
          (SELECT COALESCE(SUM(money), 0) FROM result_k3 WHERE phone = ? AND DATE(bet_data) BETWEEN ? AND ?) +
          (SELECT COALESCE(SUM(money), 0) FROM result_5d WHERE phone = ? AND DATE(bet_data) BETWEEN ? AND ?)
          AS total_weekly`,
      [
        phone,
        formattedToday,
        phone,
        formattedToday,
        phone,
        formattedToday,
        phone,
        weekStartDate,
        formattedToday,
        phone,
        weekStartDate,
        formattedToday,
        phone,
        weekStartDate,
        formattedToday,
      ],
    );
    const totalDailyBet = betResults[0].total_daily || 0;
    const totalWeeklyBet = betResults[0].total_weekly || 0;
    const [bonusSettings] = await connection.query(
      "SELECT `id`, `betrequriment`, `bonus`, `type` FROM bonus_settings",
    );
    const [receivedBonuses] = await connection.query(
      `SELECT bonus_setting_id FROM user_bonus_history WHERE phone = ? AND received_date = ?`,
      [phone, formattedToday],
    );
    const receivedBonusIds = new Set(
      receivedBonuses.map((row) => row.bonus_setting_id),
    );
    let dailyBonusGiven = [];
    let weeklyBonusGiven = [];
    for (const setting of bonusSettings) {
      if (!receivedBonusIds.has(setting.id)) {
        if (setting.type === 1 && totalDailyBet >= setting.betrequriment) {
          await connection.query(
            `INSERT INTO user_bonus_history (user_id, phone, bonus, type, received_date, bonus_setting_id) VALUES (?, ?, ?, 1, ?, ?)`,
            [userInfo.id, phone, setting.bonus, formattedToday, setting.id],
          );
          dailyBonusGiven.push(setting.bonus);
        }
        if (setting.type === 2 && totalWeeklyBet >= setting.betrequriment) {
          await connection.query(
            `INSERT INTO user_bonus_history (user_id, phone, bonus, type, received_date, bonus_setting_id) VALUES (?, ?, ?, 2, ?, ?)`,
            [userInfo.id, phone, setting.bonus, formattedToday, setting.id],
          );
          weeklyBonusGiven.push(setting.bonus);
        }
      }
    }
    const [receivedBonuses_history] = await connection.query(
      `SELECT bonus_setting_id FROM user_bonus_history WHERE phone = ? AND received_date = ?`,
      [phone, formattedToday],
    );
    return res.status(200).json({
      message: "Get daily and weekly bet commission",
      success: true,
      totalDailyBet,
      totalWeeklyBet,
      receivedBonuses_history,
      bonusSettings,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
      error: error.message,
    });
  }
};

const dailyBetCommition = async (req, res) => {
  try {
    const phone = "0147852369";
    const today = new Date();
    const formattedToday = today.toISOString().split("T")[0];
    const [totalMoneyResult] = await connection.query(
      `SELECT
          (SELECT COALESCE(SUM(money), 0) FROM minutes_1 WHERE phone = ? AND DATE(today) = ?) +
          (SELECT COALESCE(SUM(money), 0) FROM result_k3 WHERE phone = ? AND DATE(bet_data) = ?) +
          (SELECT COALESCE(SUM(money), 0) FROM result_5d WHERE phone = ? AND DATE(bet_data) = ?)
          AS total_money`,
      [phone, "2024-12-04", phone, "2024-12-04", phone, "2024-12-04"],
    );
    const totalMoney = totalMoneyResult[0].total_money || 0;
    const commission = totalMoney * 0.12;
    const [admindata] = await connection.execute("SELECT * FROM admin");
    if (admindata.length === 0) {
      return res.status(200).json({
        message: "Admin data not found",
        status: false,
      });
    }
    return res.status(200).json({
      message: "Get daily bet commission",
      success: true,
      totalMoney,
      commission,
      userBetCommission: admindata[0].user_bet_commition,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      success: false,
      error: error.message,
    });
  }
};

const getSpinData = async (req, res) => {
  let auth = req.cookies.auth;
  const { id } = req.params;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (user.length == 0) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    const today = new Date();
    const formattedToday = today.toISOString().split("T")[0];
    const [todayRecharge] = await connection.query(
      "SELECT SUM(money) AS total_money FROM recharge WHERE phone = ? AND status = 1 AND DATE(today) = ?",
      [userInfo.phone, formattedToday],
    );
    const totalTodayRecharge = todayRecharge[0].total_money || 0;
    let sql;
    let values = [];
    if (id) {
      sql = "SELECT * FROM spin_data WHERE id = ?";
      values = [id];
    } else {
      sql = "SELECT * FROM spin_data";
    }
    const [rows] = await connection.execute(sql, values);
    if (rows.length === 0) {
      return res.status(404).json({
        message: "No data found",
        status: false,
      });
    }
    return res.status(200).json({
      message: "Spin data retrieved successfully",
      status: true,
      data: { rows, totalTodayRecharge },
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({
      message: "Internal server error",
      status: false,
      error: error.message,
    });
  }
};

const claimSpin = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (user.length === 0) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    if (userInfo.redeem_spin >= userInfo.total_spin) {
      return res.status(200).json({
        message: "Your have redeem all spin",
        success: false,
      });
    }
    const [rows] = await connection.query(`
      SELECT sec_value, sec_column FROM (
          SELECT sec1 AS sec_value, 1 AS sec_column FROM spin_data UNION ALL
            SELECT sec4, 4 FROM spin_data UNION ALL
          SELECT sec3, 3 FROM spin_data 
      ) AS sec_values
      ORDER BY sec_value ASC
      LIMIT 8;
    `);
    if (rows.length === 0) {
      return res.status(404).json({
        message: "No spin values found",
        success: false,
        data: [],
      });
    }
    const getRandomSpinValue = (spinData) => {
      const allowedValues = [0, 1];
      const randomIndex =
        allowedValues[Math.floor(Math.random() * allowedValues.length)];
      return spinData[randomIndex];
    };
    const randomSelection = getRandomSpinValue(rows);
    await connection.query(
      "UPDATE users SET money = money + ?, redeem_spin = redeem_spin + 1 WHERE phone = ?",
      [randomSelection.sec_value, userInfo.phone],
    );
    let checkTime = timerJoin2(Date.now());
    const datasql =
      "INSERT INTO transaction_history SET phone = ?, detail = ?, balance = ?, `time` = ?";
    await connection.query(datasql, [
      userInfo.phone,
      "Spin Weel Winning",
      randomSelection.sec_value,
      checkTime,
    ]);
    const datasql2 =
      "INSERT INTO wheel_spine SET phone = ?,  amount = ?,type=?, `time` = ?";
    await connection.query(datasql2, [
      userInfo.phone,
      randomSelection.sec_value,
      "Spin Weel Winning",
      checkTime,
    ]);
    return res.status(200).json({
      message: "Get daily bet commission",
      success: true,
      data: {
        value: randomSelection.sec_value,
        index: randomSelection.sec_column - 1,
      },
    });
  } catch (error) {
    console.error("Error fetching minimum values:", error);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
      error: error.message,
    });
  }
};

const redeemSpin = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (user.length == 0) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    return res.status(200).json({
      message: "Spin data retrieved successfully",
      status: true,
      data: {
        totalrecharge: userInfo.spin_recharge,
        redeamspin: userInfo.redeem_spin,
        totalspin: userInfo.total_spin,
      },
    });
  } catch (error) {
    console.error("Error fetching minimum values:", error);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
      error: error.message,
    });
  }
};

const spineHistory = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT * FROM users WHERE `token` = ? ",
      [auth],
    );
    if (user.length == 0) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    const [history] = await connection.query(
      "SELECT * FROM wheel_spine WHERE phone = ? ",
      [userInfo.phone],
    );
    return res.status(200).json({
      message: "Spin data retrieved successfully",
      status: true,
      data: history,
    });
  } catch (error) {
    console.error("Error fetching minimum values:", error);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
      error: error.message,
    });
  }
};

const searchUser = async (req, res) => {
  let auth = req.cookies.auth;
  try {
    const [userns] = await connection.query(
      "SELECT * FROM users WHERE token = ? AND veri = 1 LIMIT 1",
      [auth],
    );
    const { id_user = null, page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;
    const phone = userns[0].phone;
    const [users] = await connection.query(
      "SELECT code FROM users WHERE phone = ?",
      [phone],
    );
    if (users.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Root user not found",
      });
    }
    const rootCode = users[0].code;
    let query = `
      WITH RECURSIVE downline_tree AS (
        SELECT 
          id_user, phone, name_user, money, totalRecharge, totalWithdraw, code, invite,
          1 AS user_level
        FROM users
        WHERE invite = ?
        UNION ALL
        SELECT 
          u.id_user, u.phone, u.name_user, u.money, u.totalRecharge, u.totalWithdraw, u.code, u.invite,
          dt.user_level + 1
        FROM users u
        INNER JOIN downline_tree dt ON u.invite = dt.code
        WHERE dt.user_level < 6
      )
      SELECT * FROM downline_tree
    `;
    const params = [rootCode];
    if (id_user) {
      query += " WHERE id_user = ?";
      params.push(id_user);
    } else {
      query += " LIMIT ? OFFSET ?";
      params.push(limit, offset);
    }
    const [rows] = await connection.query(query, params);
    if (id_user && rows.length === 0) {
      return res.status(404).json({
        status: false,
        message: "User not found in downline",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Downline fetched successfully",
      page: Number(page),
      results: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching downline users:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const promotionNew = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    if (!auth) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite`, `roses_f`, `roses_f1`, `roses_today` FROM users WHERE `token` = ? ",
      [auth],
    );
    const [level] = await connection.query("SELECT * FROM level");
    if (!user) {
      return res.status(200).json({
        message: "Invalid user",
        status: false,
        timeStamp: timeNow,
      });
    }
    let userInfo = user[0];
    let selectedData = [];
    let level2to6activeuser = 0;
    const previousDate = new Date();
    previousDate.setDate(previousDate.getDate() - 1);
    const currentDate = previousDate.toISOString().slice(0, 10);
    const [promotion_data] = await connection.query(
      "SELECT * FROM `promotion_data` WHERE phone = ? AND date(date) = ? ",
      [userInfo.phone, currentDate],
    );
    const data = promotion_data[0] || {};
    return res.status(200).json({
      message: "Receive success",
      info: user,
      status: true,
      level1_count: data.direct_register || 0,
      totalDepositCount: data.direct_deposit_num || 0,
      totalDepositAmount: data.direct_deposit_amount || 0,
      firstDepositCount: data.direct_deposit_first || 0,
      level2_to_level6count: data.indirect_register || 0,
      level2_to_level6totalDepositCount: data.indirect_deposit_num || 0,
      level2_to_level6totalDepositAmount: data.indirect_deposit_amount || 0,
      level2_to_level6firstDepositCount: data.indirect_deposit_first || 0,
      total_downline_count: data.level2to6alltimeactive || 0,
      invite: {
        f1: data.levelonealltimeactive || 0,
        total_f: data.level2to6alltimeactive || 0,
      },
      currentDate: currentDate,
      timeStamp: timeNow,
    });
  } catch (error) {
    console.error("An error ommkk:", error);
    return res.status(200).json({
      message: error.message,
      status: false,
      timeStamp: timeNow,
    });
  }
};

// ======================================================================
// ZILPAY INITIATE (uses env ZILPAY_AUTH)
// ======================================================================
const zilpay = async (req, res) => {
  try {
    let auth = req.cookies.auth;
    let money = req.body.amount;
    let type = req.body.type;
    if (!auth || !money || money <= 99) {
      return res.status(200).json({
        message: "Minimum recharge 100",
        status: false,
        timeStamp: timeNow,
      });
    }
    const [user] = await connection.query(
      "SELECT `phone`, `code`,`invite`,`isdemo` FROM users WHERE `token` = ?",
      [auth],
    );
    let userInfo = user[0];
    if (!user) {
      return res.status(200).json({
        message: "Failed",
        status: false,
        timeStamp: timeNow,
      });
    }
    let checkTime = timerJoin2(Date.now());
    if (userInfo.isdemo == 1) {
      const date = new Date();
      let id_time =
        date.getUTCFullYear() +
        "" +
        date.getUTCMonth() +
        1 +
        "" +
        date.getUTCDate();
      let id_order =
        Math.floor(Math.random() * (99999999999999 - 10000000000000 + 1)) +
        10000000000000;
      money = Number(money);
      let client_transaction_id = id_time + id_order;
      const sql = `INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, isdemo=?`;
      await connection.execute(sql, [
        client_transaction_id,
        "0",
        userInfo.phone,
        money,
        type,
        1,
        checkTime,
        "1",
        checkTime,
        1,
      ]);
      await connection.execute(
        "UPDATE users SET money = money + ? WHERE phone = ? ",
        [money, userInfo.phone],
      );
      return res.status(200).json({
        message: "Demo Amount is added",
        status: false,
        timeStamp: timeNow,
      });
    }
    const domain = req.headers.host;
    const params = {
      amount: Number(money),
      auth: process.env.ZILPAY_AUTH,
      callback: `https://${domain}/api/webapi/zilpayCallback`,
      redirect_url: `https://${domain}`,
      user: userInfo.phone,
    };
    const data = await axios.post(
      "https://api.zilpay.live/api/payin2",
      params,
    );
    if (data.data.status === "success") {
      const sql = `INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, userStatus=?`;
      await connection.execute(sql, [
        data.data.order_id,
        data.data.order_id,
        userInfo.phone,
        money,
        type,
        0,
        checkTime,
        "0",
        checkTime,
        0,
      ]);
      return res.status(200).json({
        message: "",
        status: true,
        data: data.data,
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      success: false,
      error: error.message,
    });
  }
};

// ======================================================================
// RECHARGE3 (Sunpay initiate) — uses env SUNPAY secrets
// ======================================================================
const recharge3 = async (req, res) => {
  let auth = req.cookies.auth;
  let money = req.body.amount;
  let type = req.body.type;
  if (type != "cancel" && type != "submit" && type != "submitauto") {
    if (!auth || !money || money <= 199) {
      return res.status(200).json({
        message: "Minimum recharge 200",
        status: false,
        timeStamp: timeNow,
      });
    }
  }
  const [user] = await connection.query(
    "SELECT `phone`, `code`,`invite`,`isdemo` FROM users WHERE `token` = ?",
    [auth],
  );
  let userInfo = user[0];
  if (!user) {
    return res.status(200).json({
      message: "Invalid user",
      status: false,
      timeStamp: timeNow,
    });
  }
  let time = timerJoin2(Date.now());
  let checkTime = timerJoin2(Date.now());
  money = Number(money);
  const domain = req.headers.host;
  const callbackurl = `https://${domain}/api/webapi/recharge-callback`;
  const OrderIds = `WP${Date.now()}${Math.floor(Math.random() * 100000)}`;
  if (type === "UPI") {
    const params = {
      version: "1.0",
      mch_id: process.env.SUNPAY_MCH_ID || "100225570",
      mch_order_no: OrderIds,
      pay_type: "101",
      trade_amount: `${money}`,
      order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
      goods_name: "user goods_name",
      notify_url: callbackurl,
      mch_return_msg: `https://${domain}`,
    };
    params.sign = sunpaySign(params, process.env.SUNPAY_SECRET);
    params.sign_type = "MD5";
    const sunpayResponse = await axios.post(
      "https://api.watchglbpay.com/pay/web",
      new URLSearchParams(params).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    if (sunpayResponse.data.respCode === "SUCCESS") {
      const sql = `INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, userStatus=?`;
      await connection.execute(sql, [
        OrderIds,
        "0",
        userInfo.phone,
        money,
        type,
        0,
        checkTime,
        "0",
        time,
        0,
      ]);
      return res.status(200).json({
        message: "Order creation successful",
        pay: true,
        orderid: OrderIds,
        status: true,
        data: sunpayResponse.data,
        timeStamp: timeNow,
      });
    } else {
      return res.status(500).json({ message: "failed ", status: false });
    }
  }
  return res.status(200).json({
    message: "This gateway not working",
    status: true,
  });
};

// ======================================================================
// TREXOPAY INITIATE — uses env TREXO_USER_TOKEN
// ======================================================================
const initiateTrexoPayPayment = async (req, res) => {
  const auth = req.cookies.auth;
  const am = req.body.amount;
  const money = req.body.amount;
  const type = req.body.type;
  if (!auth || !money || money <= 99) {
    return res.status(200).json({
      message: "Minimum recharge 100",
      status: false,
      timeStamp: timeNow,
    });
  }
  const [user] = await connection.query(
    "SELECT `phone`, `code`,`invite`,`isdemo` FROM users WHERE `token` = ?",
    [auth],
  );
  let userInfo = user[0];
  if (!user) {
    return res.status(200).json({
      message: "Failed",
      status: false,
      timeStamp: timeNow,
    });
  }
  let checkTime = timerJoin2(Date.now());
  try {
    const orderId = getRechargeOrderId();
    const domain = req.headers.host;
    const redirect_url = `https://${domain}/api/webapi/verifyTrexoPayPayment`;
    const params = {
      customer_mobile: userInfo.phone,
      user_token: process.env.TREXO_USER_TOKEN,
      amount: am,
      order_id: orderId,
      redirect_url: redirect_url,
      remark1: "recharge",
      remark2: "wallet",
      route: 2,
    };
    const url = "https://merchant.trexopayment.com/api/create-order";
    const response = await makePostRequest(url, params);
    if (!response || typeof response.status !== "boolean") {
      return res.status(500).json({
        message: "Invalid response from TrexoPay API",
        status: false,
        timeStamp: timeNow,
      });
    }
    if (response.status === true) {
      const sql = `INSERT INTO recharge 
                SET id_order=?, transaction_id=?, phone=?, money=?, type=?, 
                    status=?, today=?, url=?, time=?, userStatus=?`;
      await connection.execute(sql, [
        orderId,
        orderId,
        userInfo.phone,
        am,
        type,
        0,
        checkTime,
        "0",
        checkTime,
        0,
      ]);
      return res.status(200).json({
        message: "TrexoPay payment URL successful",
        status: true,
        data: response.result,
      });
    }
    return res.status(400).json({
      message: "TrexoPay rejected the order",
      status: false,
      data: response,
    });
  } catch (error) {
    return res.status(500).json({
      message: `Payment initiation failed: ${error.message}`,
      status: false,
      error: error.message,
      trexopayError: error.response?.data || null,
      timeStamp: timeNow,
    });
  }
};

// ======================================================================
// PPAY INITIATE — uses env PPAY secrets
// ======================================================================
const handleRechargeppay = async (req, res) => {
  let auth = req.cookies.auth;
  let money = req.body.amount;
  let type = req.body.type;
  const timeNow = new Date().getTime();
  if (!auth || !money || money <= 99) {
    return res.status(200).json({
      message: "Minimum recharge 100",
      status: false,
      timeStamp: timeNow,
    });
  }
  const [user] = await connection.query(
    "SELECT `phone`, `code`,`invite`,`isdemo` FROM users WHERE `token` = ?",
    [auth],
  );
  let userInfo = user[0];
  if (!userInfo) {
    return res.status(200).json({
      message: "User not found",
      status: false,
      timeStamp: timeNow,
    });
  }
  let checkTime = timerJoin2(Date.now());
  let time = timerJoin2(Date.now());
  try {
    if (userInfo.isdemo == 1) {
      const date = new Date();
      let id_time =
        date.getUTCFullYear() +
        "" +
        date.getUTCMonth() +
        1 +
        "" +
        date.getUTCDate();
      let id_order =
        Math.floor(Math.random() * (99999999999999 - 10000000000000 + 1)) +
        10000000000000;
      money = Number(money);
      let client_transaction_id = id_time + id_order;
      const sql = `INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, isdemo=?`;
      await connection.execute(sql, [
        client_transaction_id,
        "0",
        userInfo.phone,
        money,
        type,
        1,
        checkTime,
        "1",
        checkTime,
        1,
      ]);
      await connection.execute(
        "UPDATE users SET money = money + ? WHERE phone = ? ",
        [money, userInfo.phone],
      );
      return res.status(200).json({
        message: "Demo Amount is added",
        status: false,
        timeStamp: timeNow,
      });
    }
    const domain = req.headers.host;
    const orderId = `PP${Date.now()}`;
    const notify_url = `https://${domain}/api/webapi/callbackdatappay`;
    const return_url = `https://${domain}`;
    const params = {
      mchNo: process.env.PPAY_MCH_NO,
      appId: process.env.PPAY_APP_ID,
      mchOrderNo: orderId,
      amount: money * 100,
      customerName: "ZhanSan",
      customerEmail: "zhangn@gmail.com",
      customerPhone: "7867986679",
      notifyUrl: notify_url,
    };
    params.sign = md5Sign2(params, process.env.PPAY_KEY);
    const response = await axios.post(
      "https://pay.ppaypros.com/api/pay/pay",
      params,
      { headers: { "Content-Type": "application/json" } },
    );
    if (response?.data?.code === 0) {
      const sql = `INSERT INTO recharge SET id_order = ?, transaction_id = ?, phone = ?, money = ?, type = ?, status = ?, today = ?, url = ?, time = ?, userStatus=?`;
      await connection.execute(sql, [
        orderId,
        "0",
        userInfo.phone,
        money,
        type,
        0,
        checkTime,
        "0",
        time,
        0,
      ]);
      return res.status(200).json({
        message: "Payment Initiated successfully",
        data: response.data?.data,
        status: true,
      });
    } else {
      return res.status(200).json({
        message: "Payment failed",
        data: response.data?.data,
        status: false,
      });
    }
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "Internal server error",
      success: false,
      error: error.response?.data || error.message,
    });
  }
};

// ======================================================================
// EXPORTS
// ======================================================================
module.exports = {
  zilpayCallback,
  zilpay,
  verifyTrexoPayPayment,
  initiateTrexoPayPayment,
  callbackdata,
  recharge3,
  handleRechargeppay,
  callbackdatappay,
  userInfo,
  searchUser,
  changeUser,
  changePassword,
  changeUserPhoto,
  promotion,
  myTeam,
  wowpay,
  recharge,
  onlineRecharge,
  handleCallback,
  recharge2,
  listRecharge,
  listWithdraw,
  checkInHandling,
  infoUserBank,
  addBank,
  withdrawal3,
  transfer,
  transferHistory,
  callback_bank,
  listMyTeam,
  verifyCode,
  aviator,
  useRedenvelope,
  getRedenvelope,
  search,
  updateRecharge,
  confirmRecharge,
  addutr,
  cancelRecharge,
  downlinerecharge,
  downlinerecharge_data,
  confirmUSDTRecharge,
  totalCommission,
  transactionHistory,
  subordinatedata,
  newSubordinateData,
  calculateDownlineBonuses,
  getRebate,
  rebateCreate,
  feedback,
  vipLevel,
  vipLevelEvery,
  totalCommission,
  vipLevelMonthly,
  aviator,
  commissiondata,
  userProblem,
  userProblemGet,
  adminProblemGet,
  adminProblemSubmit,
  getpromotiondata,
  updateRandomPromotion,
  makePromotion,
  getVipData,
  dailyBetCommition,
  getInvitationBonus,
  getSpinData,
  claimSpin,
  redeemSpin,
  getdailyactivyreward,
  spineHistory,
  listRecharge2,
  addUSDT,
  promotionNew,
  finalizeRecharge,
  tierBonus,
};