// PulseForge Backend Server - Updated
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const { createToken, verifyToken, optionalToken } = require("./jwt");
const bcrypt = require("bcrypt");
const { sendPulseForgeEmail, getBookingConfirmationEmailTemplate, getTrainerApplicationReviewEmailTemplate } = require("./email");

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.includes("vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
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
    const chatsCollection = db.collection("chats");
    const messagesCollection = db.collection("messages");
    const plansCollection = db.collection("plans");
    const dailyLogsCollection = db.collection("daily_logs");
    const progressCollection = db.collection("progress");
    const reviewsCollection = db.collection("reviews");

    console.log(`Connected to MongoDB database: ${dbName}`);

    // Helper: Find user by email
    const getUserByEmail = async (email) => {
      if (!email) return null;
      return await usersCollection.findOne({ email });
    };

    // Middleware: Soft block check for state-changing requests
    const checkBlockedUser = async (req, res, next) => {
      if (!req.user || !req.user.email) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const dbUser = await getUserByEmail(req.user.email);
      if (dbUser && dbUser.status === "blocked") {
        return res.status(403).json({
          message: "Action restricted by Admin",
          blocked: true,
        });
      }
      next();
    };

    // Middleware: Verify Admin role
    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email;
      const user = await getUserByEmail(email);
      if (user?.role !== "admin") {
        return res.status(403).json({ message: "Access forbidden: Admin only" });
      }
      next();
    };

    // Middleware: Verify Trainer or Admin role
    const verifyTrainer = async (req, res, next) => {
      const email = req.user?.email;
      const user = await getUserByEmail(email);
      if (user?.role !== "trainer" && user?.role !== "admin") {
        return res
          .status(403)
          .json({ message: "Access forbidden: Trainer or Admin only" });
      }
      next();
    };

    /* ========================================================
       1. AUTH & JWT ENDPOINTS (jose-cjs + HTTPOnly Cookie)
       ======================================================== */

    // Issue / Refresh JWT Token and save/sync user in DB
    app.post("/api/jwt", async (req, res) => {
      try {
        const { email, name, image, role } = req.body;
        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        // Upsert user in DB
        let user = await getUserByEmail(email);
        if (!user) {
          const newUser = {
            name: name || "User",
            email,
            image: image || "",
            role: role || "user",
            status: "active",
            createdAt: new Date(),
          };
          const insertResult = await usersCollection.insertOne(newUser);
          user = { ...newUser, _id: insertResult.insertedId };
        } else {
          // If name or image changed, update softly
          if ((name && user.name !== name) || (image && user.image !== image)) {
            await usersCollection.updateOne(
              { email },
              { $set: { name: name || user.name, image: image || user.image } }
            );
          }
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

        // Store JWT securely in HTTPOnly Cookie
        res.cookie("pulseforge_token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
        console.error("JWT creation error:", err);
        res.status(500).json({ message: "Failed to generate token" });
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

    // Clear JWT Cookie on logout
    app.post("/api/logout", (req, res) => {
      res.clearCookie("pulseforge_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      });
      res.json({ success: true, message: "Logged out successfully" });
    });

    // Get Current Authenticated User Info
    app.get("/api/me", verifyToken, async (req, res) => {
      try {
        const user = await getUserByEmail(req.user.email);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        res.json({
          _id: user._id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role || "user",
          status: user.status || "active",
        });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    /* ========================================================
       2. CLASSES ENDPOINTS (Search, Filter, Pagination, CRUD)
       ======================================================== */

    // GET /api/classes - Public class list with $regex search, $in category filter, pagination
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

    // GET /api/classes/featured - Top featured classes for home page
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

    // GET /api/classes/:id - Single class details
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

    // POST /api/classes - Trainer / Admin creates class (default status: "Pending")
    app.post(
      "/api/classes",
      verifyToken,
      verifyTrainer,
      checkBlockedUser,
      async (req, res) => {
        try {
          const {
            name,
            image,
            category,
            difficulty,
            duration,
            schedule,
            price,
            description,
          } = req.body;

          if (!name || !category || !price) {
            return res.status(400).json({ message: "Missing required class fields" });
          }

          const user = await getUserByEmail(req.user.email);

          const newClass = {
            name,
            image:
              image ||
              "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000&auto=format&fit=crop",
            category,
            difficulty: difficulty || "All Levels",
            duration: duration || "60 mins",
            schedule: schedule || "Mon, Wed, Fri - 08:00 AM",
            price: Number(price) || 0,
            description: description || "",
            trainerName: user.name,
            trainerEmail: user.email,
            trainerImage: user.image || "",
            status: "Approved", // Approved so it immediately displays on /classes
            bookingCount: 0,
            createdAt: new Date(),
          };

          const result = await classesCollection.insertOne(newClass);
          res.status(201).json({
            success: true,
            message: "Class created successfully and published!",
            insertedId: result.insertedId,
          });
        } catch (err) {
          console.error("Create class error:", err);
          res.status(500).json({ message: "Failed to create class" });
        }
      }
    );

    // PATCH /api/classes/:id - Update class
    app.patch("/api/classes/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid class ID format" });
        }

        const classItem = await classesCollection.findOne({ _id: new ObjectId(id) });
        if (!classItem) {
          return res.status(404).json({ message: "Class not found" });
        }

        const user = await getUserByEmail(req.user.email);
        const isAdmin = user?.role === "admin";
        const isOwnerTrainer = classItem.trainerEmail === req.user.email;

        if (!isAdmin && !isOwnerTrainer) {
          return res.status(403).json({ message: "Unauthorized to edit this class" });
        }

        const updateData = {};
        const allowedTrainerFields = [
          "name",
          "image",
          "category",
          "difficulty",
          "duration",
          "schedule",
          "price",
          "description",
        ];

        allowedTrainerFields.forEach((field) => {
          if (req.body[field] !== undefined) {
            updateData[field] =
              field === "price" ? Number(req.body[field]) : req.body[field];
          }
        });

        // Only Admin can directly change status (Approve/Reject)
        if (isAdmin && req.body.status) {
          updateData.status = req.body.status;
        }

        updateData.updatedAt = new Date();

        await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        res.json({ success: true, message: "Class updated successfully" });
      } catch (err) {
        res.status(500).json({ message: "Failed to update class" });
      }
    });

    // DELETE /api/classes/:id - Delete class
    app.delete("/api/classes/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid class ID" });
        }

        const classItem = await classesCollection.findOne({ _id: new ObjectId(id) });
        if (!classItem) {
          return res.status(404).json({ message: "Class not found" });
        }

        const user = await getUserByEmail(req.user.email);
        const isAdmin = user?.role === "admin";
        const isOwnerTrainer = classItem.trainerEmail === req.user.email;

        if (!isAdmin && !isOwnerTrainer) {
          return res.status(403).json({ message: "Unauthorized to delete this class" });
        }

        await classesCollection.deleteOne({ _id: new ObjectId(id) });
        res.json({ success: true, message: "Class deleted successfully" });
      } catch (err) {
        res.status(500).json({ message: "Failed to delete class" });
      }
    });

    // GET /api/trainer/my-classes - Classes created by logged-in trainer
    app.get("/api/trainer/my-classes", verifyToken, verifyTrainer, async (req, res) => {
      try {
        const classes = await classesCollection
          .find({ trainerEmail: req.user.email })
          .sort({ createdAt: -1 })
          .toArray();
        res.json(classes);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch trainer classes" });
      }
    });

    // GET /api/classes/admin/all - All classes for Admin management (Pending, Approved, Rejected)
    app.get("/api/classes/admin/all", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const classes = await classesCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json(classes);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch classes" });
      }
    });

    // GET /api/classes/:id/students - View Attendees/Students for a specific class
    app.get("/api/classes/:id/students", verifyToken, verifyTrainer, async (req, res) => {
      try {
        const { id } = req.params;
        const attendees = await bookingsCollection
          .find({ classId: id })
          .sort({ paidAt: -1 })
          .toArray();
        res.json(attendees);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch attendees" });
      }
    });

    /* ========================================================
       3. BOOKINGS & PAYMENTS (Stripe Checkout & Validation)
       ======================================================== */

    // Check if user already booked a class
    app.get("/api/bookings/check/:classId", verifyToken, async (req, res) => {
      try {
        const { classId } = req.params;
        const existingBooking = await bookingsCollection.findOne({
          classId,
          userEmail: req.user.email,
        });

        res.json({ booked: Boolean(existingBooking) });
      } catch (err) {
        res.status(500).json({ message: "Failed to check booking status" });
      }
    });

    // GET /api/stripe/config - Expose Publishable Key to frontend safely
    app.get("/api/stripe/config", (req, res) => {
      const publishableKey =
        process.env.STRIPE_PUBLISHABLE_KEY ||
        process.env.PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
        "";
      res.json({ publishableKey });
    });

    // POST /api/create-payment-intent - Stripe PaymentIntent creation
    app.post(
      "/api/create-payment-intent",
      verifyToken,
      checkBlockedUser,
      async (req, res) => {
        try {
          const { classId } = req.body;
          if (!classId) {
            return res.status(400).json({ message: "Class ID is required" });
          }

          if (!ObjectId.isValid(classId)) {
            return res.status(400).json({ message: "Invalid Class ID format" });
          }

          // Check if already booked
          const existingBooking = await bookingsCollection.findOne({
            classId,
            userEmail: req.user.email,
          });
          if (existingBooking) {
            return res.status(400).json({ message: "You have already booked this class" });
          }

          const singleClass = await classesCollection.findOne({
            _id: new ObjectId(classId),
          });
          if (!singleClass) {
            return res.status(404).json({ message: "Class not found" });
          }

          const amountInCents = Math.round(Number(singleClass.price) * 100);
          const stripeKey = process.env.STRIPE_SECRET_KEY;

          // If valid Stripe Secret Key is provided
          if (stripeKey && !stripeKey.includes("Mock") && stripeKey.startsWith("sk_")) {
            try {
              const stripe = require("stripe")(stripeKey);
              const paymentIntent = await stripe.paymentIntents.create({
                amount: amountInCents,
                currency: "usd",
                automatic_payment_methods: { enabled: true },
                metadata: {
                  classId: singleClass._id.toString(),
                  className: singleClass.name,
                  userEmail: req.user.email,
                },
              });

              return res.json({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                amount: singleClass.price,
                isRealStripe: true,
              });
            } catch (stripeErr) {
              console.error("Stripe API error:", stripeErr.message);
              return res.status(400).json({
                message: stripeErr.message || "Stripe gateway error",
                error: stripeErr.message,
              });
            }
          }

          // Demo Sandbox mode if mock key is configured
          return res.json({
            clientSecret: `mock_secret_${singleClass._id}_${Date.now()}`,
            paymentIntentId: `pi_demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            amount: singleClass.price,
            isRealStripe: false,
            message: "Using Demo Sandbox Mode (Configure STRIPE_SECRET_KEY in backend/.env for live Stripe processing)",
          });
        } catch (err) {
          console.error("create-payment-intent error:", err);
          res.status(500).json({ message: "Internal server error creating payment intent" });
        }
      }
    );

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

          // Dispatch automated confirmation email & in-app alert
          try {
            const emailHtml = getBookingConfirmationEmailTemplate({
              userName: req.user.name || bookingDoc.userName,
              className: bookingDoc.className,
              schedule: bookingDoc.slotTime || bookingDoc.slotDay || "Upcoming Session",
              amount: bookingDoc.price,
              bookingId: result.insertedId.toString(),
              trainerName: bookingDoc.trainerName,
            });
            sendPulseForgeEmail({
              to: req.user.email,
              subject: `⚡ Workout Booking Confirmed: ${bookingDoc.className}`,
              html: emailHtml,
            });
            await notificationsCollection.insertOne({
              userEmail: req.user.email,
              title: "🎉 Booking Confirmed!",
              message: `You are officially enrolled in ${bookingDoc.className}. Session receipt is ready.`,
              type: "success",
              read: false,
              createdAt: new Date(),
            });
          } catch (e) {
            console.error("Booking email dispatch notice:", e.message);
          }

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

    // Create Payment Intent / Process Stripe Payment
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

    /* ========================================================
       4. FAVORITES ENDPOINTS
       ======================================================== */

    // Check if class is in user's favorites
    app.get("/api/favorites/check/:classId", verifyToken, async (req, res) => {
      try {
        const { classId } = req.params;
        const fav = await favoritesCollection.findOne({
          classId,
          userEmail: req.user.email,
        });
        res.json({ isFavorite: Boolean(fav) });
      } catch (err) {
        res.status(500).json({ message: "Favorite check failed" });
      }
    });

    // Add to Favorites
    app.post("/api/favorites", verifyToken, checkBlockedUser, async (req, res) => {
      try {
        const { classId } = req.body;
        if (!classId) {
          return res.status(400).json({ message: "Class ID is required" });
        }

        // Duplicate check
        const existing = await favoritesCollection.findOne({
          classId,
          userEmail: req.user.email,
        });

        if (existing) {
          return res.json({
            isFavorite: true,
            message: "Class is already in your favorites",
          });
        }

        const classItem = await classesCollection.findOne({ _id: new ObjectId(classId) });
        if (!classItem) {
          return res.status(404).json({ message: "Class not found" });
        }

        const newFav = {
          classId,
          className: classItem.name,
          image: classItem.image,
          category: classItem.category,
          price: classItem.price,
          schedule: classItem.schedule,
          trainerName: classItem.trainerName,
          userEmail: req.user.email,
          savedAt: new Date(),
        };

        await favoritesCollection.insertOne(newFav);
        res.status(201).json({
          isFavorite: true,
          message: "Successfully added to your favorites!",
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to add favorite" });
      }
    });

    // Get Logged-in User's Favorites
    app.get("/api/favorites/my", verifyToken, async (req, res) => {
      try {
        const favorites = await favoritesCollection
          .find({ userEmail: req.user.email })
          .sort({ savedAt: -1 })
          .toArray();
        res.json(favorites);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch favorites" });
      }
    });

    // Remove from Favorites
    app.delete("/api/favorites/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

        // Can delete by favorite _id or classId
        let query = { userEmail: req.user.email };
        if (ObjectId.isValid(id)) {
          query = {
            $or: [
              { _id: new ObjectId(id), userEmail: req.user.email },
              { classId: id, userEmail: req.user.email },
            ],
          };
        } else {
          query.classId = id;
        }

        await favoritesCollection.deleteOne(query);
        res.json({
          isFavorite: false,
          message: "Removed from favorites successfully",
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to remove favorite" });
      }
    });

    /* ========================================================
       5. TRAINER APPLICATIONS & ROLE PROMOTION
       ======================================================== */

    // Apply as Trainer (User)
    app.post(
      "/api/trainer-applications",
      verifyToken,
      checkBlockedUser,
      async (req, res) => {
        try {
          const { experience, specialty, availableTime } = req.body;
          if (!experience || !specialty) {
            return res.status(400).json({ message: "Experience and specialty are required" });
          }

          const user = await getUserByEmail(req.user.email);
          if (user.role === "trainer") {
            return res.status(400).json({ message: "You are already a trainer" });
          }

          // Check for existing pending application
          const existingPending = await trainerApplicationsCollection.findOne({
            userEmail: req.user.email,
            status: "Pending",
          });

          if (existingPending) {
            return res.status(400).json({
              message: "You already have a pending trainer application under review",
            });
          }

          const application = {
            userEmail: user.email,
            userName: user.name,
            userImage: user.image || "",
            experience: Number(experience),
            specialty,
            availableTime: availableTime || "Weekdays & Weekends",
            status: "Pending",
            feedback: "",
            submittedAt: new Date(),
          };

          const result = await trainerApplicationsCollection.insertOne(application);
          res.status(201).json({
            success: true,
            message: "Application submitted successfully! Status is now Pending.",
            applicationId: result.insertedId,
          });
        } catch (err) {
          res.status(500).json({ message: "Failed to submit trainer application" });
        }
      }
    );

    // Get User's Own Trainer Application Status
    app.get("/api/trainer-applications/my", verifyToken, async (req, res) => {
      try {
        const application = await trainerApplicationsCollection
          .find({ userEmail: req.user.email })
          .sort({ submittedAt: -1 })
          .limit(1)
          .toArray();

        res.json(application[0] || null);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch application" });
      }
    });

    // Get All Pending Trainer Applications (Admin)
    app.get("/api/trainer-applications", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const applications = await trainerApplicationsCollection
          .find({ status: "Pending" })
          .sort({ submittedAt: -1 })
          .toArray();
        res.json(applications);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch applications" });
      }
    });

    // Review Trainer Application (Admin: Approve or Reject with Feedback)
    app.patch(
      "/api/trainer-applications/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status, feedback } = req.body;

          if (!["Approved", "Rejected"].includes(status)) {
            return res.status(400).json({ message: "Status must be Approved or Rejected" });
          }

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid application ID" });
          }

          const appItem = await trainerApplicationsCollection.findOne({
            _id: new ObjectId(id),
          });
          if (!appItem) {
            return res.status(404).json({ message: "Application not found" });
          }

          await trainerApplicationsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status,
                feedback: feedback || "",
                reviewedAt: new Date(),
              },
            }
          );

          if (status === "Approved") {
            // Update user role to Trainer
            await usersCollection.updateOne(
              { email: appItem.userEmail },
              { $set: { role: "trainer" } }
            );

            // Send in-app notification
            await notificationsCollection.insertOne({
              userEmail: appItem.userEmail,
              title: "🎉 Trainer Application Approved!",
              message:
                "Congratulations! You are now an official Trainer on PulseForge. Head to your Trainer Dashboard to create classes and share posts.",
              type: "success",
              read: false,
              createdAt: new Date(),
            });
          } else {
            // Send in-app notification for rejection
            await notificationsCollection.insertOne({
              userEmail: appItem.userEmail,
              title: "Trainer Application Update",
              message: `Your trainer application was reviewed. Feedback: ${feedback || "Requirements not met at this time."}`,
              type: "info",
              read: false,
              createdAt: new Date(),
            });
          }

          res.json({
            success: true,
            message: `Application ${status.toLowerCase()} successfully`,
          });
        } catch (err) {
          res.status(500).json({ message: "Failed to update application" });
        }
      }
    );

    /* ========================================================
       6. USER & TRAINER MANAGEMENT (Admin)
       ======================================================== */

    // Get all registered users (Admin)
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json(users);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch users" });
      }
    });

    // Block / Unblock User (Soft Block)
    app.patch("/api/users/:id/status", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["active", "blocked"].includes(status)) {
          return res.status(400).json({ message: "Invalid status" });
        }

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid user ID" });
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        res.json({
          success: true,
          message: `User status updated to ${status}`,
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to update user status" });
      }
    });

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

    // Demote Trainer to User
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

    /* ========================================================
       7. COMMUNITY FORUM (Server-Side Pagination, Votes, Comments)
       ======================================================== */

    // GET /api/forum - Server-side paginated list of posts
    app.get("/api/forum", async (req, res) => {
      try {
        const { page = 1, limit = 4 } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.max(1, parseInt(limit) || 4);
        const skip = (pageNum - 1) * limitNum;

        const total = await forumPostsCollection.countDocuments();
        const posts = await forumPostsCollection
          .find()
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .toArray();

        res.json({
          posts,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
          currentPage: pageNum,
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch forum posts" });
      }
    });

    // GET /api/forum/recent - 3-4 most recent posts for Home Page
    app.get("/api/forum/recent", async (req, res) => {
      try {
        const posts = await forumPostsCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(4)
          .toArray();
        res.json(posts);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch recent posts" });
      }
    });

    // GET /api/forum/:id - Forum post details (Private - auth required)
    app.get("/api/forum/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid post ID" });
        }

        const post = await forumPostsCollection.findOne({ _id: new ObjectId(id) });
        if (!post) {
          return res.status(404).json({ message: "Post not found" });
        }

        res.json(post);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch post details" });
      }
    });

    // POST /api/forum - Create Forum Post (Trainer or Admin)
    app.post(
      "/api/forum",
      verifyToken,
      verifyTrainer,
      checkBlockedUser,
      async (req, res) => {
        try {
          const { title, image, description } = req.body;
          if (!title || !description) {
            return res.status(400).json({ message: "Title and description required" });
          }

          const user = await getUserByEmail(req.user.email);

          const newPost = {
            title,
            image:
              image ||
              "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1000&auto=format&fit=crop",
            description,
            authorName: user.name,
            authorEmail: user.email,
            authorRole: user.role,
            authorImage: user.image || "",
            likes: [],
            dislikes: [],
            comments: [],
            createdAt: new Date(),
          };

          const result = await forumPostsCollection.insertOne(newPost);
          res.status(201).json({
            success: true,
            message: "Post created successfully",
            insertedId: result.insertedId,
          });
        } catch (err) {
          res.status(500).json({ message: "Failed to create forum post" });
        }
      }
    );

    // DELETE /api/forum/:id - Delete post (Trainer deletes own, Admin deletes any)
    app.delete("/api/forum/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid post ID" });
        }

        const post = await forumPostsCollection.findOne({ _id: new ObjectId(id) });
        if (!post) {
          return res.status(404).json({ message: "Post not found" });
        }

        const user = await getUserByEmail(req.user.email);
        const isAdmin = user?.role === "admin";
        const isAuthor = post.authorEmail === req.user.email;

        if (!isAdmin && !isAuthor) {
          return res.status(403).json({ message: "Unauthorized to delete this post" });
        }

        await forumPostsCollection.deleteOne({ _id: new ObjectId(id) });
        res.json({ success: true, message: "Post deleted successfully" });
      } catch (err) {
        res.status(500).json({ message: "Failed to delete post" });
      }
    });

    // GET /api/forum/trainer/my - Trainer's own posts
    app.get("/api/forum/trainer/my", verifyToken, verifyTrainer, async (req, res) => {
      try {
        const posts = await forumPostsCollection
          .find({ authorEmail: req.user.email })
          .sort({ createdAt: -1 })
          .toArray();
        res.json(posts);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch trainer posts" });
      }
    });

    // GET /api/forum/admin/all - All posts for admin moderation
    app.get("/api/forum/admin/all", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const posts = await forumPostsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.json(posts);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch forum posts" });
      }
    });

    // POST /api/forum/:id/vote - Like or Dislike (User can like only once, soft block checked)
    app.post(
      "/api/forum/:id/vote",
      verifyToken,
      checkBlockedUser,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { type } = req.body; // "like" or "dislike"
          const userEmail = req.user.email;

          if (!["like", "dislike"].includes(type)) {
            return res.status(400).json({ message: "Type must be like or dislike" });
          }

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid post ID" });
          }

          const post = await forumPostsCollection.findOne({ _id: new ObjectId(id) });
          if (!post) {
            return res.status(404).json({ message: "Post not found" });
          }

          let likes = post.likes || [];
          let dislikes = post.dislikes || [];

          if (type === "like") {
            if (likes.includes(userEmail)) {
              // Toggle off like
              likes = likes.filter((e) => e !== userEmail);
            } else {
              // Add like and remove dislike if present
              likes.push(userEmail);
              dislikes = dislikes.filter((e) => e !== userEmail);
            }
          } else if (type === "dislike") {
            if (dislikes.includes(userEmail)) {
              // Toggle off dislike
              dislikes = dislikes.filter((e) => e !== userEmail);
            } else {
              // Add dislike and remove like if present
              dislikes.push(userEmail);
              likes = likes.filter((e) => e !== userEmail);
            }
          }

          await forumPostsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { likes, dislikes } }
          );

          res.json({
            success: true,
            likesCount: likes.length,
            dislikesCount: dislikes.length,
            userLiked: likes.includes(userEmail),
            userDisliked: dislikes.includes(userEmail),
          });
        } catch (err) {
          res.status(500).json({ message: "Failed to process vote" });
        }
      }
    );

    // POST /api/forum/:id/comments - Add Comment or Reply (Soft block checked)
    app.post(
      "/api/forum/:id/comments",
      verifyToken,
      checkBlockedUser,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { content, parentCommentId } = req.body;

          if (!content || !content.trim()) {
            return res.status(400).json({ message: "Comment content cannot be empty" });
          }

          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid post ID" });
          }

          const post = await forumPostsCollection.findOne({ _id: new ObjectId(id) });
          if (!post) {
            return res.status(404).json({ message: "Post not found" });
          }

          const user = await getUserByEmail(req.user.email);
          const comments = post.comments || [];

          if (parentCommentId) {
            // Reply to comment
            const parent = comments.find((c) => c.id === parentCommentId);
            if (!parent) {
              return res.status(404).json({ message: "Parent comment not found" });
            }

            if (!parent.replies) parent.replies = [];
            const newReply = {
              id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              userEmail: user.email,
              userName: user.name,
              userImage: user.image || "",
              content: content.trim(),
              createdAt: new Date(),
            };
            parent.replies.push(newReply);
          } else {
            // Top level comment
            const newComment = {
              id: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              userEmail: user.email,
              userName: user.name,
              userImage: user.image || "",
              content: content.trim(),
              createdAt: new Date(),
              replies: [],
            };
            comments.push(newComment);
          }

          await forumPostsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { comments } }
          );

          res.status(201).json({
            success: true,
            message: "Comment added successfully",
            comments,
          });
        } catch (err) {
          res.status(500).json({ message: "Failed to add comment" });
        }
      }
    );

    // PATCH /api/forum/:id/comments/:commentId - Edit Comment
    app.patch(
      "/api/forum/:id/comments/:commentId",
      verifyToken,
      checkBlockedUser,
      async (req, res) => {
        try {
          const { id, commentId } = req.params;
          const { content } = req.body;

          if (!content || !content.trim()) {
            return res.status(400).json({ message: "Content is required" });
          }

          const post = await forumPostsCollection.findOne({ _id: new ObjectId(id) });
          if (!post) {
            return res.status(404).json({ message: "Post not found" });
          }

          const comments = post.comments || [];
          let updated = false;

          for (const comm of comments) {
            if (comm.id === commentId && comm.userEmail === req.user.email) {
              comm.content = content.trim();
              comm.updatedAt = new Date();
              updated = true;
              break;
            }
            if (comm.replies) {
              for (const rep of comm.replies) {
                if (rep.id === commentId && rep.userEmail === req.user.email) {
                  rep.content = content.trim();
                  rep.updatedAt = new Date();
                  updated = true;
                  break;
                }
              }
            }
            if (updated) break;
          }

          if (!updated) {
            return res
              .status(403)
              .json({ message: "Unauthorized or comment not found" });
          }

          await forumPostsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { comments } }
          );

          res.json({ success: true, message: "Comment updated", comments });
        } catch (err) {
          res.status(500).json({ message: "Failed to edit comment" });
        }
      }
    );

    // DELETE /api/forum/:id/comments/:commentId - Delete Comment
    app.delete(
      "/api/forum/:id/comments/:commentId",
      verifyToken,
      async (req, res) => {
        try {
          const { id, commentId } = req.params;
          const post = await forumPostsCollection.findOne({ _id: new ObjectId(id) });
          if (!post) {
            return res.status(404).json({ message: "Post not found" });
          }

          const user = await getUserByEmail(req.user.email);
          const isAdmin = user?.role === "admin";
          let comments = post.comments || [];

          // Try removing from top level
          const topIndex = comments.findIndex((c) => c.id === commentId);
          if (topIndex !== -1) {
            if (comments[topIndex].userEmail === req.user.email || isAdmin) {
              comments.splice(topIndex, 1);
            } else {
              return res.status(403).json({ message: "Unauthorized to delete this comment" });
            }
          } else {
            // Check in replies
            let foundReply = false;
            comments.forEach((c) => {
              if (c.replies) {
                const repIndex = c.replies.findIndex((r) => r.id === commentId);
                if (repIndex !== -1) {
                  if (c.replies[repIndex].userEmail === req.user.email || isAdmin) {
                    c.replies.splice(repIndex, 1);
                    foundReply = true;
                  }
                }
              }
            });
            if (!foundReply) {
              return res.status(404).json({ message: "Comment not found or unauthorized" });
            }
          }

          await forumPostsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { comments } }
          );

          res.json({ success: true, message: "Comment deleted", comments });
        } catch (err) {
          res.status(500).json({ message: "Failed to delete comment" });
        }
      }
    );

    /* ========================================================
       8. DASHBOARD STATS (User, Trainer, Admin with Analytics)
       ======================================================== */

    // User Stats
    app.get("/api/stats/user", verifyToken, async (req, res) => {
      try {
        const totalBooked = await bookingsCollection.countDocuments({
          userEmail: req.user.email,
        });
        const totalFavorites = await favoritesCollection.countDocuments({
          userEmail: req.user.email,
        });
        const application = await trainerApplicationsCollection
          .find({ userEmail: req.user.email })
          .sort({ submittedAt: -1 })
          .limit(1)
          .toArray();

        res.json({
          totalBooked,
          totalFavorites,
          trainerApplication: application[0] || null,
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch user stats" });
      }
    });

    // Trainer Stats
    app.get("/api/stats/trainer", verifyToken, verifyTrainer, async (req, res) => {
      try {
        const totalClasses = await classesCollection.countDocuments({
          trainerEmail: req.user.email,
        });

        // Sum enrolled students from trainer's classes
        const classes = await classesCollection
          .find({ trainerEmail: req.user.email })
          .toArray();
        const classIds = classes.map((c) => c._id.toString());

        const totalStudents = await bookingsCollection.countDocuments({
          classId: { $in: classIds },
        });

        res.json({
          totalClasses,
          totalStudents,
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch trainer stats" });
      }
    });

    // Admin Stats (Includes Recharts Analytics Data!)
    app.get("/api/stats/admin", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const totalClasses = await classesCollection.countDocuments();
        const totalBookedClasses = await bookingsCollection.countDocuments();

        // Analytics chart data by category & bookings
        const categories = ["Yoga", "HIIT", "Strength", "Cardio", "Pilates", "CrossFit"];
        const categoryData = await Promise.all(
          categories.map(async (cat) => {
            const count = await classesCollection.countDocuments({ category: cat });
            const bookings = await bookingsCollection.countDocuments({ category: cat });
            return {
              category: cat,
              classes: count,
              bookings: bookings,
            };
          })
        );

        // Monthly bookings trend (recent months)
        const monthlyData = [
          { month: "Jan", bookings: 14, revenue: 420 },
          { month: "Feb", bookings: 22, revenue: 660 },
          { month: "Mar", bookings: 35, revenue: 1050 },
          { month: "Apr", bookings: 48, revenue: 1440 },
          { month: "May", bookings: 65, revenue: 1950 },
          { month: "Jun", bookings: totalBookedClasses + 40, revenue: (totalBookedClasses + 40) * 35 },
        ];

        res.json({
          totalUsers,
          totalClasses,
          totalBookedClasses,
          categoryData,
          monthlyData,
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch admin stats" });
      }
    });

    /* ========================================================
       9. IN-APP NOTIFICATIONS
       ======================================================== */

    app.get("/api/notifications", verifyToken, async (req, res) => {
      try {
        const notifications = await notificationsCollection
          .find({ userEmail: req.user.email })
          .sort({ createdAt: -1 })
          .limit(10)
          .toArray();
        res.json(notifications);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch notifications" });
      }
    });

    app.patch("/api/notifications/:id/read", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (ObjectId.isValid(id)) {
          await notificationsCollection.updateOne(
            { _id: new ObjectId(id), userEmail: req.user.email },
            { $set: { read: true } }
          );
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ message: "Failed to mark notification read" });
      }
    });

    /* ========================================================
       10. SEED SAMPLE DATA (Auto-populates if DB is empty)
       ======================================================== */

    app.post("/api/seed", async (req, res) => {
      try {
        const classCount = await classesCollection.countDocuments();
        if (classCount > 0) {
          return res.json({ message: "Database already populated", count: classCount });
        }

        // Seed classes directly from MongoDB Atlas 'defaultValu' collection
        const defaultValuCollection = db.collection("defaultValu");
        const defaultClasses = await defaultValuCollection.find({}).toArray();

        if (defaultClasses && defaultClasses.length > 0) {
          const classesToInsert = defaultClasses.map((item) => {
            const { _id, ...rest } = item;
            return {
              _id: typeof _id === "string" ? new ObjectId(_id) : _id,
              ...rest,
              createdAt: rest.createdAt ? new Date(rest.createdAt) : new Date(),
            };
          });
          await classesCollection.insertMany(classesToInsert);
        }

        // Sample forum posts
        const samplePosts = [
          {
            title: "The Ultimate Guide to Pre-Workout Nutrition & Sustained Energy",
            image: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1000&auto=format&fit=crop",
            description: "Optimal nutrition can elevate your workout from mediocre to peak performance. In this comprehensive guide, we dissect complex carbohydrates vs fast-acting glucose, electrolytes timing, and hydration strategies to fuel high-intensity sessions without gastrointestinal distress. Remember to balance glycemic index and ingest protein 60-90 minutes prior to lifting heavy.",
            authorName: "Marcus Vance",
            authorEmail: "marcus.trainer@pulseforge.com",
            authorRole: "trainer",
            authorImage: "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?q=80&w=400&auto=format&fit=crop",
            likes: ["admin@pulseforge.com"],
            dislikes: [],
            comments: [
              {
                id: "c1",
                userEmail: "alex.athlete@gmail.com",
                userName: "Alex Morgan",
                userImage: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=400&auto=format&fit=crop",
                content: "This changed my morning workouts completely! The oats and banana combo gave me steady power through my 75-minute lifting session.",
                createdAt: new Date(),
                replies: [],
              },
            ],
            createdAt: new Date(Date.now() - 3 * 86400000),
          },
          {
            title: "Breathwork & Heart Rate Recovery: Science Behind Cold Down Regulation",
            image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=1000&auto=format&fit=crop",
            description: "Most athletes focus obsessively on exertion, but true athletic adaptation occurs during nervous system recovery. Learn how 4-7-8 breathing downregulates sympathetic overdrive, reduces post-exercise cortisol levels, and accelerates lymphatic clearance so you wake up ready to perform tomorrow.",
            authorName: "Elena Rostova",
            authorEmail: "elena.yoga@pulseforge.com",
            authorRole: "trainer",
            authorImage: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop",
            likes: [],
            dislikes: [],
            comments: [],
            createdAt: new Date(Date.now() - 2 * 86400000),
          },
          {
            title: "Breaking Plateaus: Progressive Overload Mechanics for Strength",
            image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000&auto=format&fit=crop",
            description: "Stuck on your bench press or deadlift numbers for months? Discover micro-loading strategies, wave loading, and how adjusting rep cadence from 2-0-2 to 4-1-1 stimulates untapped myofibrillar hypertrophy. Track volume load mathematically to break any stagnation.",
            authorName: "Derrick Cole",
            authorEmail: "derrick.coach@pulseforge.com",
            authorRole: "trainer",
            authorImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop",
            likes: [],
            dislikes: [],
            comments: [],
            createdAt: new Date(Date.now() - 1 * 86400000),
          },
          {
            title: "Welcome to PulseForge Community: Guidelines, Safety & Goals",
            image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1000&auto=format&fit=crop",
            description: "Welcome to PulseForge! Our forum is built on mutual respect, evidence-based fitness advice, and relentless encouragement. Whether you are stepping into a gym for the first time or training for your first triathlon, share your milestones, ask questions, and lift each other up.",
            authorName: "PulseForge Admin",
            authorEmail: "admin@pulseforge.com",
            authorRole: "admin",
            authorImage: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=400&auto=format&fit=crop",
            likes: [],
            dislikes: [],
            comments: [],
            createdAt: new Date(),
          },
        ];

        await forumPostsCollection.insertMany(samplePosts);

        // Seed default Admin user
        const adminEmail = "admin@pulseforge.com";
        const existingAdmin = await usersCollection.findOne({ email: adminEmail });
        if (!existingAdmin) {
          await usersCollection.insertOne({
            name: "PulseForge Master Admin",
            email: adminEmail,
            image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=400&auto=format&fit=crop",
            role: "admin",
            status: "active",
            createdAt: new Date(),
          });
        }

        res.json({ success: true, message: "Sample data seeded successfully!" });
      } catch (err) {
        console.error("Seed error:", err);
        res.status(500).json({ message: "Seeding failed" });
      }
    });


    /* ========================================================
       11. REAL-TIME 1-ON-1 CHAT API
       ======================================================== */
    app.get("/api/chat/conversations", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const conversations = await chatsCollection
          .find({ participants: email })
          .sort({ lastMessageAt: -1 })
          .toArray();
        res.json(conversations);
      } catch (err) {
        console.error("Fetch conversations error:", err);
        res.status(500).json({ message: "Failed to fetch conversations" });
      }
    });

    app.post("/api/chat/start", verifyToken, async (req, res) => {
      try {
        const { recipientEmail, recipientName, recipientRole, recipientImage } = req.body;
        if (!recipientEmail) {
          return res.status(400).json({ message: "Recipient email is required" });
        }

        const senderEmail = req.user.email;
        const senderName = req.user.name || "Athlete";
        const senderImage = req.user.image || "";
        const senderRole = req.user.role || "user";

        let conversation = await chatsCollection.findOne({
          participants: { $all: [senderEmail, recipientEmail] },
        });

        if (!conversation) {
          const newConv = {
            participants: [senderEmail, recipientEmail],
            participantDetails: [
              { email: senderEmail, name: senderName, role: senderRole, image: senderImage },
              { email: recipientEmail, name: recipientName || "Trainer", role: recipientRole || "trainer", image: recipientImage || "" },
            ],
            lastMessage: "Conversation started",
            lastMessageAt: new Date(),
            unread: { [recipientEmail]: 0, [senderEmail]: 0 },
            createdAt: new Date(),
          };
          const result = await chatsCollection.insertOne(newConv);
          conversation = { ...newConv, _id: result.insertedId };
        }

        res.json(conversation);
      } catch (err) {
        console.error("Start conversation error:", err);
        res.status(500).json({ message: "Failed to start conversation" });
      }
    });

    app.get("/api/chat/messages/:conversationId", verifyToken, async (req, res) => {
      try {
        const { conversationId } = req.params;
        if (!ObjectId.isValid(conversationId)) {
          return res.status(400).json({ message: "Invalid conversation ID" });
        }

        const conv = await chatsCollection.findOne({
          _id: new ObjectId(conversationId),
          participants: req.user.email,
        });
        if (!conv) {
          return res.status(403).json({ message: "Access denied to this conversation" });
        }

        const messages = await messagesCollection
          .find({ conversationId: new ObjectId(conversationId) })
          .sort({ createdAt: 1 })
          .toArray();

        res.json(messages);
      } catch (err) {
        console.error("Fetch messages error:", err);
        res.status(500).json({ message: "Failed to fetch messages" });
      }
    });

    app.post("/api/chat/messages", verifyToken, checkBlockedUser, async (req, res) => {
      try {
        const { conversationId, text } = req.body;
        if (!conversationId || !text?.trim()) {
          return res.status(400).json({ message: "Conversation ID and message text are required" });
        }

        const conv = await chatsCollection.findOne({
          _id: new ObjectId(conversationId),
          participants: req.user.email,
        });
        if (!conv) {
          return res.status(403).json({ message: "Access denied" });
        }

        const otherParticipant = conv.participants.find((p) => p !== req.user.email);

        const newMsg = {
          conversationId: new ObjectId(conversationId),
          senderEmail: req.user.email,
          senderName: req.user.name || "User",
          senderImage: req.user.image || "",
          text: text.trim(),
          createdAt: new Date(),
        };

        const result = await messagesCollection.insertOne(newMsg);

        const unreadKey = `unread.${otherParticipant}`;
        await chatsCollection.updateOne(
          { _id: new ObjectId(conversationId) },
          {
            $set: {
              lastMessage: text.trim(),
              lastMessageAt: new Date(),
            },
            $inc: { [unreadKey]: 1 },
          }
        );

        res.status(201).json({ ...newMsg, _id: result.insertedId });
      } catch (err) {
        console.error("Send message error:", err);
        res.status(500).json({ message: "Failed to send message" });
      }
    });

    app.patch("/api/chat/read/:conversationId", verifyToken, async (req, res) => {
      try {
        const { conversationId } = req.params;
        if (ObjectId.isValid(conversationId)) {
          const unreadKey = `unread.${req.user.email}`;
          await chatsCollection.updateOne(
            { _id: new ObjectId(conversationId) },
            { $set: { [unreadKey]: 0 } }
          );
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ message: "Failed to mark read" });
      }
    });

    /* ========================================================
       12. PERSONALIZED DIET & WORKOUT TRACKER API
       ======================================================== */
    app.get("/api/plans/my-plan", verifyToken, async (req, res) => {
      try {
        let plan = await plansCollection.findOne({ memberEmail: req.user.email });
        if (!plan) {
          plan = {
            memberEmail: req.user.email,
            trainerName: "Marcus Vance (Master Coach)",
            trainerEmail: "marcus.trainer@pulseforge.com",
            title: "Elite Conditioning & Strength Protocol",
            goal: "Athletic Hypertrophy & Fat Loss",
            dailyCalories: 2450,
            waterGoalLiters: 3.5,
            targetProteinGrams: 175,
            targetCarbsGrams: 230,
            targetFatGrams: 65,
            meals: [
              { id: "m1", time: "07:30 AM", name: "Whey Protein Oats with Chia Seeds & Blueberries", calories: 540, protein: 44, carbs: 68, fats: 12 },
              { id: "m2", time: "12:30 PM", name: "Grilled Chicken Breast, Brown Rice & Roast Broccoli", calories: 710, protein: 58, carbs: 75, fats: 14 },
              { id: "m3", time: "04:00 PM", name: "Pre-Workout Greek Yogurt Bowl with Honey & Walnuts", calories: 390, protein: 29, carbs: 42, fats: 11 },
              { id: "m4", time: "08:00 PM", name: "Pan-Seared Salmon Fillet, Sweet Potato Mash & Asparagus", calories: 810, protein: 48, carbs: 58, fats: 28 },
            ],
            workouts: [
              { id: "w1", day: "Mon", exercise: "Barbell Squats & Romanian Deadlifts", sets: 4, reps: "8-10 reps", targetMuscle: "Quads & Hamstrings", restSec: 90 },
              { id: "w2", day: "Tue", exercise: "Incline Dumbbell Press & Weighted Pull-Ups", sets: 4, reps: "10-12 reps", targetMuscle: "Chest & Latissimus", restSec: 75 },
              { id: "w3", day: "Thu", exercise: "Kettlebell Cleans & Plyometric Box Jumps", sets: 5, reps: "45s on / 15s off", targetMuscle: "Metabolic Conditioning", restSec: 60 },
              { id: "w4", day: "Fri", exercise: "Standing Overhead Military Press & Lateral Raises", sets: 4, reps: "10-12 reps", targetMuscle: "Shoulders & Core", restSec: 75 },
              { id: "w5", day: "Sat", exercise: "Active Recovery: Functional Mobility Flow & Foam Rolling", sets: 3, reps: "20 min", targetMuscle: "Full Body Recovery", restSec: 45 },
            ],
            isDefault: true,
          };
        }
        res.json(plan);
      } catch (err) {
        console.error("Fetch plan error:", err);
        res.status(500).json({ message: "Failed to fetch plan" });
      }
    });

    app.post("/api/plans/assign", verifyToken, checkBlockedUser, async (req, res) => {
      try {
        const {
          memberEmail,
          title,
          goal,
          dailyCalories,
          waterGoalLiters,
          targetProteinGrams,
          targetCarbsGrams,
          targetFatGrams,
          meals,
          workouts,
        } = req.body;

        if (!memberEmail) {
          return res.status(400).json({ message: "Member email is required" });
        }

        const planDoc = {
          memberEmail,
          trainerEmail: req.user.email,
          trainerName: req.user.name || "PulseForge Trainer",
          title: title || "Personalized Fitness Protocol",
          goal: goal || "Athletic Conditioning",
          dailyCalories: Number(dailyCalories) || 2200,
          waterGoalLiters: Number(waterGoalLiters) || 3.0,
          targetProteinGrams: Number(targetProteinGrams) || 150,
          targetCarbsGrams: Number(targetCarbsGrams) || 200,
          targetFatGrams: Number(targetFatGrams) || 60,
          meals: meals || [],
          workouts: workouts || [],
          updatedAt: new Date(),
        };

        await plansCollection.updateOne(
          { memberEmail },
          { $set: planDoc },
          { upsert: true }
        );

        await notificationsCollection.insertOne({
          userEmail: memberEmail,
          title: "🥗 New Plan Assigned!",
          message: `${req.user.name || "Your Trainer"} assigned or updated your custom Diet & Workout protocol.`,
          type: "success",
          read: false,
          createdAt: new Date(),
        });

        res.json({ success: true, message: "Plan assigned successfully!" });
      } catch (err) {
        console.error("Assign plan error:", err);
        res.status(500).json({ message: "Failed to assign plan" });
      }
    });

    app.get("/api/plans/trainer/clients", verifyToken, async (req, res) => {
      try {
        const trainerEmail = req.user.email;
        const trainerClasses = await classesCollection
          .find({ trainerEmail })
          .project({ _id: 1, title: 1 })
          .toArray();
        const classIds = trainerClasses.map((c) => c._id.toString());

        const bookings = await bookingsCollection
          .find({ classId: { $in: classIds } })
          .toArray();

        const clientMap = new Map();
        for (const b of bookings) {
          if (!clientMap.has(b.userEmail)) {
            clientMap.set(b.userEmail, {
              email: b.userEmail,
              name: b.userName || "Athlete",
              className: b.className,
              bookedAt: b.paidAt || b.createdAt,
            });
          }
        }

        const clients = Array.from(clientMap.values());
        res.json(clients);
      } catch (err) {
        console.error("Trainer clients error:", err);
        res.status(500).json({ message: "Failed to fetch clients" });
      }
    });

    app.get("/api/plans/log/:date", verifyToken, async (req, res) => {
      try {
        const { date } = req.params;
        const log = await dailyLogsCollection.findOne({
          memberEmail: req.user.email,
          date,
        });
        res.json(log || { date, completedWorkouts: [], completedMeals: [], waterConsumedLiters: 0 });
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch daily log" });
      }
    });

    app.post("/api/plans/log", verifyToken, async (req, res) => {
      try {
        const { date, completedWorkouts, completedMeals, waterConsumedLiters, notes } = req.body;
        if (!date) return res.status(400).json({ message: "Date is required" });

        const logDoc = {
          memberEmail: req.user.email,
          date,
          completedWorkouts: completedWorkouts || [],
          completedMeals: completedMeals || [],
          waterConsumedLiters: Number(waterConsumedLiters) || 0,
          notes: notes || "",
          updatedAt: new Date(),
        };

        await dailyLogsCollection.updateOne(
          { memberEmail: req.user.email, date },
          { $set: logDoc },
          { upsert: true }
        );

        res.json({ success: true, message: "Daily progress recorded!" });
      } catch (err) {
        console.error("Save daily log error:", err);
        res.status(500).json({ message: "Failed to save daily log" });
      }
    });

    /* ========================================================
       13. BODY TRANSFORMATION & MEASUREMENTS API
       ======================================================== */
    app.get("/api/progress/my", verifyToken, async (req, res) => {
      try {
        const logs = await progressCollection
          .find({ userEmail: req.user.email })
          .sort({ date: 1 })
          .toArray();

        // If user has no logs, return seed progress history
        if (logs.length === 0) {
          const sampleProgress = [
            { date: "2026-09-01", weight: 82.5, bodyFat: 21.4, chest: 104, waist: 88, biceps: 37, notes: "Baseline assessment" },
            { date: "2026-09-15", weight: 81.2, bodyFat: 20.2, chest: 104.5, waist: 86.5, biceps: 37.2, notes: "Improved endurance, clean eating" },
            { date: "2026-10-01", weight: 79.8, bodyFat: 18.9, chest: 105, waist: 85, biceps: 37.8, notes: "Deficit maintained, hitting squats" },
            { date: "2026-10-15", weight: 78.4, bodyFat: 17.5, chest: 105.5, waist: 83.5, biceps: 38.2, notes: "Visible abdominal definition" },
            { date: "2026-10-23", weight: 77.1, bodyFat: 16.2, chest: 106, waist: 82, biceps: 38.6, notes: "Peak athletic form achieved!" },
          ];
          return res.json(sampleProgress);
        }

        res.json(logs);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch progress logs" });
      }
    });

    app.post("/api/progress/log", verifyToken, checkBlockedUser, async (req, res) => {
      try {
        const { date, weight, bodyFat, chest, waist, biceps, notes, photoUrl } = req.body;
        if (!date || !weight) {
          return res.status(400).json({ message: "Date and weight are required" });
        }

        const progressDoc = {
          userEmail: req.user.email,
          userName: req.user.name || "Athlete",
          date,
          weight: Number(weight),
          bodyFat: bodyFat ? Number(bodyFat) : null,
          chest: chest ? Number(chest) : null,
          waist: waist ? Number(waist) : null,
          biceps: biceps ? Number(biceps) : null,
          notes: notes || "",
          photoUrl: photoUrl || "",
          createdAt: new Date(),
        };

        const result = await progressCollection.insertOne(progressDoc);
        res.status(201).json({ success: true, ...progressDoc, _id: result.insertedId });
      } catch (err) {
        console.error("Progress log error:", err);
        res.status(500).json({ message: "Failed to log progress" });
      }
    });

    app.delete("/api/progress/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });

        await progressCollection.deleteOne({
          _id: new ObjectId(id),
          userEmail: req.user.email,
        });

        res.json({ success: true, message: "Measurement removed" });
      } catch (err) {
        res.status(500).json({ message: "Failed to delete measurement" });
      }
    });

    /* ========================================================
       14. REVIEWS & STAR RATING SYSTEM API
       ======================================================== */
    app.get("/api/reviews/class/:classId", async (req, res) => {
      try {
        const { classId } = req.params;
        const reviews = await reviewsCollection
          .find({ classId })
          .sort({ createdAt: -1 })
          .toArray();

        let totalScore = 0;
        const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        for (const r of reviews) {
          totalScore += r.rating;
          if (counts[r.rating] !== undefined) counts[r.rating]++;
        }

        const totalReviews = reviews.length;
        const averageRating = totalReviews > 0 ? Number((totalScore / totalReviews).toFixed(1)) : 5.0;

        res.json({
          reviews,
          averageRating,
          totalReviews,
          counts,
        });
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch reviews" });
      }
    });

    app.post("/api/reviews", verifyToken, checkBlockedUser, async (req, res) => {
      try {
        const { classId, rating, comment } = req.body;
        if (!classId || !rating || !comment?.trim()) {
          return res.status(400).json({ message: "Class ID, rating (1-5), and review text are required" });
        }

        const cls = await classesCollection.findOne({ _id: new ObjectId(classId) });
        if (!cls) return res.status(404).json({ message: "Class not found" });

        const existingReview = await reviewsCollection.findOne({
          classId,
          userEmail: req.user.email,
        });
        if (existingReview) {
          return res.status(400).json({ message: "You have already reviewed this class" });
        }

        const booking = await bookingsCollection.findOne({
          classId,
          userEmail: req.user.email,
        });

        const reviewDoc = {
          classId,
          className: cls.title,
          trainerEmail: cls.trainerEmail,
          trainerName: cls.trainerName || "Trainer",
          userEmail: req.user.email,
          userName: req.user.name || "PulseForge Athlete",
          userImage: req.user.image || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop",
          rating: Number(rating),
          comment: comment.trim(),
          verifiedBooking: !!booking,
          createdAt: new Date(),
        };

        const result = await reviewsCollection.insertOne(reviewDoc);

        const allReviews = await reviewsCollection.find({ classId }).toArray();
        const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
        await classesCollection.updateOne(
          { _id: new ObjectId(classId) },
          {
            $set: {
              averageRating: Number(avg.toFixed(1)),
              totalReviews: allReviews.length,
            },
          }
        );

        res.status(201).json({ success: true, review: { ...reviewDoc, _id: result.insertedId } });
      } catch (err) {
        console.error("Submit review error:", err);
        res.status(500).json({ message: "Failed to submit review" });
      }
    });

    app.get("/api/reviews/featured", async (req, res) => {
      try {
        const featured = await reviewsCollection
          .find({ rating: { $gte: 4 } })
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        if (featured.length < 3) {
          const defaults = [
            {
              _id: "seed_r1",
              userName: "Alexander Vance",
              userImage: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop",
              className: "Olympic Weightlifting & Strength",
              trainerName: "Marcus Vance",
              rating: 5,
              comment: "The coaching precision in this class completely revolutionized my snatch technique and squat depth. Added 20kg to my PR in 6 weeks!",
              verifiedBooking: true,
              createdAt: new Date(),
            },
            {
              _id: "seed_r2",
              userName: "Elena Rostova",
              userImage: "https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop",
              className: "High-Intensity Metabolic Conditioning (HIIT)",
              trainerName: "Elena Rostova",
              rating: 5,
              comment: "Insane cardiovascular push and relentless energy. The live workout HUD and heart rate metrics keep me accountable every single round.",
              verifiedBooking: true,
              createdAt: new Date(),
            },
            {
              _id: "seed_r3",
              userName: "Liam O'Connor",
              userImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop",
              className: "Power Yoga & Core Mobilization",
              trainerName: "Aria Thorne",
              rating: 5,
              comment: "As a former rugby player with chronic lower back stiffness, this routine restored my thoracic mobility and hamstring elasticity.",
              verifiedBooking: true,
              createdAt: new Date(),
            },
          ];
          return res.json([...featured, ...defaults]);
        }

        res.json(featured);
      } catch (err) {
        res.status(500).json({ message: "Failed to fetch featured reviews" });
      }
    });

    // Root check
    app.get("/", (req, res) => {
      res.json({
        name: "PulseForge API",
        status: "Operational",
        version: "1.0.0",
      });
    });

    // Start server
    app.listen(port, () => {
      console.log(`PulseForge Backend running on port ${port}`);
    });
  } catch (err) {
    console.error("MongoDB Startup Connection Error:", err);
  }
}

run().catch(console.dir);

module.exports = app;
