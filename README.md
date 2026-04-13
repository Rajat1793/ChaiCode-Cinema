# ChaiCode Cinema

A simplified movie seat booking platform built for the **ChaiCode Hackathon**. Users can register, login and book seats for a movie. Built on top of the provided starter code by adding an authentication layer and protected booking flow.

Live demo: [ChaiCode Cinema](https://chaicode-cinema.onrender.com/)

---

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (hosted on Render)
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **Frontend:** Vanilla JS + Tailwind CSS

---

## Features

- User registration with hashed passwords
- User login returning a JWT token
- Auth middleware protecting booking endpoints
- Seat booking tied to the logged-in user
- Duplicate seat booking prevention (DB transaction + FOR UPDATE lock)
- Responsive seat grid UI with login/register screen
- Auto-login on page refresh if token is still valid
- DB reset utility script

---

## Project Structure

```
├── index.mjs        # Main Express server
├── index.html       # Frontend UI
├── migrate.mjs      # Creates tables and seeds seat data
├── reset-db.mjs     # Clears all users and resets seats
├── package.json
├── .env             # Local environment variables (not committed)
└── .gitignore
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- PostgreSQL (or Docker)

### 1. Clone the repo

```bash
git clone https://github.com/Rajat1793/BookMyTicket.git
cd BookMyTicket
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the root:

```env
JWT_SECRET=your_secret_key_here
PORT=8080
DATABASE_URL=postgresql://user:password@host:port/dbname
```

### 4. Run PostgreSQL with Docker (optional)

```bash
docker run -d \
  --name pg-bookticket \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=sql_class_2_db \
  -p 5433:5432 \
  postgres:16
```

Then set `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/sql_class_2_db` in `.env`.

### 5. Run migrations

```bash
node migrate.mjs
```

This creates the `users` table and seeds 50 seats.

### 6. Start the server

```bash
node index.mjs
```

Open `http://localhost:8080`

---

## API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/` | No | Serves the frontend |
| `GET` | `/seats` | No | Get all seats with booking status |
| `POST` | `/register` | No | Register a new user |
| `POST` | `/login` | No | Login and receive JWT token |
| `GET` | `/me` | Yes | Get logged-in user's profile |
| `PUT` | `/book/:id` | Yes | Book a seat by seat ID |
| `PUT` | `/:id/:name` | Yes | Original booking endpoint (kept for compatibility) |

### Auth Header

Protected endpoints require:
```
Authorization: Bearer <token>
```

---

## Example Usage

```bash
# Register
curl -X POST http://localhost:8080/register \
  -H "Content-Type: application/json" \
  -d '{"username":"raj","email":"raj@test.com","password":"secret123"}'

# Login
curl -X POST http://localhost:8080/login \
  -H "Content-Type: application/json" \
  -d '{"email":"raj@test.com","password":"secret123"}'

# Book a seat (use token from login response)
curl -X PUT http://localhost:8080/book/5 \
  -H "Authorization: Bearer <your_token>"
```

---

## Database Utilities

```bash
# Create tables and seed data
node migrate.mjs

# Reset all users and unbook all seats (dry run)
node reset-db.mjs

# Reset with confirmation
node reset-db.mjs --confirm
```

---

## Deployment

Hosted on **Render** (Web Service).

**Required environment variables on Render:**

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Internal Render PostgreSQL URL |
| `JWT_SECRET` | A strong random secret string |
| `PORT` | `8080` |

**Build Command:** `npm install`  
**Start Command:** `node index.mjs`
