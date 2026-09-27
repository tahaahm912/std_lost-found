# 🎓 Student Lost & Found

A web-based **Lost & Found platform for university students** that makes it easier to report lost items, post found items, discover potential matches, and submit claims to recover belongings.

The application is built with **Node.js, Express.js, HTML, CSS, JavaScript, and PostgreSQL/SQLite**.

## 📌 Overview

Students often lose personal belongings such as wallets, ID cards, books, phones, chargers, keys, and other items around campus. Traditional methods such as WhatsApp groups or word-of-mouth can make it difficult to find or return these items.

**Student Lost & Found** provides a centralized platform where students can:

* Report items they have lost
* Report items they have found
* Browse available lost and found items
* Search for relevant items
* Identify potential matches
* Submit claims for found items
* Manage their reported items

The system is designed specifically for a university environment and provides a simple way to connect people who have lost items with people who have found them.

## ✨ Features

### 🔍 Lost & Found Listings

Users can create listings for:

* Lost items
* Found items
* Item name and description
* Category
* Location
* Date and other relevant information

### 🤝 Potential Match Detection

The system analyzes lost and found listings and identifies items that may correspond to each other.

Potential matches help users find relevant listings without manually searching through every item.

### 📋 Claim System

Users can submit a claim when they believe a found item belongs to them.

Claims can be reviewed and managed before an item is returned.

### 🔎 Search & Filtering

Users can browse and search through available listings to quickly find relevant items.

### 👤 User Management

The application provides user functionality for managing submitted items and claims.

### 🛡️ Admin Management

Administrators can manage the platform and review submitted information.

### 💾 Database Support

The application supports:

* **PostgreSQL** for production/database deployments
* **SQLite** as a local fallback when PostgreSQL configuration is not provided

## 🛠️ Tech Stack

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Node.js
* Express.js

### Database

* PostgreSQL
* SQLite fallback

### Development Tools

* Git
* GitHub
* npm

## 📁 Project Structure

```text
std_lost-found/
│
├── database/
│   └── Database configuration and database-related files
│
├── public/
│   ├── HTML files
│   ├── CSS files
│   ├── JavaScript files
│   └── Frontend assets
│
├── routes/
│   └── Application/API routes
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── server.js
└── README.md
```

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:

* [Node.js](https://nodejs.org/)
* npm
* Git

PostgreSQL is optional if you want to use the application's SQLite fallback.

## 📥 Installation

Clone the repository:

```bash
git clone https://github.com/tahaahm912/std_lost-found.git
```

Navigate into the project:

```bash
cd std_lost-found
```

Install dependencies:

```bash
npm install
```

## ⚙️ Environment Configuration

Create a `.env` file using the provided example:

```bash
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Open `.env` and configure the required values, including the administrator credentials.

If PostgreSQL is being used, add the required PostgreSQL configuration as specified in `.env.example`.

If PostgreSQL settings are left blank, the application can use its local SQLite fallback.

## ▶️ Running the Application

Start the development server:

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:3000
```

Open the URL in your browser to use the application.

## 🔄 How It Works

```text
        ┌─────────────────────┐
        │       Student       │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │  Report Lost/Found  │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │      Database       │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │ Potential Matching  │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │    Submit Claim     │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │  Claim Verification │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────┐
        │   Item Recovered    │
        └─────────────────────┘
```

## 🎯 Use Cases

The platform can be used in:

* Universities
* Colleges
* Schools
* Student communities
* Campus organizations
* Educational institutions

Typical items include:

* ID cards
* Wallets
* Mobile phones
* Laptops
* Chargers
* Books
* Keys
* Bags
* Documents
* Accessories

## 🔐 Security

The application uses environment variables for sensitive configuration.

**Do not commit your `.env` file to GitHub.**

Use `.env.example` as a template for required configuration.

## 🌱 Future Improvements

Possible future improvements include:

* Email notifications
* Real-time notifications
* Image-based item matching
* Improved matching algorithms
* Location-based search
* User-to-user messaging
* Mobile application
* University authentication
* QR codes for recovered items
* Advanced admin dashboard
* Item recovery history

## 🤝 Contributing

Contributions and suggestions are welcome.

1. Fork the repository
2. Create a new branch

```bash
git checkout -b feature/your-feature
```

3. Make your changes
4. Commit your changes

```bash
git commit -m "Add your feature"
```

5. Push the branch

```bash
git push origin feature/your-feature
```

6. Open a Pull Request

## 📄 License

This project is intended for educational and university project purposes.

## 👨‍💻 Author

**Taha Khan**

GitHub: [@tahaahm912](https://github.com/tahaahm912)

---

⭐ If you find this project useful, consider giving the repository a star.
