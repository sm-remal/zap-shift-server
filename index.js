const express = require('express');
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
// ========= Initialize Express app ========= //
const app = express();
const port = process.env.PORT || 3000;


// ========== Generate Tracking Id ========== //
  function generateTrackingId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PC-${time}-${random}`;
}



app.use(cors());
app.use(express.json());

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
        const parcelCollection = db.collection("parcels");
        const paymentCollection = db.collection("payments");

        // ========== Parcel Related API ======== //
        // Get All Data From Database

        // app.get("/parcels", async(req, res) => {
        //     const query = {}

        //     const cursor = parcelCollection.find(query);
        //     const result = await cursor.toArray();
        //     res.send(result);
        // })

        // Get API
        app.get("/parcels", async (req, res) => {
            const query = {}
            const { email } = req.query;
            // parcels?email=""&
            if (email) {
                query.senderEmail = email;
            }
            const options = { sort: { createdAt: -1 } }

            const cursor = parcelCollection.find(query, options);
            const result = await cursor.toArray();
            res.send(result);
        })

        // Get Specific Id
        app.get("/parcels/:id", async (req, res) => {
            const parcelId = req.params.id;
            const query = { _id: new ObjectId(parcelId) }
            const result = await parcelCollection.findOne(query);
            res.send(result)
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


        // info
        app.patch("/payment-success", async(req, res) => {
            const sessionId = req.query.session_id;
            // console.log("session id", sessionId);
            const session = await stripe.checkout.sessions.retrieve(sessionId)
            console.log("sessions retrieve", session);

            const trackingId = generateTrackingId();

            if(session.payment_status === "paid"){
                const id = session.metadata.parcelId;
                const query = { _id: new ObjectId(id) }
                const update = {
                    $set: {
                        paymentStatus: "paid",
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
                }

                if(session.payment_status === "paid"){
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
