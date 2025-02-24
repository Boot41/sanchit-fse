# AI-Powered Workspace Management & Assistant

## 📌 Project Overview

This project is an **AI-powered workspace management and assistant platform** designed to replace cluttered WhatsApp groups and streamline planning and workflows. Users can create workspaces, invite team members, and collaborate through a **persistent chat system** with AI assistance. The AI assistant summarizes discussions, generates tasks, and helps in task management via natural language interactions.

## 🚀 Features

- **Workspace Management:** Users can create, join, and manage multiple workspaces.
- **Persistent Chat System:** Each workspace has a dedicated chat room with message storage and retrieval.
- **AI Assistant:** Reads messages, summarizes chats, and creates tasks automatically.
- **Task Management:** Users can create, assign, and track tasks with deadlines.
- **Real-Time Communication:** Integrated **Socket.io** for instant messaging and user presence tracking.
- **Interactive UI:** Clean, collapsible sidebar for workspace navigation.
- **Productivity Features:** Kanban board, personal task list, notifications, and more.

## 🏗️ Tech Stack

- **Frontend:** React, TailwindCSS
- **Backend:** Express.js, Node.js, Prisma ORM
- **Database:** PostgreSQL
- **Real-Time Communication:** Socket.io
- **AI Integration:** OpenAI GPT (for AI-powered chat and task automation)
- **Caching (Future Plan):** Redis for performance optimization

## ⚙️ Installation & Setup

### 1️⃣ Clone the repository:

```sh
git clone git@github.com:Boot41/sanchit-fse.git
cd sanchit-fse
```

### 2️⃣ Setup environment variables:

#### Backend Setup

```sh
.env
PORT=4000
DATABASE_URL=postgresql://name:password@postgres:5432/myapp
POSTGRES_USER=name
POSTGRES_PASSWORD=password
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=myapp
JWT_SECRET=your_secret_key
GROQ_API_KEY=your_api_key
```

#### Frontend Setup

```sh
.env
VITE_API_URL=http://localhost:4000
```
#### Home Folder Setup

```sh
.env
GROQ_API_KEY=your_api_key
```




### 4️⃣ Run the application:

#### Using Docker-Compose

```sh
docker-compose up --build
```


## 🛠️ Running Tests

To run unit tests:

```sh
npm test
```


## 🎯 Future Enhancements

- **Kanban Board for Task Management using JIRA** 📊
- **AI-Powered Auto Task Assignment** 🤖
- **Push Notifications & Reminders** 🔔
- **Performance Optimization with Redis** ⚡
- **Kafka for Real-time Event Streaming** 🛠️

## 👨‍💻 Contributing

1. Fork the repository 🍴
2. Create a new branch: `git checkout -b feature-name`
3. Make your changes and commit: `git commit -m 'Added new feature'`
4. Push to the branch: `git push origin feature-name`
5. Create a pull request 🛠️

---

Feel free to contribute and make this project even better! 🚀

