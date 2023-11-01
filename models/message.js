const mongoose = require("mongoose");

const messageScheme = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  recipentId: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  messageType: {
    type: String,
    enum: ["text", "image"],
  },
  message: String,
  imageUrl: String,
  timeStamp: {
    type: Date,
    default: Date.now,
  },
});

const Message = mongoose.model("Message", messageScheme);

module.exports = Message;
