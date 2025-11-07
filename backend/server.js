const express = require("express");
const connectDB = require("./config/db");
const dotenv = require("dotenv");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { 
  createAccountLimiter, 
  loginLimiter, 
  generalLimiter, 
  advancedMongoSanitize, 
  validateInput, 
  securityHeaders 
} = require("./middleware/securityMiddleware");
const path = require("path");
const helmet = require("helmet");
const cors = require("cors");

dotenv.config({ path: path.join(__dirname, '../.env') });

// Validate required environment variables
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please copy .env.example to .env and configure your environment variables.');
  process.exit(1);
}

connectDB();
const app = express();

app.use(helmet());
app.use(securityHeaders);
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));

// Input sanitization and validation
app.use(advancedMongoSanitize); // MongoDB injection prevention
app.use(validateInput); // Input validation for malicious content

app.use("/api/user/register", createAccountLimiter); // Rate limit registration
app.use("/api/user/login", loginLimiter); // Rate limit login
app.use("/api/", generalLimiter); // General rate limiting for all API routes

app.use(express.json({ limit: '10mb' })); // to accept json data with size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // to accept form data


app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);



const __dirname1 = path.resolve();

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname1, "/frontend/build")));

  app.get("*", (req, res) =>
    res.sendFile(path.resolve(__dirname1, "frontend", "build", "index.html"))
  );
} else {
  app.get("/", (req, res) => {
    res.send("API is running..");
  });
}


// Error Handling middlewares
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(` Server running on PORT ${PORT}...`.yellow.bold);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle server startup errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(` Port ${PORT} is already in use. Please use a different port.`);
  } else {
    console.error(' Server startup error:', error.message);
  }
  process.exit(1);
});

const io = require("socket.io")(server, {
  pingTimeout: 60000,
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
});

// In-memory call room registry: roomId -> Map<userId, socketId>
const getCallRoomMap = () => {
  if (!global.__CALL_ROOMS__) global.__CALL_ROOMS__ = new Map();
  return global.__CALL_ROOMS__;
};

io.on("connection", (socket) => {
  console.log("Connected to socket.io");
  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.emit("connected");
  });

  socket.on("join chat", (room) => {
    socket.join(room);
    console.log("User Joined Room: " + room);
  });
  socket.on("typing", (room) => socket.in(room).emit("typing"));
  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  socket.on("new message", (newMessageRecieved) => {
    var chat = newMessageRecieved.chat;

    if (!chat.users) return console.log("chat.users not defined");

    chat.users.forEach((user) => {
      if (user._id == newMessageRecieved.sender._id) return;

      socket.in(user._id).emit("message recieved", newMessageRecieved);
    });
  });

  // --- Call invite events (ring/accept/reject/cancel) ---
  // Initiate a call: notify recipients in their personal rooms (userId)
  socket.on("call:initiate", ({ roomId, fromUser, recipients, isGroup }) => {
    try {
      if (Array.isArray(recipients)) {
        recipients.forEach((uid) => {
          if (uid === fromUser._id) return;
          socket.in(uid).emit("call:incoming", {
            roomId,
            fromUser,
            isGroup,
          });
        });
      }
    } catch (e) {
      console.error("call:initiate error", e);
    }
  });

  // Recipient accepted the call
  socket.on("call:accept", ({ roomId, fromUserId, userId }) => {
    socket.in(fromUserId).emit("call:accepted", { roomId, userId });
  });

  // Recipient rejected the call
  socket.on("call:reject", ({ roomId, fromUserId, userId }) => {
    socket.in(fromUserId).emit("call:rejected", { roomId, userId });
  });

  // Caller cancels the ringing
  socket.on("call:cancel", ({ roomId, recipients, fromUserId }) => {
    try {
      if (Array.isArray(recipients)) {
        recipients.forEach((uid) => {
          if (uid === fromUserId) return;
          socket.in(uid).emit("call:canceled", { roomId, fromUserId });
        });
      }
    } catch (e) {
      console.error("call:cancel error", e);
    }
  });

  // --- Video call signaling events ---
  socket.on("call:join", ({ roomId, userId, name }) => {
    try {
      const rooms = getCallRoomMap();
      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      const room = rooms.get(roomId);
      room.set(userId, socket.id);
      socket.join(roomId);

      // Notify current participants to prepare for new peer
      socket.to(roomId).emit("call:user-joined", { userId, name });

      // Send list of existing participants to the joiner
      const existing = Array.from(room.keys()).filter((id) => id !== userId);
      socket.emit("call:users-in-room", { users: existing });
    } catch (e) {
      console.error("call:join error", e);
    }
  });

  socket.on("call:offer", ({ roomId, fromUserId, toUserId, offer }) => {
    const rooms = getCallRoomMap();
    const room = rooms.get(roomId);
    if (!room) return;
    const targetSocketId = room.get(toUserId);
    if (targetSocketId) {
      socket.to(targetSocketId).emit("call:offer", { fromUserId, offer });
    }
  });

  socket.on("call:answer", ({ roomId, fromUserId, toUserId, answer }) => {
    const rooms = getCallRoomMap();
    const room = rooms.get(roomId);
    if (!room) return;
    const targetSocketId = room.get(toUserId);
    if (targetSocketId) {
      socket.to(targetSocketId).emit("call:answer", { fromUserId, answer });
    }
  });

  socket.on("call:ice", ({ roomId, fromUserId, toUserId, candidate }) => {
    const rooms = getCallRoomMap();
    const room = rooms.get(roomId);
    if (!room) return;
    const targetSocketId = room.get(toUserId);
    if (targetSocketId) {
      socket.to(targetSocketId).emit("call:ice", { fromUserId, candidate });
    }
  });

  socket.on("call:leave", ({ roomId, userId }) => {
    const rooms = getCallRoomMap();
    const room = rooms.get(roomId);
    if (room) {
      room.delete(userId);
      socket.leave(roomId);
      socket.to(roomId).emit("call:user-left", { userId });
      if (room.size === 0) rooms.delete(roomId);
    }
  });

  socket.off("setup", () => {
    console.log("USER DISCONNECTED");

    socket.leaveAll();
  });

  socket.on("disconnect", () => {
    const rooms = getCallRoomMap();
    for (const [roomId, room] of rooms.entries()) {
      for (const [userId, sockId] of room.entries()) {
        if (sockId === socket.id) {
          room.delete(userId);
          socket.to(roomId).emit("call:user-left", { userId });
        }
      }
      if (room.size === 0) rooms.delete(roomId);
    }
  });
});
