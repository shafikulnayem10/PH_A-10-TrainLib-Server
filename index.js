const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: ['http://localhost:3000'], 
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
      
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}
run().catch(console.dir);


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

app.get('/latest-posts', async (req, res) => {
    try {
        if (!postsCollection) {
            return res.status(500).send({ message: "Database not initialized yet" });
        }

        const result = await postsCollection
            .find()
            .sort({ createdAt: -1 })
            .limit(4)
            .toArray();

        res.send(result);
    } catch (error) {
        console.error("Error fetching latest forum posts:", error);
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
            let classQuery = {};
            
            if (ObjectId.isValid(bookingData.classId)) {
                classQuery = { _id: new ObjectId(bookingData.classId) };
            } else {
                classQuery = { _id: bookingData.classId }; 
            }

            const updateResult = await classesCollection.updateOne(
                classQuery,
                { $inc: { bookingCount: 1 } } 
            );
            
            console.log("Class Booking Count Update Result:", updateResult);
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
            
            return res.send({ 
                success: true, 
                isFavorite: false, 
                message: "Successfully removed from your favorites!" 
            });
        } else {
            const result = await favoritesCollection.insertOne(favoriteData);
            
            return res.send({ 
                success: true, 
                isFavorite: true, 
                insertedId: result.insertedId,
                message: "Successfully added to your favorites!" 
            });
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
        
        const comments = await commentsCollection
            .find({ postId: id })
            .sort({ createdAt: -1 })
            .toArray();

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
        const user = req.body;
        // console.log("User making the comment:", user);
        const { text, userEmail , userImage , userName} = req.body;
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
        const commentId = req.params.commentId;
        const { text, userEmail, userName } = req.body;
        const newReply = {
            text,
            userEmail,
            userName: userName || 'Community Member',
            createdAt: new Date()
        };
        const result = await commentsCollection.updateOne(
            { _id: new ObjectId(commentId) },
            { $push: { replies: newReply } }
        );
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


app.get('/', (req, res) => {
    res.send('TrainLib Server is running...');
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
    console.log(`Localhost Link: http://localhost:${port}`); 
});