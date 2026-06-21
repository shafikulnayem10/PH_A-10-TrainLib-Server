require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: ['http://localhost:3000', 'https://train-lib-seven.vercel.app'],
    credentials: true
}));

app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let classesCollection;
let postsCollection;
let bookingsCollection;
let favoritesCollection;
let commentsCollection;
let usersCollection;
let sessionCollection;
let trainerApplicationsCollection;


// async function run() {
//    
//         await client.connect();
//         console.log("Successfully connected to MongoDB Atlas!");
client.connect(()=>{
    console.log("connecting to MongoDB");
}).catch(console.dir)

 try {
        const db = client.db(process.env.AUTH_DB_NAME || "trainlibDB");

        classesCollection = db.collection("classes");
        postsCollection = db.collection("forum_posts");
        bookingsCollection = db.collection("bookings");
        favoritesCollection = db.collection("favorites");
        commentsCollection = db.collection("forum_comments");
        usersCollection = db.collection("user");
        sessionCollection = db.collection("session");
        trainerApplicationsCollection = db.collection("trainer_applications");

        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
// }
// // run().catch(console.dir);

const checkSoftBan = async (req, res, next) => {
    if (req.user?.softBanned === true) {
        return res.status(403).send({
            success: false,
            message: "Action restricted by Admin. Your account has been restricted.",
            code: "SOFT_BANNED"
        });
    }
    next();
};

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers?.authorization;
        if (!authHeader) {
            return res.status(401).send({ message: 'unauthorized access' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).send({ message: 'unauthorized access' });
        }

        const session = await sessionCollection.findOne({ token: token });
        if (!session) {
            return res.status(401).send({ message: 'unauthorized access' });
        }

        const user = await usersCollection.findOne({ _id: session.userId });
        if (!user) {
            return res.status(401).send({ message: 'unauthorized access' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Error in verifyToken middleware:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
};

const verifyUser = async (req, res, next) => {
    if (req.user?.role !== 'user') {
        return res.status(403).send({ message: 'forbidden access' });
    }
    next();
};

const verifyTrainer = async (req, res, next) => {
    if (req.user?.role !== 'trainer') {
        return res.status(403).send({ message: 'forbidden access' });
    }
    next();
};

const verifyAdmin = async (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
    }
    next();
};

app.get('/featured-classes', async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const result = await classesCollection
            .find()
            .sort({ bookingCount: -1 })
            .limit(6)
            .toArray();

        res.send(result);
    } catch (error) {
        console.error("Error fetching featured classes:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/all-classes', async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const { search, category, page, perPage } = req.query;
        let query = { status: "approved" };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { className: { $regex: search, $options: 'i' } }
            ];
        }

        if (category && category !== 'All') {
            query.category = category;
        }

        if (page) {
            const currentPage = parseInt(page, 10) || 1;
            const limitItems = parseInt(perPage, 10) || 12;
            const skipItems = (currentPage - 1) * limitItems;

            const total = await classesCollection.countDocuments(query);
            const classes = await classesCollection.find(query).skip(skipItems).limit(limitItems).toArray();

            return res.send({ total, classes });
        }

        const total = await classesCollection.countDocuments(query);
        const classes = await classesCollection.find(query).toArray();
        res.send({ total, classes });

    } catch (error) {
        console.error("Error fetching all classes:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/classes/:id', async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const id = req.params.id;
        const result = await classesCollection.findOne({ _id: new ObjectId(id) });
        if (!result) {
            return res.status(404).send({ message: "Class not found" });
        }
        res.send(result);
    } catch (error) {
        console.error("Error fetching class details:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.post('/api/bookings', verifyToken, verifyUser, checkSoftBan, async (req, res) => {
    try {
        if (!bookingsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const bookingData = req.body;
        const exists = await bookingsCollection.findOne({
            classId: bookingData.classId,
            userEmail: bookingData.userEmail
        });

        if (exists) {
            return res.status(400).send({ success: false, message: "You have already booked this class" });
        }

        // Get user name from the authenticated user
        const userName = req.user?.name || bookingData.userName || 'Unknown User';

        const result = await bookingsCollection.insertOne({
            ...bookingData,
            userName: userName,
            bookedAt: new Date()
        });

        if (classesCollection && bookingData.classId) {
            let classQuery = ObjectId.isValid(bookingData.classId)
                ? { _id: new ObjectId(bookingData.classId) }
                : { _id: bookingData.classId };

            await classesCollection.updateOne(classQuery, { $inc: { bookingCount: 1 } });
        }

        res.send({
            success: true,
            insertedId: result.insertedId,
            message: "Booking successful and count updated!"
        });
    } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/bookings/check', async (req, res) => {
    try {
        if (!bookingsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const { classId, email } = req.query;
        const alreadyBooked = await bookingsCollection.findOne({ classId, userEmail: email });
        res.send({ isBooked: !!alreadyBooked });
    } catch (error) {
        console.error("Error checking booking status:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.post('/api/favorites', async (req, res) => {
    try {
        if (!favoritesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const favoriteData = req.body;
        const exists = await favoritesCollection.findOne({
            classId: favoriteData.classId,
            userEmail: favoriteData.userEmail
        });

        if (exists) {
            await favoritesCollection.deleteOne({
                classId: favoriteData.classId,
                userEmail: favoriteData.userEmail
            });
            return res.send({ success: true, isFavorite: false, message: "Successfully removed from your favorites!" });
        } else {
            const result = await favoritesCollection.insertOne(favoriteData);
            return res.send({ success: true, isFavorite: true, insertedId: result.insertedId, message: "Successfully added to your favorites!" });
        }
    } catch (error) {
        console.error("Error toggling favorite status:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/favorites/check', async (req, res) => {
    try {
        if (!favoritesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const { classId, email } = req.query;
        const isFavorite = await favoritesCollection.findOne({ classId, userEmail: email });
        res.send({ isFavorite: !!isFavorite });
    } catch (error) {
        console.error("Error checking favorite status:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/latest-posts', async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const result = await postsCollection.find().sort({ createdAt: -1 }).limit(4).toArray();
        res.send(result);
    } catch (error) {
        console.error("Error fetching latest forum posts:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

// FORUM ROUTES WITH PAGINATION

app.get('/api/forum', async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const { page, perPage } = req.query;
        const currentPage = parseInt(page, 10) || 1;
        const limitItems = parseInt(perPage, 10) || 4;
        const skipItems = (currentPage - 1) * limitItems;

        const total = await postsCollection.countDocuments({});
        const posts = await postsCollection
            .find({})
            .sort({ createdAt: -1 })
            .skip(skipItems)
            .limit(limitItems)
            .toArray();

        res.send({
            total,
            page: currentPage,
            perPage: limitItems,
            totalPages: Math.ceil(total / limitItems),
            posts
        });

    } catch (error) {
        console.error("Error fetching forum posts:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/forum/:id', async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const id = req.params.id;
        const result = await postsCollection.findOne({ _id: new ObjectId(id) });
        if (!result) {
            return res.status(404).send({ message: "Forum post not found" });
        }
        res.send(result);
    } catch (error) {
        console.error("Error fetching single forum post:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/forum/:id/comments', async (req, res) => {
    try {
        if (!commentsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const id = req.params.id;
        const comments = await commentsCollection.find({ postId: id }).sort({ createdAt: -1 }).toArray();
        res.send(comments);
    } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.post('/api/forum/:id/comment', verifyToken, checkSoftBan, async (req, res) => {
    try {
        if (!commentsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const postId = req.params.id;
        const { text, userEmail, userImage, userName } = req.body;
        
        
        const authorName = userName || req.user?.name || 'Community Member';
        const authorEmail = userEmail || req.user?.email;
        const authorImage = userImage || req.user?.image || null;
        const authorRole = req.user?.role || 'user';

        if (!text || !authorEmail) {
            return res.status(400).send({ message: "Text and email are required" });
        }

        const newComment = {
            postId,
            text,
            userEmail: authorEmail,
            userImage: authorImage,
            userName: authorName,
            authorRole: authorRole,
            replies: [],
            createdAt: new Date()
        };

        const result = await commentsCollection.insertOne(newComment);
        res.send({ success: true, insertedId: result.insertedId });
    } catch (error) {
        console.error("Error saving comment:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});



app.patch('/api/forum/comment/:commentId', async (req, res) => {
    try {
        if (!commentsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const commentId = req.params.commentId;
        const { text, userEmail } = req.body;
        const result = await commentsCollection.updateOne(
            { _id: new ObjectId(commentId), userEmail: userEmail },
            { $set: { text: text } }
        );
        res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error("Error updating comment:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.delete('/api/forum/comment/:commentId', async (req, res) => {
    try {
        if (!commentsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const commentId = req.params.commentId;
        const { userEmail } = req.body;
        const result = await commentsCollection.deleteOne({
            _id: new ObjectId(commentId),
            userEmail: userEmail
        });
        res.send({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        console.error("Error deleting comment:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

// REPLY ROUTE - Allow all authenticated users
app.post('/api/forum/comment/:commentId/reply', verifyToken, checkSoftBan, async (req, res) => {
    try {
        if (!commentsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const commentId = req.params.commentId?.trim();
        if (!commentId || !ObjectId.isValid(commentId)) {
            return res.status(400).send({ message: "Invalid Comment ID format" });
        }

        const { text, userEmail, userName, userImage } = req.body;
        
        const authorName = userName || req.user?.name || 'Community Member';
        const authorEmail = userEmail || req.user?.email;
        const authorImage = userImage || req.user?.image || null;
        const authorRole = req.user?.role || 'user';

        if (!text || !authorEmail) {
            return res.status(400).send({ message: "Text and userEmail are required" });
        }

        const newReply = {
            text: text.trim(),
            userEmail: authorEmail,
            userName: authorName,
            userImage: authorImage,
            authorRole: authorRole,
            createdAt: new Date()
        };

        const result = await commentsCollection.updateOne(
            { _id: new ObjectId(commentId) },
            { $push: { replies: newReply } }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).send({ message: "Comment not found or not updated" });
        }

        res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        console.error("Error adding reply:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.patch('/api/forum/:id/vote', async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const postId = req.params.id;
        const { userId, voteType } = req.body;

        if (!userId) {
            return res.status(400).send({ message: "User ID is required to register a vote." });
        }

        const post = await postsCollection.findOne({ _id: new ObjectId(postId) });
        if (!post) {
            return res.status(404).send({ message: "Forum post not found" });
        }

        const likes = post.likes || [];
        const dislikes = post.dislikes || [];
        let updateAction = {};

        if (voteType === 'like') {
            if (likes.includes(userId)) {
                updateAction = { $pull: { likes: userId } };
            } else {
                updateAction = {
                    $addToSet: { likes: userId },
                    $pull: { dislikes: userId }
                };
            }
        } else if (voteType === 'dislike') {
            if (dislikes.includes(userId)) {
                updateAction = { $pull: { dislikes: userId } };
            } else {
                updateAction = {
                    $addToSet: { dislikes: userId },
                    $pull: { likes: userId }
                };
            }
        }

        await postsCollection.updateOne({ _id: new ObjectId(postId) }, updateAction);
        const updatedPost = await postsCollection.findOne({ _id: new ObjectId(postId) });

        res.send({
            success: true,
            likes: updatedPost.likes || [],
            dislikes: updatedPost.dislikes || []
        });
    } catch (error) {
        console.error("Error processing post vote:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.post('/api/user/apply-trainer', verifyToken, verifyUser, checkSoftBan, async (req, res) => {
    try {
        if (!trainerApplicationsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const { experience, specialty, bio } = req.body;
        const userEmail = req.user.email;

        if (!experience || !specialty) {
            return res.status(400).send({ success: false, message: "Experience and Specialty are required fields." });
        }

        // Check if user has an existing application
        const existingApplication = await trainerApplicationsCollection.findOne({ userEmail: userEmail });

        // If application exists and is Pending or Approved, prevent new application
        if (existingApplication) {
            if (existingApplication.status === 'Pending') {
                return res.status(400).send({
                    success: false,
                    message: `You have already applied! Current Status: ${existingApplication.status}`
                });
            }
            
            if (existingApplication.status === 'Approved') {
                return res.status(400).send({
                    success: false,
                    message: 'You are already an approved trainer!'
                });
            }

            // If status is Rejected, update the existing application instead of creating new
            if (existingApplication.status === 'Rejected') {
                const result = await trainerApplicationsCollection.updateOne(
                    { _id: existingApplication._id },
                    {
                        $set: {
                            experience: parseInt(experience, 10),
                            specialty: specialty,
                            bio: bio || "",
                            status: "Pending",
                            feedback: null,
                            appliedAt: new Date()
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: "Application not found" });
                }

                return res.status(200).send({
                    success: true,
                    message: "Application re-submitted successfully! Waiting for admin approval."
                });
            }
        }

        // Create new application for first-time applicants
        const applicationData = {
            userId: req.user._id,
            userName: req.user.name,
            userEmail: userEmail,
            userImage: req.user.image || null,
            experience: parseInt(experience, 10),
            specialty: specialty,
            bio: bio || "",
            status: "Pending",
            feedback: null,
            appliedAt: new Date()
        };

        const result = await trainerApplicationsCollection.insertOne(applicationData);
        res.status(201).send({
            success: true,
            insertedId: result.insertedId,
            message: "Application submitted successfully! Waiting for admin approval."
        });

    } catch (error) {
        console.error("Error creating trainer application:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/user/trainer-status', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!trainerApplicationsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const userEmail = req.user.email;
        
        // First check if user is a trainer
        if (req.user?.role === 'trainer') {
            const application = await trainerApplicationsCollection.findOne({ userEmail: userEmail });
            if (application) {
                return res.send({
                    success: true,
                    status: application.status,
                    feedback: application.feedback || null,
                    appliedAt: application.appliedAt
                });
            }
            // If user is trainer but no application exists, return approved status
            return res.send({
                success: true,
                status: 'Approved',
                feedback: null,
                appliedAt: null
            });
        }

        // For non-trainers, check for application
        const application = await trainerApplicationsCollection.findOne({ userEmail: userEmail });

        if (!application) {
            return res.send({ success: true, status: "Not Applied", feedback: null });
        }

      
        if (application.status === 'Approved' && req.user?.role !== 'trainer') {
            await trainerApplicationsCollection.deleteOne({ userEmail: userEmail });
            return res.send({ success: true, status: "Not Applied", feedback: null });
        }

        res.send({
            success: true,
            status: application.status,
            feedback: application.feedback || null,
            appliedAt: application.appliedAt
        });

    } catch (error) {
        console.error("Error fetching trainer application status:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/user/overview', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!bookingsCollection || !favoritesCollection || !trainerApplicationsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const userEmail = req.user.email;
        const totalBooked = await bookingsCollection.countDocuments({ userEmail: userEmail });
        const totalFavorites = await favoritesCollection.countDocuments({ userEmail: userEmail });
        const application = await trainerApplicationsCollection.findOne({ userEmail: userEmail });

        const trainerStatus = application ? application.status : "Not Applied";
        const adminFeedback = application?.feedback || null;

        res.send({
            success: true,
            stats: { totalBooked, totalFavorites },
            profile: {
                name: req.user.name,
                email: req.user.email,
                image: req.user.image || null,
                role: req.user.role || 'user',
            },
            trainerApplication: {
                status: trainerStatus,
                feedback: adminFeedback
            }
        });
    } catch (error) {
        console.error("Error fetching user overview data:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/user/booked-classes', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!bookingsCollection || !classesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const userEmail = req.user.email;

        // Get all bookings for the user
        const bookedClasses = await bookingsCollection
            .find({ userEmail: userEmail })
            .sort({ bookedAt: -1 })
            .toArray();

        // Enrich bookings with class schedule data
        const enrichedBookings = await Promise.all(
            bookedClasses.map(async (booking) => {
                let classSchedule = null;
                let classDetails = null;

                // Try to find the class in classes collection
                if (booking.classId) {
                    try {
                        // Check if classId is a valid ObjectId
                        let query;
                        if (ObjectId.isValid(booking.classId)) {
                            query = { _id: new ObjectId(booking.classId) };
                        } else {
                            query = { _id: booking.classId };
                        }
                        
                        classDetails = await classesCollection.findOne(query);
                        if (classDetails) {
                            classSchedule = classDetails.classSchedule || null;
                        }
                    } catch (error) {
                        console.error("Error fetching class details:", error);
                    }
                }

                return {
                    ...booking,
                    classSchedule: classSchedule || booking.classSchedule || null
                };
            })
        );

        res.send({
            success: true,
            data: enrichedBookings
        });
    } catch (error) {
        console.error("Error fetching booked classes:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/user/favorites', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!favoritesCollection || !classesCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const userEmail = req.user.email;

        const userFavorites = await favoritesCollection.aggregate([
            {
                $match: { userEmail: userEmail }
            },
            {
                $addFields: {
                    convertedClassId: {
                        $cond: {
                            if: {
                                $and: [
                                    { $ne: ["$classId", null] },
                                    { $regexMatch: { input: { $toString: "$classId" }, regex: "^[0-9a-fA-F]{24}$" } }
                                ]
                            },
                            then: { $toObjectId: "$classId" },
                            else: "$classId"
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "classes",
                    localField: "convertedClassId",
                    foreignField: "_id",
                    as: "classDetails"
                }
            },
            {
                $unwind: {
                    path: "$classDetails",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    classId: 1,
                    userEmail: 1,
                    description: { $ifNull: ["$classDetails.description", "$description", "No description available."] },
                    className: { $ifNull: ["$classDetails.className", "$classDetails.name", "$className", "$name"] },
                    image: { $ifNull: ["$classDetails.image", "$image", null] }
                }
            }
        ]).toArray();

        res.send({
            success: true,
            data: userFavorites
        });
    } catch (error) {
        console.error("Error fetching favorite classes:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.get('/api/trainer/overview', verifyToken, verifyTrainer, async (req, res) => {
    try {
        if (!classesCollection || !bookingsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const currentTrainerId = req.user._id?.toString() || req.user.id;

        const totalClasses = await classesCollection.countDocuments({
            trainerId: currentTrainerId
        });

        const trainerClasses = await classesCollection.find({ trainerId: currentTrainerId }).toArray();
        const totalBookings = trainerClasses.reduce((sum, currentClass) => {
            return sum + (currentClass.bookingCount || 0);
        }, 0);

        const classIds = trainerClasses.map(c => c._id?.toString());

        let recentBookings = [];
        if (classIds.length > 0) {
            recentBookings = await bookingsCollection.find({
                classId: { $in: classIds }
            })
            .sort({ bookedAt: -1 })
            .limit(5)
            .toArray();
        }

        res.send({
            success: true,
            stats: {
                totalClasses,
                totalBookings
            },
            profile: {
                name: req.user.name,
                email: req.user.email,
                image: req.user.image || null,
                role: req.user.role || 'trainer',
            },
            recentBookings
        });
    } catch (error) {
        console.error("Error fetching trainer overview data:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.post('/api/trainer/add-class', verifyToken, verifyTrainer, checkSoftBan, async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const { className, category, duration, description, objectives, requirements, image, price, classSchedule } = req.body;

        if (!className || !category || !duration || !description || !image) {
            return res.status(400).send({
                success: false,
                message: "Missing required fields! Class name, category, duration, description, and image are mandatory."
            });
        }

        const currentTrainerId = req.user._id?.toString() || req.user.id;

        const newClass = {
            trainerId: currentTrainerId,
            trainerName: req.user.name,
            trainerEmail: req.user.email,
            className: className.trim(),
            category: category.trim(),
            price: price,
            duration: duration.trim(),
            classSchedule: classSchedule?.trim() || null,
            description: description.trim(),
            objectives: objectives ? objectives.split(',').map(item => item.trim()).filter(Boolean) : [],
            requirements: requirements ? requirements.split(',').map(item => item.trim()).filter(Boolean) : [],
            image: image,
            status: "pending",
            bookingCount: 0,
            students: [],
            createdAt: new Date()
        };

        const result = await classesCollection.insertOne(newClass);

        res.status(201).send({
            success: true,
            insertedId: result.insertedId,
            message: "Class added successfully! Waiting for admin approval."
        });

    } catch (error) {
        console.error("Error in /api/trainer/add-class:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.get('/api/trainer/my-classes', verifyToken, verifyTrainer, async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const currentTrainerId = req.user._id?.toString() || req.user.id;

        const myClasses = await classesCollection
            .find({ trainerId: currentTrainerId })
            .sort({ createdAt: -1 })
            .toArray();

        res.send({
            success: true,
            data: myClasses
        });
    } catch (error) {
        console.error("Error fetching trainer's classes:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.get('/api/trainer/classes/:id/students', verifyToken, verifyTrainer, async (req, res) => {
    try {
        if (!bookingsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }
        const classId = req.params.id;
        const students = await bookingsCollection.find({ classId: classId }).toArray();
        res.send({ success: true, data: students });
    } catch (error) {
        console.error("Error fetching class students:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.patch("/api/trainer/classes/:id", verifyToken, verifyTrainer, async (req, res) => {
    try {
        const classId = req.params.id;
        const currentTrainerId = req.user._id?.toString() || req.user.id;
        const updateData = req.body;

        const query = {
            _id: new ObjectId(classId),
            trainerId: currentTrainerId,
        };

        const updateDoc = {
            $set: {
                className: updateData.className?.trim(),
                category: updateData.category?.trim(),
                difficulty: updateData.difficulty,
                duration: updateData.duration?.trim(),
                price: Number(updateData.price),
                classSchedule: updateData.classSchedule?.trim() || null,
                description: updateData.description?.trim(),
                objectives: updateData.objectives || [],
                requirements: updateData.requirements || [],
                image: updateData.image || "",
            },
        };

        const result = await classesCollection.updateOne(query, updateDoc);

        if (result.matchedCount === 0) {
            return res.status(404).send({
                success: false,
                message: "Class not found",
            });
        }

        res.send({
            success: true,
            message: "Class updated successfully",
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({
            success: false,
            message: "Internal Server Error",
        });
    }
});

app.delete('/api/trainer/classes/:id', verifyToken, verifyTrainer, async (req, res) => {
    try {
        if (!classesCollection || !bookingsCollection || !favoritesCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }
        const classId = req.params.id;
        const currentTrainerId = req.user._id?.toString() || req.user.id;

        // Find the class first to verify ownership
        const classData = await classesCollection.findOne({ 
            _id: new ObjectId(classId), 
            trainerId: currentTrainerId 
        });

        if (!classData) {
            return res.status(404).send({ success: false, message: "Class not found or unauthorized" });
        }

        // Delete the class
        const result = await classesCollection.deleteOne({ 
            _id: new ObjectId(classId), 
            trainerId: currentTrainerId 
        });

        if (result.deletedCount === 0) {
            return res.status(404).send({ success: false, message: "Class not found or unauthorized" });
        }

        // Delete all bookings associated with this class
        const deleteBookingsResult = await bookingsCollection.deleteMany({ classId: classId });

        // Delete all favorites associated with this class
        const deleteFavoritesResult = await favoritesCollection.deleteMany({ classId: classId });

        res.send({ 
            success: true, 
            message: "Class deleted successfully!",
            bookingsDeleted: deleteBookingsResult.deletedCount || 0,
            favoritesDeleted: deleteFavoritesResult.deletedCount || 0
        });
    } catch (error) {
        console.error("Error deleting class:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.post('/api/trainer/forum/create', verifyToken, verifyTrainer, checkSoftBan, async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const { title, description, image } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).send({
                success: false,
                message: "Title is required!"
            });
        }

        if (!description || !description.trim()) {
            return res.status(400).send({
                success: false,
                message: "Description is required!"
            });
        }

        if (!image || !image.trim()) {
            return res.status(400).send({
                success: false,
                message: "Image URL is required!"
            });
        }

        const newPost = {
            title: title.trim(),
            description: description.trim(),
            image: image.trim(),
            authorId: req.user._id?.toString() || req.user.id,
            authorName: req.user.name || "Trainer",
            authorEmail: req.user.email,
            authorImage: req.user.image || null,
            authorRole: "trainer",
            likes: [],
            dislikes: [],
            comments: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await postsCollection.insertOne(newPost);

        res.status(201).send({
            success: true,
            insertedId: result.insertedId,
            message: "Forum post created successfully!"
        });

    } catch (error) {
        console.error("Error in /api/trainer/forum/create:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.get('/api/trainer/forum/my-posts', verifyToken, verifyTrainer, async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const trainerId = req.user._id?.toString() || req.user.id;

        const myPosts = await postsCollection
            .find({ authorId: trainerId })
            .sort({ createdAt: -1 })
            .toArray();

        res.send({
            success: true,
            data: myPosts
        });

    } catch (error) {
        console.error("Error fetching trainer's forum posts:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.delete('/api/trainer/forum/:id', verifyToken, verifyTrainer, async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const postId = req.params.id;
        const trainerId = req.user._id?.toString() || req.user.id;

        const query = {
            _id: new ObjectId(postId),
            authorId: trainerId
        };

        const result = await postsCollection.deleteOne(query);

        if (result.deletedCount === 0) {
            return res.status(404).send({
                success: false,
                message: "Post not found or unauthorized"
            });
        }

        if (commentsCollection) {
            await commentsCollection.deleteMany({ postId: postId });
        }

        res.send({
            success: true,
            message: "Forum post deleted successfully!"
        });

    } catch (error) {
        console.error("Error deleting forum post:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.get('/api/admin/overview', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!usersCollection || !classesCollection || !bookingsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const totalUsers = await usersCollection.countDocuments({});
        const totalClasses = await classesCollection.countDocuments({ status: 'approved' });
        const totalBookings = await bookingsCollection.countDocuments({});

        const adminProfile = {
            name: req.user.name,
            email: req.user.email,
            image: req.user.image || null,
            role: req.user.role || 'admin',
            createdAt: req.user.createdAt || new Date()
        };

        res.send({
            success: true,
            stats: {
                totalUsers,
                totalClasses,
                totalBookings
            },
            profile: adminProfile
        });

    } catch (error) {
        console.error("Error fetching admin overview:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.get('/api/admin/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!usersCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const users = await usersCollection
            .find({})
            .project({
                password: 0,
                __v: 0
            })
            .sort({ createdAt: -1 })
            .toArray();

        res.send({
            success: true,
            data: users
        });

    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.patch('/api/admin/users/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!usersCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const userId = req.params.id;
        const { status } = req.body;

        if (!['active', 'blocked'].includes(status)) {
            return res.status(400).send({
                success: false,
                message: "Invalid status. Must be 'active' or 'blocked'"
            });
        }

        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(404).send({ success: false, message: "User not found" });
        }

        if (user.role === 'admin') {
            return res.status(403).send({
                success: false,
                message: "Cannot modify admin user status"
            });
        }

        const softBanned = status === 'blocked';

        const result = await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    softBanned: softBanned,
                    banned: false,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ success: false, message: "User not found" });
        }

        res.send({
            success: true,
            message: `User ${status === 'active' ? 'unblocked' : 'blocked'} successfully`
        });

    } catch (error) {
        console.error("Error updating user status:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.patch('/api/admin/users/:id/make-admin', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!usersCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const userId = req.params.id;
        const currentUserId = req.user._id?.toString() || req.user.id;

        if (userId === currentUserId) {
            return res.status(403).send({
                success: false,
                message: "Cannot modify your own role"
            });
        }

        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(404).send({ success: false, message: "User not found" });
        }

        if (user.role === 'admin') {
            return res.status(400).send({
                success: false,
                message: "User is already an admin"
            });
        }

        const result = await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    role: 'admin',
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ success: false, message: "User not found" });
        }

        res.send({
            success: true,
            message: "User promoted to admin successfully"
        });

    } catch (error) {
        console.error("Error making user admin:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});
// ADMIN - TRAINER APPLICATIONS ROUTES

app.get('/api/admin/trainer-applications', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!trainerApplicationsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const applications = await trainerApplicationsCollection
            .find({ status: "Pending" })
            .sort({ appliedAt: -1 })
            .toArray();

        res.send({
            success: true,
            data: applications
        });

    } catch (error) {
        console.error("Error fetching trainer applications:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.patch('/api/admin/trainer-applications/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!trainerApplicationsCollection || !usersCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const applicationId = req.params.id;
        const { status, feedback } = req.body;

        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).send({
                success: false,
                message: "Invalid status. Must be 'Approved' or 'Rejected'"
            });
        }

        const application = await trainerApplicationsCollection.findOne({
            _id: new ObjectId(applicationId)
        });

        if (!application) {
            return res.status(404).send({ success: false, message: "Application not found" });
        }

        if (application.status !== 'Pending') {
            return res.status(400).send({
                success: false,
                message: `Application is already ${application.status}`
            });
        }

        const result = await trainerApplicationsCollection.updateOne(
            { _id: new ObjectId(applicationId) },
            {
                $set: {
                    status: status,
                    feedback: feedback || null,
                    reviewedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ success: false, message: "Application not found" });
        }

        if (status === 'Approved') {
            await usersCollection.updateOne(
                { _id: application.userId },
                {
                    $set: {
                        role: 'trainer',
                        updatedAt: new Date()
                    }
                }
            );
        }

        res.send({
            success: true,
            message: `Application ${status.toLowerCase()} successfully`
        });

    } catch (error) {
        console.error("Error updating trainer application:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

// ADMIN - MANAGE TRAINERS ROUTES

app.get('/api/admin/trainers', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!usersCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const trainers = await usersCollection
            .find({ role: 'trainer' })
            .project({
                password: 0,
                __v: 0
            })
            .sort({ createdAt: -1 })
            .toArray();

        res.send({
            success: true,
            data: trainers
        });

    } catch (error) {
        console.error("Error fetching trainers:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.patch('/api/admin/trainers/:id/demote', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!usersCollection || !trainerApplicationsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const userId = req.params.id;
        const currentUserId = req.user._id?.toString() || req.user.id;

        if (userId === currentUserId) {
            return res.status(403).send({
                success: false,
                message: "Cannot demote yourself"
            });
        }

        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(404).send({ success: false, message: "User not found" });
        }

        if (user.role !== 'trainer') {
            return res.status(400).send({
                success: false,
                message: "User is not a trainer"
            });
        }

        // Update user role to 'user'
        const result = await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    role: 'user',
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ success: false, message: "User not found" });
        }

        // Reset trainer application status to 'Not Applied' by deleting the application
        const deleteResult = await trainerApplicationsCollection.deleteOne({ 
            userId: new ObjectId(userId) 
        });

      

        res.send({
            success: true,
            message: "Trainer demoted to user successfully",
            applicationReset: deleteResult.deletedCount > 0 ? "Application status reset" : "No application found"
        });

    } catch (error) {
        console.error("Error demoting trainer:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});
// ADMIN - MANAGE CLASSES ROUTES

app.get('/api/admin/classes', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const classes = await classesCollection
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        res.send({
            success: true,
            data: classes
        });

    } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.patch('/api/admin/classes/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const classId = req.params.id;
        const { status } = req.body;

        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).send({
                success: false,
                message: "Invalid status. Must be 'approved', 'rejected', or 'pending'"
            });
        }

        const classData = await classesCollection.findOne({ _id: new ObjectId(classId) });
        if (!classData) {
            return res.status(404).send({ success: false, message: "Class not found" });
        }

        const result = await classesCollection.updateOne(
            { _id: new ObjectId(classId) },
            {
                $set: {
                    status: status,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).send({ success: false, message: "Class not found" });
        }

        res.send({
            success: true,
            message: `Class ${status} successfully`
        });

    } catch (error) {
        console.error("Error updating class status:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.delete('/api/admin/classes/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!classesCollection || !bookingsCollection || !favoritesCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const classId = req.params.id;

        // Find the class first
        const classData = await classesCollection.findOne({ _id: new ObjectId(classId) });
        if (!classData) {
            return res.status(404).send({ success: false, message: "Class not found" });
        }

        // Delete the class
        const result = await classesCollection.deleteOne({ _id: new ObjectId(classId) });

        if (result.deletedCount === 0) {
            return res.status(404).send({ success: false, message: "Class not found" });
        }

        // Delete all bookings associated with this class
        const deleteBookingsResult = await bookingsCollection.deleteMany({ classId: classId });

        // Delete all favorites associated with this class
        const deleteFavoritesResult = await favoritesCollection.deleteMany({ classId: classId });

        res.send({
            success: true,
            message: "Class deleted successfully",
            bookingsDeleted: deleteBookingsResult.deletedCount || 0,
            favoritesDeleted: deleteFavoritesResult.deletedCount || 0
        });

    } catch (error) {
        console.error("Error deleting class:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});
// ADMIN - FORUM POST ROUTES

app.post('/api/admin/forum/create', verifyToken, verifyAdmin, checkSoftBan, async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const { title, description, image } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).send({
                success: false,
                message: "Title is required!"
            });
        }

        if (!description || !description.trim()) {
            return res.status(400).send({
                success: false,
                message: "Description is required!"
            });
        }

        if (!image || !image.trim()) {
            return res.status(400).send({
                success: false,
                message: "Image URL is required!"
            });
        }

        const newPost = {
            title: title.trim(),
            description: description.trim(),
            image: image.trim(),
            authorId: req.user._id?.toString() || req.user.id,
            authorName: req.user.name || "Admin",
            authorEmail: req.user.email,
            authorImage: req.user.image || null,
            authorRole: "admin",
            likes: [],
            dislikes: [],
            comments: [],
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await postsCollection.insertOne(newPost);

        res.status(201).send({
            success: true,
            insertedId: result.insertedId,
            message: "Forum post created successfully!"
        });

    } catch (error) {
        console.error("Error in /api/admin/forum/create:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});
// ADMIN - TRANSACTIONS ROUTES



app.get('/api/admin/transactions', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!bookingsCollection || !usersCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        // Get all bookings with transaction data
        const transactions = await bookingsCollection
            .find({ 
                transactionId: { $exists: true, $ne: null }
            })
            .sort({ bookedAt: -1 })
            .toArray();

        // Get all unique user emails from transactions
        const userEmails = [...new Set(transactions.map(t => t.userEmail).filter(email => email))];
        
        // Fetch all users with these emails
        const users = await usersCollection
            .find({ email: { $in: userEmails } })
            .toArray();
        
        // Create a map of email to user data
        const userMap = {};
        users.forEach(user => {
            userMap[user.email] = user;
        });

        // Format transaction data with user names from users collection
        const formattedTransactions = transactions.map(booking => {
            const user = userMap[booking.userEmail];
            return {
                _id: booking._id,
                userEmail: booking.userEmail || 'N/A',
                userName: user?.name || booking.userName || 'Unknown User',
                userImage: user?.image || null,
                amount: booking.price || booking.amount || 0,
                date: booking.bookedAt || booking.createdAt || new Date(),
                transactionId: booking.transactionId || 'N/A',
                classId: booking.classId,
                className: booking.className || 'Unknown Class',
                trainerName: booking.trainerName || 'N/A',
                status: 'completed'
            };
        });

        res.send({
            success: true,
            data: formattedTransactions
        });

    } catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});
// ADMIN - MANAGE FORUM ROUTES

app.get('/api/admin/forum/all-posts', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const posts = await postsCollection
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        res.send({
            success: true,
            data: posts
        });

    } catch (error) {
        console.error("Error fetching forum posts:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.delete('/api/admin/forum/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!postsCollection || !commentsCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const postId = req.params.id;

        const post = await postsCollection.findOne({ _id: new ObjectId(postId) });
        if (!post) {
            return res.status(404).send({ success: false, message: "Post not found" });
        }

        const result = await postsCollection.deleteOne({ _id: new ObjectId(postId) });

        if (result.deletedCount === 0) {
            return res.status(404).send({ success: false, message: "Post not found" });
        }

        // Delete all comments associated with this post
        await commentsCollection.deleteMany({ postId: postId });

        res.send({
            success: true,
            message: "Forum post deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting forum post:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.get('/', (req, res) => {
    res.send('TrainLib Server is running smoothly...');
});

app.listen(port, () => {
    console.log(`TrainLib Server listening on port ${port}`);
    console.log(`Localhost API Base Link: http://localhost:${port}`);
});

module.exports = app;