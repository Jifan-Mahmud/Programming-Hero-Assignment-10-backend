# ⚡ PulseForge API — High-Performance REST Server

<p align="center">
  <img src="https://img.shields.io/badge/Express.js-5.2-lightgrey?style=for-the-badge&logo=express&logoColor=black" alt="Express.js" />
  <img src="https://img.shields.io/badge/Node.js-LTS-green?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas_v7-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Jose_JWT-HS256-blue?style=for-the-badge" alt="Jose JWT" />
  <img src="https://img.shields.io/badge/Stripe_SDK-v23-635BFF?style=for-the-badge&logo=stripe&logoColor=white" alt="Stripe" />
  <img src="https://img.shields.io/badge/Vercel_Serverless-Ready-black?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />
</p>

<p align="center">
  <strong>PulseForge Backend</strong> is a scalable, secure RESTful API built on Express.js 5 and MongoDB Atlas. Engineered with Jose JWT authentication delivered via HTTPOnly cookies, role-based access control, Stripe payment intent lifecycle, and complete serverless compatibility with Vercel.
</p>

<p align="center">
  <a href="https://pulseforge-api.vercel.app">📡 Live API Base</a> •
  <a href="https://pulseforge-fitness.vercel.app">🌐 Live Frontend Client</a> •
  <a href="https://github.com/Jifan-Mahmud/Programming-Hero-Assignment-10-frontend">💻 Frontend Repository</a>
</p>

---

## 🌐 Live Endpoints & Repositories

