


<div align="center">
 

  # 🖥️ TrainLib Server
  ### The Robust REST API Engine for TrainLib Platform

  [![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org/)
  [![Express](https://img.shields.io/badge/Express.js-4.x-000000?style=flat-square&logo=express)](https://expressjs.com/)
  [![MongoDB](https://img.shields.io/badge/MongoDB-7.3-47A248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
  [![Better Auth](https://img.shields.io/badge/Better--Auth-1.6-orange?style=flat-square)](https://better-auth.com/)
  [![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=flat-square&logo=stripe)](https://stripe.com/)
</div>

---

## 📖 Overview

This repository houses the core backend architecture for **TrainLib**. Built on top of Node.js and Express.js, this server handles complex database transactions, manages secure JWT sessions via Better Auth, processes subscriptions/payments through Stripe, and serves data visualizations efficiently.

---

## ⚡ Core Functionalities

* **Secure Authentication:** Seamless token validation and registration operations synced via Better Auth ecosystem.
* **Role-Based Middlewares:** Dynamic access controls verifying whether an incoming request belongs to a standard `User`, a `Trainer`, or an `Admin`.
* **Soft-Block Guard:** Middleware layer that intercepts requests from restricted accounts to inhibit data mutations while permitting safe GET requests.
* **Payment Pipelines:** Deep API integrations with Stripe SDK for reliable client-token generation and instant transaction indexing.
* **Advanced Aggregations:** Complex MongoDB pipelines tailored to aggregate application analytics, user stats, and financial growth graphs using Recharts.

---

## 🛠️ Tech Stack & Dependencies

* **Runtime Environment:** Node.js
* **Backend Framework:** Express.js (v4.x)
* **Database Driver:** MongoDB (v7.3.0)
* **Authentication Engine:** Better Auth (v1.6.19)
* **Payment Gateway:** Stripe SDK (v22.2.1)
* **Utility Packages:** CORS, Dotenv

---

## 🚀 Getting Started

### Prerequisites
Ensure you have the following installed and set up:
* **Node.js** (v18.0.0 )
* **MongoDB Atlas** Cluster
* **Stripe** Developer Account Keys

### Installation & Local Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/yourusername/trainlib-server.git](https://github.com/yourusername/trainlib-server.git)
   cd trainlib-server

```

2. **Install node modules:**
```bash
npm install

```


3. **Configure Environment Variables:**
Create a `.env` file in the root directory and fill out the configuration:



4. **Boot up the server:**
```bash
# Production mode
node index.js

# Development mode (If nodemon is configured)
npm run dev

```


The backend engine should now be running locally on `http://localhost:5000`.

---


## 🌐 Deployment

The production server is architected to deploy flawlessly as Serverless Functions on **Vercel**.



*Note: Remember to inject all required `.env` keys inside the Vercel Project Dashboard settings before running deployments.*

---

## 👨‍💻 Author

**Shafiqul Islam Nayem**


---
