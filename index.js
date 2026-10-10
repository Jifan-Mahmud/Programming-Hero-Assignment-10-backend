require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");

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

module.exports = { client, runStableAPIConnect };

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
