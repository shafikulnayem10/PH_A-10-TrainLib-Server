require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: ['http://localhost:3000'], 
    credentials: true
}));
app.use(express.json());

const logger = (req, res, next) => {
    console.log(`[LOG] ${req.method} request made to: ${req.url}`);
    next();
};

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

async function run() {
    try {
        await client.connect(); 
        console.log("Successfully connected to MongoDB Atlas!");

        const db = client.db(process.env.AUTH_DB_NAME || "trainlibDB");
        
        classesCollection = db.collection("classes");
        postsCollection = db.collection("forum_posts"); 
        bookingsCollection = db.collection("bookings");
        favoritesCollection = db.collection("favorites");
        commentsCollection = db.collection("forum_comments"); 
        usersCollection = db.collection("user"); 
        sessionCollection = db.collection("session");
       trainerApplicationsCollection = db.collection("trainer_applications");
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);

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

app.post('/api/bookings', async (req, res) => {
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

        const result = await bookingsCollection.insertOne({
            ...bookingData,
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

app.get('/api/forum', async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const result = await postsCollection.find().sort({ createdAt: -1 }).toArray();
        res.send(result);
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

app.post('/api/forum/:id/comment', async (req, res) => {
    try {
        if (!commentsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const postId = req.params.id;
        const { text, userEmail, userImage, userName } = req.body;
        if (!text || !userEmail) {
            return res.status(400).send({ message: "Text and email are required" });
        }
        const newComment = {
            postId,
            text,
            userEmail,
            userImage,
            userName: userName || 'Community Member',
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

app.post('/api/forum/comment/:commentId/reply', async (req, res) => {
    try {
        if (!commentsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }
        const commentId = req.params.commentId?.trim();
        if (!commentId || !ObjectId.isValid(commentId)) {
            return res.status(400).send({ message: "Invalid Comment ID format" });
        }

        const { text, userEmail, userName, userImage } = req.body;
        if (!text || !userEmail) {
            return res.status(400).send({ message: "Text and userEmail are required" });
        }

        const newReply = {
            text: text.trim(),
            userEmail,
            userName: userName || 'Community Member',
            userImage: userImage || null,
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

//Role based Routes

// APPLY AS TRAINER FEATURES

app.post('/api/user/apply-trainer', verifyToken, verifyUser, async (req, res) => {
    try {
        if (!trainerApplicationsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const { experience, specialty, bio } = req.body;
        const userEmail = req.user.email;

        if (!experience || !specialty) {
            return res.status(400).send({ success: false, message: "Experience and Specialty are required fields." });
        }

       
        const existingApplication = await trainerApplicationsCollection.findOne({ userEmail: userEmail });
        if (existingApplication) {
            return res.status(400).send({ 
                success: false, 
                message: `You have already applied! Current Status: ${existingApplication.status}` 
            });
        }

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
        const application = await trainerApplicationsCollection.findOne({ userEmail: userEmail });

        if (!application) {
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



// USER ROUTES 

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
        if (!bookingsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const userEmail = req.user.email;
        const bookedClasses = await bookingsCollection
            .find({ userEmail: userEmail })
            .sort({ bookedAt: -1 })
            .toArray();

        res.send({
            success: true,
            data: bookedClasses
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
// TRAINER ROUTES

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
// POST Route: Trainer can add a new class
app.post('/api/trainer/add-class', verifyToken, verifyTrainer, async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }

        const { className, category, duration, description, objectives, requirements, image } = req.body;

        
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
            duration: duration.trim(),
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

// GET Route: Fetch all classes added by the currently logged-in trainer
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
// 2. PATCH Route: Update class data
app.patch('/api/trainer/classes/:id', verifyToken, verifyTrainer, async (req, res) => {
    try {
        if (!classesCollection) {
            return res.status(500).send({ success: false, message: "Database not initialized yet" });
        }
        const classId = req.params.id;
        const currentTrainerId = req.user._id?.toString() || req.user.id;
        const updateData = req.body;

      
        const query = { _id: new ObjectId(classId), trainerId: currentTrainerId };
        
        const updateDoc = {
            $set: {
                className: updateData.className?.trim(),
                category: updateData.category?.trim(),
                difficulty: updateData.difficulty,
                duration: updateData.duration?.trim(),
                price: parseFloat(updateData.price),
                classSchedule: updateData.classSchedule?.trim(),
                description: updateData.description?.trim(),
                objectives: updateData.objectives,
                requirements: updateData.requirements,
                image: updateData.image
            }
        };

        const result = await classesCollection.updateOne(query, updateDoc);
        if (result.modifiedCount === 0) {
            return res.status(404).send({ success: false, message: "Class not found or no changes made" });
        }

        res.send({ success: true, message: "Class updated successfully!" });
    } catch (error) {
        console.error("Error updating class:", error);
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