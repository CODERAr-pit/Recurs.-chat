const mongoose = require("mongoose");
const colors = require("colors");

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // 5 second timeout
      socketTimeoutMS: 45000, // 45 second timeout
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(` MongoDB Connected: ${conn.connection.host}`.cyan.underline);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error(` MongoDB connection error: ${err.message}`.red.bold);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected'.yellow.bold);
    });

  } catch (error) {
    console.error(` MongoDB connection failed: ${error.message}`.red.bold);
    console.error('Please ensure MongoDB is running and MONGO_URI is correct');
    process.exit(1);
  }
};

module.exports = connectDB;

