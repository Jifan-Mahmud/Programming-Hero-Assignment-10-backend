require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");
const { createToken, verifyToken, optionalToken } = require("./jwt");
const bcrypt = require("bcrypt");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT;
const uri = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

const dbName = process.env.DB_NAME;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function runStableAPIConnect() {
  try {
    await client.connect();
    const db = client.db(dbName);
     // Collections
    const usersCollection = db.collection("users");
    const classesCollection = db.collection("classes");
    const bookingsCollection = db.collection("bookings");
    const favoritesCollection = db.collection("favorites");
    const trainerApplicationsCollection = db.collection("trainer_applications");
    const forumPostsCollection = db.collection("forum_posts");
    const notificationsCollection = db.collection("notifications");


    app.get("/api/classes", async (req, res) => {
      try {
        const {
          search = "",
          category = "",
          page = 1,
          limit = 6,
          featured = "false",
        } = req.query;

        const query = { status: "Approved" };

        // Search by class name using MongoDB $regex (Challenge Requirement 1)
        if (search.trim()) {
          query.name = { $regex: search.trim(), $options: "i" };
        }

        // Filter by category using MongoDB $in (Challenge Requirement 2)
        if (category && category !== "all") {
          const categories = category
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
          if (categories.length > 0) {
            query.category = { $in: categories };
          }
        }

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 6);
        const skip = (pageNum - 1) * limitNum;

        // Sorting: If featured, sort by bookingCount desc
        const sortOptions =
          featured === "true" ? { bookingCount: -1, createdAt: -1 } : { createdAt: -1 };

        const total = await classesCollection.countDocuments(query);
        const classes = await classesCollection
          .find(query)
          .sort(sortOptions)
          .skip(skip)
          .limit(limitNum)
          .toArray();

        res.json({
          classes,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
          currentPage: pageNum,
        });
      } catch (err) {
        console.error("Classes fetch error:", err);
        res.status(500).json({ message: "Failed to fetch classes" });
      }
    });


     app.get("/api/classes/featured", async (req, res) => {
      try {
        const classes = await classesCollection
          .find({ status: "Approved" })
          .sort({ bookingCount: -1, createdAt: -1 })
          .limit(6)
          .toArray();
        res.json(classes);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch featured classes" });
      }
    });

    app.get("/api/classes/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid class ID format" });
        }

        const singleClass = await classesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!singleClass) {
          return res.status(404).json({ message: "Class not found" });
        }

        res.json(singleClass);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch class" });
      }
    });
    // Direct Register with email + password + role
    app.post("/api/register", async (req, res) => {
      try {
        const { name, email, password, image, role } = req.body;
        if (!name || !email || !password) {
          return res.status(400).json({ message: "Name, email, and password are required" });
        }

        // Password validation
        if (password.length < 6) {
          return res.status(400).json({ message: "Password must be at least 6 characters" });
        }
        if (!/[A-Z]/.test(password)) {
          return res.status(400).json({ message: "Password must include at least one uppercase letter" });
        }
        if (!/[a-z]/.test(password)) {
          return res.status(400).json({ message: "Password must include at least one lowercase letter" });
        }

        // Check if user already exists
        const existing = await getUserByEmail(email);
        if (existing) {
          return res.status(409).json({ message: "An account with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const allowedRole = role === "trainer" ? "trainer" : "user";

        const newUser = {
          name,
          email,
          password: hashedPassword,
          image: image || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10b981&color=000`,
          role: allowedRole,
          status: "active",
          createdAt: new Date(),
        };

        const insertResult = await usersCollection.insertOne(newUser);
        const user = { ...newUser, _id: insertResult.insertedId };

        // Sign JWT Token
        const tokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        };

        const token = await createToken(tokenPayload);

        res.cookie("pulseforge_token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
          success: true,
          token,
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            status: user.status,
          },
        });
      } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ message: "Registration failed" });
      }
    });
    // Direct Login with email + password (for seeded and registered users)
    app.post("/api/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await getUserByEmail(email);
        if (!user) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        if (!user.password) {
          return res.status(401).json({ message: "Invalid email or password. Please use Google login or register a new account." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        // Sign JWT Token
        const tokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role || "user",
          status: user.status || "active",
        };

        const token = await createToken(tokenPayload);

        res.cookie("pulseforge_token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
          success: true,
          token,
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            status: user.status,
          },
        });
      } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Login failed" });
      }
    });

     // Create Booking (After Payment)
    app.post(
      "/api/bookings",
      verifyToken,
      checkBlockedUser,
      async (req, res) => {
        try {
          const { classId, transactionId } = req.body;
          if (!classId) {
            return res.status(400).json({ message: "Class ID is required" });
          }

          // Crucial validation: Check if user already booked this class
          const existingBooking = await bookingsCollection.findOne({
            classId,
            userEmail: req.user.email,
          });

          if (existingBooking) {
            return res.status(400).json({
              message: "You have already booked this class",
            });
          }

          // Find class
          const singleClass = await classesCollection.findOne({
            _id: new ObjectId(classId),
          });
          if (!singleClass) {
            return res.status(404).json({ message: "Class not found" });
          }

          let user = await getUserByEmail(req.user.email);
          if (!user) {
            user = {
              name: req.user.name || "Member",
              email: req.user.email,
              image: req.user.image || "",
              role: req.user.role || "user",
              status: "active",
              createdAt: new Date(),
            };
            try {
              await usersCollection.insertOne(user);
            } catch (e) {}
          }

          const bookingDoc = {
            classId,
            className: singleClass.name,
            trainerName: singleClass.trainerName,
            trainerEmail: singleClass.trainerEmail,
            userEmail: user.email || req.user.email,
            userName: user.name || req.user.name || "Member",
            userImage: user.image || req.user.image || "",
            price: singleClass.price,
            schedule: singleClass.schedule,
            category: singleClass.category,
            transactionId: transactionId || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            paidAt: new Date(),
            status: "confirmed",
          };

          const result = await bookingsCollection.insertOne(bookingDoc);

          // Increment class bookingCount
          await classesCollection.updateOne(
            { _id: new ObjectId(classId) },
            { $inc: { bookingCount: 1 } }
          );

          res.status(201).json({
            success: true,
            message: "Class booked successfully!",
            bookingId: result.insertedId,
            transactionId: bookingDoc.transactionId,
          });
        } catch (err) {
          console.error("Booking error:", err);
          res.status(500).json({ message: "Failed to complete booking" });
        }
      }
    );

    // Get Logged-in User's Booked Classes
    app.get("/api/bookings/my", verifyToken, async (req, res) => {
      try {
        const bookings = await bookingsCollection
          .find({ userEmail: req.user.email })
          .sort({ paidAt: -1 })
          .toArray();
        res.json(bookings);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch bookings" });
      }
    });

    // Get All Platform Transactions (Admin Read-Only)
    app.get("/api/bookings/all", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const transactions = await bookingsCollection
          .find()
          .sort({ paidAt: -1 })
          .toArray();
        res.json(transactions);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch transactions" });
      }
    });

    app.post("/api/create-payment-intent", verifyToken, checkBlockedUser, async (req, res) => {
      try {
        const { classId } = req.body;
        if (!classId) {
          return res.status(400).json({ message: "Class ID required" });
        }

        // Check if already booked
        const alreadyBooked = await bookingsCollection.findOne({
          classId,
          userEmail: req.user.email,
        });

        if (alreadyBooked) {
          return res.status(400).json({ message: "You have already booked this class" });
        }

        const classItem = await classesCollection.findOne({ _id: new ObjectId(classId) });
        if (!classItem) {
          return res.status(404).json({ message: "Class not found" });
        }

        // Generate client secret for Stripe or mock client secret
        const amount = Math.round(Number(classItem.price) * 100); // in cents

        let clientSecret = "";
        try {
          if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes("Mock")) {
            const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
            const paymentIntent = await stripe.paymentIntents.create({
              amount: Math.max(100, amount),
              currency: "usd",
              payment_method_types: ["card"],
              metadata: {
                classId,
                className: classItem.name,
                userEmail: req.user.email,
              },
            });
            clientSecret = paymentIntent.client_secret;
          } else {
            // Secure fallback test client_secret
            clientSecret = `pi_mock_${Date.now()}_secret_${Math.random().toString(36).substring(2)}`;
          }
        } catch (stripeErr) {
          console.warn("Stripe live init note, using fallback client secret:", stripeErr.message);
          clientSecret = `pi_mock_${Date.now()}_secret_${Math.random().toString(36).substring(2)}`;
        }

        res.json({
          clientSecret,
          amount: classItem.price,
          className: classItem.name,
          trainerName: classItem.trainerName,
        });
      } catch (err) {
        res.status(500).json({ message: "Payment setup error" });
      }
    });

    console.log(`Connected to MongoDB database: ${dbName}`);

    const result = await client.db("admin").command({ ping: 1 });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );

    return result;
  } catch (err) {
    console.dir(err);
    throw err;
  }
}

  // Make User Admin
    app.patch("/api/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        if (!["admin", "trainer", "user"].includes(role)) {
          return res.status(400).json({ message: "Invalid role" });
        }

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid user ID" });
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        res.json({ success: true, message: `User role promoted to ${role}` });
      } catch (err) {
        res.status(500).json({ message: "Failed to change user role" });
      }
    });

     // Trainer to User
    app.patch("/api/users/:id/demote", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid user ID" });
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: "user" } }
        );

        res.json({
          success: true,
          message: "Trainer demoted to standard user successfully",
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to demote trainer" });
      }
    });

    // Get Active Trainers List
    app.get("/api/users/trainers", async (req, res) => {
      try {
        const trainers = await usersCollection
          .find({ role: "trainer" })
          .sort({ createdAt: -1 })
          .toArray();
        res.json(trainers);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch trainers" });
      }
    });

module.exports = { client, runStableAPIConnect };

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
