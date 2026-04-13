//  CREATE TABLE seats (
//      id SERIAL PRIMARY KEY,
//      name VARCHAR(255),
//      isbooked INT DEFAULT 0
//  );
// INSERT INTO seats (isbooked)
// SELECT 0 FROM generate_series(1, 20);

import "dotenv/config";
import express from "express";
import pg from "pg";
import { dirname } from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const __dirname = dirname(fileURLToPath(import.meta.url));

const port = process.env.PORT || 8080;

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL env var is not set. Exiting.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com") ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT) || 0,
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 0,
});

// Authentication using middleware
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).send({ error: "No token provided" });
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, iat, exp }
    next();
  } catch (err) {
    return res.status(401).send({ error: "Invalid or expired token" });
  }
}

const app = new express();
app.use(cors());
app.use(express.json()); // to parse JSON request bodies
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
//get all seats
app.get("/seats", async (req, res) => {
  const result = await pool.query("select * from seats"); // equivalent to Seats.find() in mongoose
  res.send(result.rows);
});

// register a user by taking username, email and password
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    // hash the password before storing it in the database
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10);
    const password_hash = await bcrypt.hash(password, salt);
    const sql = "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)";
    await pool.query(sql, [username, email, password_hash]);
    res.status(201).send({ message: "User registered successfully" });
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return res.status(409).send({ error: "Username or email already exists" });
    }
    res.status(500).send({ error: "Registration failed" });
  }
}); 

// login a user by taking email and password, if successful return a JWT token
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const sql = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(sql, [email]);
    if (result.rowCount === 0) {
      return res.status(400).send({ error: "Invalid email or password" });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).send({ error: "Invalid email or password" });
    }
    // generate JWT token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "1h" });
    res.send({ token });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Login failed" });
  }
});

// get logged-in user's profile
app.get("/me", authenticate, async (req, res) => {
  const result = await pool.query("SELECT id, username, email FROM users WHERE id = $1", [req.user.id]);
  if (result.rowCount === 0) return res.status(404).send({ error: "User not found" });
  res.send(result.rows[0]);
});

// protected book a seat endpoint - requires JWT token
// user identity comes from the token, not the URL
app.put("/book/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    // get the username from the DB using the id stored in the JWT
    const userResult = await pool.query("SELECT username FROM users WHERE id = $1", [req.user.id]);
    if (userResult.rowCount === 0) {
      return res.status(401).send({ error: "User not found" });
    }
    const name = userResult.rows[0].username;

    const conn = await pool.connect();
    await conn.query("BEGIN");
    const sql = "SELECT * FROM seats WHERE id = $1 AND isbooked = 0 FOR UPDATE";
    const result = await conn.query(sql, [id]);
    if (result.rowCount === 0) {
      await conn.query("ROLLBACK");
      conn.release();
      return res.status(409).send({ error: "Seat already booked" });
    }
    const sqlU = "UPDATE seats SET isbooked = 1, name = $2 WHERE id = $1";
    await conn.query(sqlU, [id, name]);
    await conn.query("COMMIT");
    conn.release();
    res.send({ message: "Seat booked successfully", seat: id, bookedBy: name });
  } catch (ex) {
    console.log(ex);
    res.status(500).send({ error: "Booking failed" });
  }
});

//book a seat give the seatId and your name (original unprotected endpoint - kept for compatibility)

app.put("/:id/:name", async (req, res) => {
  try {
    const id = req.params.id;
    const name = req.params.name;
    // payment integration should be here
    // verify payment
    const conn = await pool.connect(); // pick a connection from the pool
    //begin transaction
    // KEEP THE TRANSACTION AS SMALL AS POSSIBLE
    await conn.query("BEGIN");
    //getting the row to make sure it is not booked
    /// $1 is a variable which we are passing in the array as the second parameter of query function,
    // Why do we use $1? -> this is to avoid SQL INJECTION
    // (If you do ${id} directly in the query string,
    // then it can be manipulated by the user to execute malicious SQL code)
    const sql = "SELECT * FROM seats where id = $1 and isbooked = 0 FOR UPDATE";
    const result = await conn.query(sql, [id]);

    //if no rows found then the operation should fail can't book
    // This shows we Do not have the current seat available for booking
    if (result.rowCount === 0) {
      res.send({ error: "Seat already booked" });
      return;
    }
    //if we get the row, we are safe to update
    const sqlU = "update seats set isbooked = 1, name = $2 where id = $1";
    const updateResult = await conn.query(sqlU, [id, name]); // Again to avoid SQL INJECTION we are using $1 and $2 as placeholders

    //end transaction by committing
    await conn.query("COMMIT");
    conn.release(); // release the connection back to the pool (so we do not keep the connection open unnecessarily)
    res.send(updateResult);
  } catch (ex) {
    console.log(ex);
    res.send(500);
  }
});

app.listen(port, () => console.log("Server starting on port: " + port));
