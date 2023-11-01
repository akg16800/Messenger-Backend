const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const passport = require("passport");
const cors = require("cors");
const LocalStrategy = require("passport-local").Strategy;
const jwt = require("jsonwebtoken");

const app = express();
const port = 8000;
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const cloudinary = require("cloudinary").v2;
const dotenv = require("dotenv");

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_ACCESS_KEY,
});

mongoose
  .connect("mongodb+srv://abhayakg:abhay@cluster0.fyaoumx.mongodb.net/", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("mongo db is connected");
  })
  .catch((err) => {
    console.log("error is", err);
  });

app.listen(port, () => {
  console.log("Server listening on 8000 port");
});

const User = require("./models/user");
const Message = require("./models/message");

const createToken = (userId) => {
  const payload = {
    userId: userId,
  };

  const token = jwt.sign(payload, "abhayisgreat", {
    expiresIn: "1d",
  });

  return token;
};

app.post("/register", (req, res) => {
  const { name, email, password, image } = req.body;

  const newUser = new User({ name, email, password, image });

  newUser
    .save()
    .then(() => {
      res.status(200).json({ message: "User registered successfully" });
    })
    .catch((err) => {
      console.log("error while registering", err);
      res.status(500).json({ message: "Error registering the user" });
    });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(404).json({ message: "Email and password is required" });
  }

  User.findOne({ email })
    .then((user) => {
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.password !== password) {
        return res.status(404).json({ message: "Invalid Password" });
      }

      const token = createToken(user._id);
      res.status(200).json({ token });
    })
    .catch((err) => {
      console.log("error while logging", err);
      res.status(500).json({ message: "internal servor error" });
    });
});

app.get("/users/:tokenId", (req, res) => {
  // const loggedInuserId = req.params.userId;
  const token = req.params.tokenId;

  const decodedToken = jwt.verify(token, "abhayisgreat");
  console.log("decoded value is", decodedToken.userId);
  const loggedInuserId = decodedToken.userId;

  User.find({ _id: { $ne: loggedInuserId } })
    .then((users) => {
      const result = {
        users: users,
        userId: loggedInuserId,
      };
      res.status(200).json(result);
    })
    .catch((err) => {
      console.log("Error retrieving the users", err);
      res.status(500).json({ message: "Error retrieving the users" });
    });
});

app.post("/friend-request", async (req, res) => {
  const { currentUserId, selectedUserId } = req.body;
  try {
    await User.findByIdAndUpdate(selectedUserId, {
      $push: { friendRequest: currentUserId },
    });

    await User.findByIdAndUpdate(currentUserId, {
      $push: { sentFriendRequests: selectedUserId },
    });
    console.log("succesffuly sended");
    res.sendStatus(200);
  } catch (err) {
    console.log("err in request", err);
    res.sendStatus(500);
  }
});

app.get("/friend-request/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("friendRequest", "name email image")
      .lean();
    const friendRequests = user.friendRequest;
    res.json(friendRequests);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/friend-request/accept", async (req, res) => {
  try {
    const { senderId, recipentId } = req.body;

    const sender = await User.findById(senderId);
    const recipent = await User.findById(recipentId);

    sender.friends.push(recipentId);
    recipent.friends.push(senderId);

    recipent.friendRequest = recipent.friendRequest.filter(
      (request) => request.toString() !== senderId.toString(),
    );

    sender.sentFriendRequests = recipent.sentFriendRequests.filter(
      (request) => request.toString() !== recipentId.toString(),
    );

    await sender.save();
    await recipent.save();

    res.status(200).json({ message: "Friend Request accepted" });
  } catch (err) {
    console.log(err);
  }
});

app.get("/accepted-friends/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate(
      "friends",
      "name email image",
    );

    const acceptedFriends = user.friends;
    console.log("accepted friends", acceptedFriends);
    res.status(200).json(acceptedFriends);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal servor error" });
  }
});

const multer = require("multer");
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "files/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

//endpoint to post messages and store it into backend
app.post("/messages", upload.single("imageFile"), async (req, res) => {
  let publicUrl = "";
  try {
    const { senderId, recipentId, messageType, messageText } = req.body;
    if (messageType === "image") {
      const filePath = req.file.path;
      await cloudinary.uploader.upload(filePath, (err, result) => {
        if (err) {
          return res.status(500).send("error uploading to cloudinary");
        }

        publicUrl = result.secure_url;
      });
    }

    const newMessage = new Message({
      senderId,
      recipentId,
      messageType,
      message: messageText,
      timestamp: new Date(),
      imageUrl: messageType === "image" ? publicUrl : null,
    });

    await newMessage.save();

    res.status(200).json({ message: "Message sent successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server Error" });
  }
});

app.post("/upload", upload.single("imageFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }

    const filePath = req.file.path;

    await cloudinary.uploader.upload(filePath, (err, result) => {
      if (err) {
        return res.status(500).send("error uploading to cloudinary");
      }

      const publicUrl = result.secure_url;
      res.json({ url: publicUrl });
    });
  } catch (err) {
    console.log("err while uploading", err);
  }
});

app.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const recipentId = await User.findById(userId);
    res.json(recipentId);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server Error" });
  }
});

//endpoint to get the messages between the two users in chatroom

app.get("/messages/:senderId/:recipentId", async (req, res) => {
  try {
    const { senderId, recipentId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId: senderId, recipentId: recipentId },
        { senderId: recipentId, recipentId: senderId },
      ],
    }).populate("senderId", "_id name");

    res.json(messages);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server Error" });
  }
});

app.post("/deleteMessages", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "invalid req body" });
    }

    await Message.deleteMany({ _id: { $in: messages } });
    res.json({ message: "Message deleted succesfully" });
  } catch (err) {
    console.log("err in deleting", err);
    res.status(500).json({ message: "Internal servor error" });
  }
});
app.get("/friend-requests/sent/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("friendRequest", "name email image")
      .lean();
    if (!user) {
      return res.status(405).json({ message: "User not found" });
    }

    const sentFriendRequests = user.sentFriendRequests;
    res.json(sentFriendRequests);
  } catch (err) {
    console.log("error is", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/friend/:userId", (req, res) => {
  try {
    const { userId } = req.params;

    User.findById(userId)
      .populate("friends")
      .then((user) => {
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        const friendIds = user.friends.map((frnd) => frnd._id);
        res.status(200).json(friendIds);
      });
  } catch (err) {
    console.log("error", err);
    res.status(500).json({ message: "Internal Server error" });
  }
});

app.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to backend zone" });
});
