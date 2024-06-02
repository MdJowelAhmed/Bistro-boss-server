const express = require('express');
const cors = require('cors');
require('dotenv').config()
var jwt = require('jsonwebtoken');
const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY)
const app = express()
const port = process.env.PORT || 5000

// middlewere 
app.use(cors())
app.use(express.json())




// mongobd code 

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://bistroBoss:A4KJN4wa0DKzOg15@cluster0.ma7e2wv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        const menuCollection = client.db('bistoBoss').collection('menu')
        const userCollection = client.db('bistoBoss').collection('users')
        const reviewsCollection = client.db('bistoBoss').collection('reviews')
        const cartsCollection = client.db('bistoBoss').collection('carts')
        const paymentCollection = client.db('bistoBoss').collection('payments')

        // jwt related api 
        app.post('/jwt',async(req,res)=>{
            const user=req.body;
            const token=jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{expiresIn:'1h'})
            res.send({token})
        })

        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
              return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
              if (err) {
                return res.status(401).send({ message: 'unauthorized access' })
              }
              req.decoded = decoded;
              next();
            })
          }

        //   verify admin 
        const verifyAdmin=async(req,res,next)=>{
            const email=req.decoded.email;
            const query={email:email}
            const user=await userCollection.findOne(query)
            const isAdmin=user?.role==='admin';
            if(!isAdmin){
                return res.status(403).send({message: 'forbidden access'})
            }
            next()
        }
        // user related api 
        app.get('/users',verifyToken, verifyAdmin, async(req,res)=>{
          console.log(req.user)
            const result=await userCollection.find().toArray()
            res.send(result)
        })

        app.get('/users/admin/:email',verifyToken, async(req,res)=>{
            const email=req.params.email;
            if(email !== req.decoded.email){
                return res.status(403).send({ message: 'Forbidden Access' });
            }
            const query={email:email}
            const user=await userCollection.findOne(query)
            let admin=false
            if(user){
                admin=user?.role ==='admin'
            }
            res.send({admin})
        })

        app.post('/users',async(req,res)=>{
            const user=req.body
            const query={email:user.email}
            const existingUser=await userCollection.findOne(query)
            if(existingUser){
                return res.send({message:'user already have',insertedId:null })
            }
            const result=await userCollection.insertOne(user)
            res.send(result)
        })

        app.delete('/users/:id',async(req,res)=>{
            const id=req.params.id;
            const query={_id: new ObjectId(id)}
            const result=await userCollection.deleteOne(query)
            res.send(result)
        })

        app.patch('/users/admin/:id',async(req,res)=>{
            const id=req.params.id;
            const filter={_id: new ObjectId(id)}
            const updatedDoc={
                $set:{
                    role:'admin'
                }
            }
            const result=await userCollection.updateOne(filter,updatedDoc)
            res.send(result)
        })

        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray()
            res.send(result)
        })
        app.post('/menu',verifyToken,verifyAdmin, async(req,res)=>{
            const items=req.body;
            const result =await menuCollection.insertOne(items)
            res.send(result)
        })
        app.delete('/menu/:id', verifyToken,verifyAdmin, async(req,res)=>{
            const id=req.params.id;
            const query={_id: new ObjectId(id)}
            const result=await menuCollection.deleteOne(query)
            res.send(result)
        })


        app.get('/reviews', async (req, res) => {
            const result = await menuCollection.find().toArray()
            res.send(result)
        })

        // cart 
        app.post('/carts',async(req,res)=>{
            const cartItem=req.body;
            const result=await cartsCollection.insertOne(cartItem)
            res.send(result)
        })
        app.get('/carts',async(req,res)=>{
            const email=req.query.email
            const query={email:email}
            const result=await cartsCollection.find(query).toArray()
            res.send(result)
        })
        app.delete('/carts/:id',async(req,res)=>{
            const id=req.params.id
            const query={_id: new ObjectId(id)}
            const result=await cartsCollection.deleteOne(query)
            res.send(result)
        })

        // payment 
        app.post("/create_payment_intent",async(req,res)=>{
            const {price}=req.body
            const amount=parseInt(price * 100)
            const paymentIntent=await stripe.paymentIntents.create({
                amount:amount,
                currency:"usd",
                payment_method_types: ['card']
            })
            res.send({
                clientSecret:paymentIntent.client_secret
            })

        })

        app.post('/payment',async(req,res)=>{
            const payment=req.body
            const paymentResult=await paymentCollection.insertOne(payment)
            // console.log('payment Info',payment)
            const query={_id:{
                $in:payment.cartIds.map(id=>new ObjectId(id))
            }}
            const deleteResult=await cartsCollection.deleteMany(query)
            res.send({paymentResult,deleteResult})
        })

        app.get('/payment/:email',verifyToken,async(req,res)=>{
            const query={email:req.params.email}
            if(req.params.email !== req.decoded.email){
                return res.status(403).send({message:'forbidden'})
            }
            const result=await paymentCollection.find(query).toArray()
            res.send(result)
        })

        app.get('/adminState',verifyToken,verifyAdmin,async(req,res)=>{
            const users=await userCollection.estimatedDocumentCount()
            const menuItems=await menuCollection.estimatedDocumentCount()
            const orders=await paymentCollection.estimatedDocumentCount()
            // const payments=await paymentCollection.find().toArray()
            // const revenue=payments.reduce((total,item)=>total+item?.price,0)
            const result=await paymentCollection.aggregate([
                {
                    $group:{
                        _id:null,
                        totalRevenue:{
                            $sum:'$price'
                        }
                    }
                }
            ]).toArray()
            const revenue=result.length >0 ? result[0].totalRevenue:0;
            res.send({
                users,menuItems,orders,revenue
            })
        })

        app.get('/orderState',verifyToken,verifyAdmin,async(req,res)=>{
            const result=await paymentCollection.aggregate([
                {
                    $unwind:'$menuItemIds'
                },
                {
                    $lookup:{
                        from:'menu',
                        localField:'menuItemIds',
                        foreignField:'_id',
                        as:"menuItems"
                    }
                },
                {
                    $unwind:'$menuItems'
                },{
                    $group:{
                        _id:"$menuItems.category",
                        quantity:{$sum:1},
                        revenue:{$sum: '$menuItems.price'}
                    }
                },
                {
                    $project:{
                        _id:0,
                        category:'$_id',
                        quantity:'$quantity',
                        revenue:'$revenue'
                    }
                }
            ]).toArray()
            res.send(result)
        })
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send("Bistro Boss Server Is Running")
})

app.listen(port, () => {
    console.log(`Bistro BOSS On PORT ${port}`)
})