| Resource | URL |
|---|---|
| **Live API Endpoint** | [https://pulseforge-api.vercel.app](https://pulseforge-api.vercel.app) |
| **Live Frontend Client** | [https://pulseforge-fitness.vercel.app](https://pulseforge-fitness.vercel.app) |
| **Backend GitHub Repo** | [Programming-Hero-Assignment-10-backend](https://github.com/Jifan-Mahmud/Programming-Hero-Assignment-10-backend) |
| **Frontend GitHub Repo** | [Programming-Hero-Assignment-10-frontend](https://github.com/Jifan-Mahmud/Programming-Hero-Assignment-10-frontend) |

---

## 🛡️ Security Architecture & Highlights

- **Jose JWT Engine (`jose-cjs`):** Fast HS256-signed JWT tokens delivered via secure **HTTPOnly cookies** (`pulseforge_token`) and Bearer Authorization headers.
- **Three-Tier Middleware Security:**
  - `verifyToken`: Validates cryptographic signature and ensures token is active.
  - `verifyAdmin`: Verifies administrative permissions.
  - `verifyTrainer`: Verifies trainer and admin authorizations.
- **Soft-Block Protection:** Blocked users retain read-only browsing capability while all state mutations (creating bookings, applying as trainer, commenting) are halted with `403 Forbidden`.
- **Environment Isolation:** Zero hardcoded credentials or database names; all configuration is parsed directly from environment variables.
- **CORS Management:** Strict origin whitelisting allowing local development and authorized production Vercel domains with credentials enabled.
- **Password Security:** Multi-round `bcrypt` password hashing.

---

## 📡 REST API Specification

### 💬 1-on-1 Chat Endpoints
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/api/chat/conversations` | Authenticated | Retrieve active chat conversations |
| `POST` | `/api/chat/start` | Authenticated | Initiate new 1-on-1 chat with trainer/member |
| `GET` | `/api/chat/messages/:id` | Authenticated | Fetch message history for a conversation |
| `POST` | `/api/chat/messages` | Authenticated | Send direct message and increment unread count |
| `PATCH` | `/api/chat/read/:id` | Authenticated | Mark conversation as read |

### 🥗 Diet & Workout Tracker Endpoints
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/api/plans/my-plan` | Authenticated | Fetch assigned diet and workout protocol |
| `POST` | `/api/plans/assign` | Trainer / Admin | Assign or update custom macro & workout plan for an athlete |
| `GET` | `/api/plans/trainer/clients` | Trainer / Admin | Retrieve enrolled athletes across trainer's classes |
| `GET` | `/api/plans/log/:date` | Authenticated | Fetch athlete daily checklist log for date |
| `POST` | `/api/plans/log` | Authenticated | Check off meals, workouts, and log daily water intake |

### 📈 Body Transformation & Progress Endpoints
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/api/progress/my` | Authenticated | Fetch weigh-in and body composition history |
| `POST` | `/api/progress/log` | Authenticated | Log new weight, body fat %, and tape measurements |
| `DELETE` | `/api/progress/:id` | Authenticated | Remove measurement record |

### ⭐ Reviews & Ratings Endpoints
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/api/reviews/class/:id` | Public | Fetch reviews, average star rating, and breakdown bars |
| `POST` | `/api/reviews` | Authenticated | Post verified athlete review and recalculate class rating |
| `GET` | `/api/reviews/featured` | Public | Top 5-star athlete testimonials for homepage showcase |

### 🔐 Authentication & Session
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `POST` | `/api/auth/jwt-token` | Public | Issues signed JWT token based on verified user session |
| `POST` | `/api/auth/logout` | Public | Clears the HTTPOnly `pulseforge_token` cookie |

### 🏋️ Fitness Classes
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/api/classes` | Public | Paginated list of approved classes with regex search & category filter |
| `GET` | `/api/classes/:id` | Public | Retrieve class details by MongoDB ObjectId |
| `POST` | `/api/classes` | Trainer / Admin | Create new training class (defaults to `pending`) |
| `PUT` | `/api/classes/:id` | Trainer / Admin | Update class schedule, price, or description |
| `DELETE` | `/api/classes/:id` | Trainer / Admin | Delete class record |
| `GET` | `/api/trainer/classes` | Trainer / Admin | Retrieve classes created by the authenticated trainer |
| `GET` | `/api/classes/:id/students` | Trainer / Admin | Retrieve enrolled student attendee roster for a class |

### 💳 Bookings & Payments
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `POST` | `/api/stripe/create-payment-intent` | Authenticated | Initialize Stripe payment intent with amount and metadata |
| `POST` | `/api/bookings` | Authenticated | Create confirmed booking record after successful checkout |
| `GET` | `/api/bookings/my` | Authenticated | Retrieve authenticated athlete's booking history |
| `GET` | `/api/bookings/check` | Authenticated | Pre-flight check preventing duplicate booking for the same class |

### 💬 Community Forum
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/api/forum` | Public | Paginated list of community articles |
| `GET` | `/api/forum/:id` | Public | Retrieve single forum article with threaded comments |
| `POST` | `/api/forum` | Trainer / Admin | Publish new fitness science or workout article |
| `POST` | `/api/forum/:id/vote` | Authenticated | Cast upvote or downvote (1 vote per user) |
| `POST` | `/api/forum/:id/comments` | Authenticated | Add discussion comment |
| `PUT` | `/api/forum/:id/comments/:commentId` | Authenticated | Edit personal comment |
| `DELETE` | `/api/forum/:id/comments/:commentId` | Authenticated | Delete personal comment |

### 🛡️ Admin Management & Analytics
| Method | Endpoint | Access | Description |
|---|---|:---:|---|
| `GET` | `/api/admin/users` | Admin | List all registered platform users with roles |
| `PATCH` | `/api/admin/users/:id/block` | Admin | Toggle soft-block restriction |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Promote user to Admin or demote Trainer |
| `GET` | `/api/admin/trainer-applications` | Admin | List pending trainer accreditation applications |
| `PATCH` | `/api/admin/trainer-applications/:id` | Admin | Approve or reject trainer application with feedback |
| `GET` | `/api/admin/classes` | Admin | Review all pending and approved classes |
| `PATCH` | `/api/admin/classes/:id/status` | Admin | Approve or reject pending class |
| `GET` | `/api/admin/transactions` | Admin | Full Stripe transaction audit trail |
| `GET` | `/api/admin/analytics` | Admin | Aggregated monthly revenue and category popularity metrics |

---

## 🗄️ Database Collections Overview

- **`users`**: User credentials, role (`user`, `trainer`, `admin`), status (`active`, `blocked`), profile metadata.
- **`classes`**: Title, description, category, price, duration, schedule, status (`pending`, `approved`, `rejected`), trainer info.
- **`bookings`**: Class reference, user reference, transaction ID, payment amount, slot date, timestamp.
- **`favorites`**: Class bookmarks saved by athletes.
- **`trainer_applications`**: Applicant credentials, experience, certifications, review status, admin critique feedback.
- **`forum_posts`**: Title, article body, category, author info, votes array, comments array with replies.

---

## ⚙️ Environment Variables Setup (`.env`)

Create a `.env` file in the `backend` directory:

```env
# Server Configuration
PORT=5000
FRONTEND_URL=http://localhost:3000

# Database
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
DB_NAME=pulseforge_db

# Security
JWT_SECRET=your_super_secret_jwt_key_here

# Stripe Integration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## 🚀 Running Locally

```bash
# 1. Navigate to backend folder
cd backend

# 2. Install dependencies
npm install

# 3. Seed demo classes, forum posts, and default accounts
npm run seed

# 4. Start local development server with nodemon
npm run dev
```
> Server will listen on **`http://localhost:5000`**.

---

## ☁️ Vercel Serverless Configuration

The backend is configured for Vercel Serverless Functions using `@vercel/node` via `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```

And `index.js` exports the Express instance:
```javascript
module.exports = app;
```

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
