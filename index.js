const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// ========= Initialize Express app ========= //
const app = express();
const port = process.env.PORT || 3000;

// ======== From Firebase SDK ========= //
const admin = require("firebase-admin");
const serviceAccount = require("./zap-shift-firebase-adminsdk.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// ========== Generate Tracking Id ========== //
function generateTrackingId() {
    const time = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PC-${time}-${random}`;
}



app.use(cors());
app.use(express.json());


// ======== MiddleWare for Verification ======== //
const verifyFirebaseToken = async (req, res, next) => {
    // console.log("Firebase-Token: ", req.headers.authorization);
    if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" })
    }
    const token = req.headers.authorization.split(" ")[1];
    if (!token) {
        return res.status(401).send({ message: "unauthorized access" })
    }
    try {
        const userInfo = await admin.auth().verifyIdToken(token);
        req.token_email = userInfo.email;
        console.log("userInfo: ", userInfo)
        next();
    }
    catch {
        return res.status(401).send({ message: 'unauthorized access' })
    }
}



// ========== MONGODB CONNECTION ========== //
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@clustersm.e6uuj86.mongodb.net/?appName=ClusterSM`;

// ========== Create MongoDB client instance ========= //
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// ========= Connection set function ========== //
async function run() {
    try {
        await client.connect();

        // ========== MAIN FUNCTION ========== //

        const db = client.db("zap_shift_db");
        const userCollection = db.collection("users");
        const parcelCollection = db.collection("parcels");
        const paymentCollection = db.collection("payments");
        const ridersCollection = db.collection("riders");


        // ========== Middle-Ware with Database Access ========== //
        // Muss be use After verifyFirebaseToken middleware

        const verifyAdmin = async (req, res, next) => {
            const email = req.token_email;
            const query = { email };
            const user = await userCollection.findOne(query);

            if (!user || user.role !== "admin") {
                return res.status(403).send({ message: "Forbidden Access" });
            }

            next()
        }


        // ========== User Related API ========== //
        app.get("/users", verifyFirebaseToken, async (req, res) => {
            const searchText = req.query.searchText;
            const query = {};
            if (searchText) {
                // query.displayName = {$regex: searchText, $options: "i"};
                query.$or = [
                    { displayName: { $regex: searchText, $options: "i" } },
                    { email: { $regex: searchText, $options: "i" } },
                ]
            }
            const cursor = userCollection.find(query).sort({ createdAt: -1 }).limit(5);
            const result = await cursor.toArray();
            res.send(result);
        })


        app.get("/users/:email/role", async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await userCollection.findOne(query);
            res.send({ role: user?.role || "user" });
        })

        app.post("/users", async (req, res) => {
            const user = req.body;
            user.role = "user";
            user.createdAt = new Date();

            const email = user.email;
            const userExist = await userCollection.findOne({ email })
            if (userExist) {
                return res.send({ message: "user exist" })
            }

            const result = await userCollection.insertOne(user);
            res.send(result);
        })


        // Patch for Admin
        app.patch("/users/:id/role", verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const roleInfo = req.body;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: roleInfo.role,
                }
            }
            const result = await userCollection.updateOne(query, updatedDoc);
            res.send(result);
        })


        // ========== Riders Related API ========== //

        // app.get("/riders", async (req, res) => {
        //     const {status, district, workStatus} = req.query;
        //     const query = {};
        //     if (status) {
        //         query.status = status;
        //     }
        //     if(district){
        //         query.district = district;
        //     }
        //     if(workStatus){
        //         query.workStatus = workStatus; 
        //     }
        //     const cursor = ridersCollection.find(query);
        //     const result = await cursor.toArray();
        //     res.send(result);
        // })


        app.get("/riders", async (req, res) => {
            const { status, district, workStatus } = req.query;
            const query = {};

            if (status) {
                // Case-insensitive search
                query.status = { $regex: new RegExp(`^${status}$`, 'i') };
            }
            if (district) {
                // Case-insensitive search
                query.district = { $regex: new RegExp(`^${district}$`, 'i') };
            }
            if (workStatus) {
                // Case-insensitive search
                query.workStatus = { $regex: new RegExp(`^${workStatus}$`, 'i') };
            }

            const cursor = ridersCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.post("/riders", async (req, res) => {
            const rider = req.body;

            rider.status = "pending";
            rider.createdAt = new Date();

            const result = await ridersCollection.insertOne(rider);
            res.send(result);
        })


        app.patch("/riders/:id", verifyFirebaseToken, verifyAdmin, async (req, res) => {
            const status = req.body.status;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: status,
                    workStatus: "available"
                }
            }
            const result = await ridersCollection.updateOne(query, updateDoc);

            if (status === "Approved") {
                const email = req.body.email;
                const userQuery = { email };
                const updateUser = {
                    $set: {
                        role: "rider",
                    }
                }
                const userResult = await userCollection.updateOne(userQuery, updateUser);
            }


            res.send(result);
        })




        // ========== Parcel Related API ======== //
        // Get All Data From Database

        // app.get("/parcels", async(req, res) => {
        //     const query = {}

        //     const cursor = parcelCollection.find(query);
        //     const result = await cursor.toArray();
        //     res.send(result);
        // })









        // // Get API
        // app.get("/parcels", async (req, res) => {
        //     const query = {}
        //     const { email, deliveryStatue } = req.query;
        //     // parcels?email=""&
        //     if (email) {
        //         query.senderEmail = email;
        //     }
        //     if(deliveryStatue){
        //         query.deliveryStatue = deliveryStatue;
        //     }
        //     const options = { sort: { createdAt: -1 } }

        //     const cursor = parcelCollection.find(query, options);
        //     const result = await cursor.toArray();
        //     res.send(result);
        // })


        app.get("/parcels", async (req, res) => {
            const query = {};
            const { email, deliveryStatus } = req.query;

            if (email) {
                query.senderEmail = email;
            }
            if (deliveryStatus) {
                query.deliveryStatus = deliveryStatus;
            }

            const options = { sort: { createdAt: -1 } }
            const cursor = parcelCollection.find(query, options);
            const result = await cursor.toArray();
            res.send(result);
        });





        // Get Specific Id
        app.get("/parcels/:id", async (req, res) => {
            const parcelId = req.params.id;
            const query = { _id: new ObjectId(parcelId) }
            const result = await parcelCollection.findOne(query);
            res.send(result)
        })


        app.patch("/parcels/:id", async(req, res) => {
            const {parcelId, riderId, riderName, riderEmail} = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id)};

            const updatedDoc = {
                $set : {
                    deliveryStatus: "driver_assigned",
                    riderId: riderId,
                    riderName: riderName,
                    riderEmail: riderEmail,
                }
            }
            const result = await parcelCollection.updateOne(query, updatedDoc);

            // Update rider information

            const riderQuery = { _id: new ObjectId(riderId)}
            const updatedRiderDoc = {
                $set : {
                    workStatus: "in_delivery",
                }
            }
            const riderResult = await ridersCollection.updateOne(riderQuery, updatedRiderDoc);
            res.send(riderResult);
        })


        // Delete Parcel 
        app.delete("/parcels/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await parcelCollection.deleteOne(query);
            res.send(result);
        })

        // Create or Post one Data to the Database
        app.post("/parcels", async (req, res) => {
            const parcel = req.body;
            // Parcel Created Time
            // parcel.createdAt = new Date();
            parcel.createdAt = new Date().toLocaleString("sv-SE", {
                timeZone: "Asia/Dhaka"
            });
            parcel.cost = Number(parcel.cost);

            const result = await parcelCollection.insertOne(parcel);
            res.send(result);
        })


        // =============== Payment Related API ============= //

        //---------- Part One: Creating a Checkout Session (Starting Stripe Payment)---------- //
        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.cost) * 100;
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: "USD",
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo.parcelName,
                            },
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.senderEmail,
                mode: 'payment',
                metadata: {
                    parcelId: paymentInfo.parcelId,
                    parcelName: paymentInfo.parcelName,
                },
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
            });

            console.log(session);
            res.send({ url: session.url });
        });


        // --------- Part Two: Updating the Database After the Payment Is Successful ---------- //
        app.patch("/payment-success", async (req, res) => {
            const sessionId = req.query.session_id;
            // console.log("session id", sessionId);
            const session = await stripe.checkout.sessions.retrieve(sessionId)
            // console.log("sessions retrieve", session);

            const transactionId = session.payment_intent;
            const query = { transactionId: transactionId }

            const paymentExist = await paymentCollection.findOne(query);
            console.log(paymentExist)
            if (paymentExist) {
                return res.send({
                    message: "already exist",
                    transactionId,
                    trackingId: paymentExist.trackingId,
                })
            }

            const trackingId = generateTrackingId();

            if (session.payment_status === "paid") {
                const id = session.metadata.parcelId;
                const query = { _id: new ObjectId(id) }
                const update = {
                    $set: {
                        paymentStatus: "paid",
                        deliveryStatus: "pending-pickup",
                        trackingId: trackingId,
                    }
                }

                const result = await parcelCollection.updateOne(query, update);

                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    parcelId: session.metadata.parcelId,
                    parcelName: session.metadata.parcelName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                    trackingId: trackingId,
                }

                if (session.payment_status === "paid") {
                    const resultPayment = await paymentCollection.insertOne(payment);
                    res.send({
                        success: true,
                        modifyParcel: result,
                        trackingId: trackingId,
                        transactionId: session.payment_intent,
                        paymentInfo: resultPayment,
                    })
                }

                res.send(result);
            }

            res.send({ success: false })
        })


        // Payment History Show in Client
        app.get("/payments", verifyFirebaseToken, async (req, res) => {
            const email = req.query.email;
            const query = {};

            if (email) {
                query.customerEmail = email;

                // Check email address
                if (email !== req.token_email) {
                    return res.status(403).send({ message: "forbidden access" })
                }
            }
            const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

        // await client.close();
    }
}
run().catch(console.dir);

// ========== Root route for testing server ========== //
app.get("/", (req, res) => {
    res.send("Zap Shift Server is going on");
})


// ========== SERVER LISTEN ========== //
app.listen(port, () => {
    console.log(`Zap Shift Server at port: ${port}`)
});
