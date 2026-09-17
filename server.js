const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// ✅ Connected to IPVarna Database
const dbURI = process.env.MONGO_URI || 'mongodb+srv://vidhioraofficial_db_user:sDmZKVGDWNu4vhvL@cluster0.0angzfx.mongodb.net/ipvarna_workshop?retryWrites=true&w=majority';

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to MongoDB Atlas (IPVarna Event)'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// ==========================================
// SCHEMAS
// ==========================================
const referralSchema = new mongoose.Schema({
    type: { type: String, enum: ['Ambassador', 'Organization'], required: true },
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const Referral = mongoose.model('Referral', referralSchema);

const userSchema = new mongoose.Schema({
    registrationNumber: { type: Number },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    profession: { type: String, required: true },
    referralCode: { type: String, default: 'NONE' },
    transactionId: { type: String, required: true },
    amountPaid: { type: Number, required: true },
    status: { type: String, default: "Pending" },
    registrationDate: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// ==========================================
// PUBLIC API ROUTES
// ==========================================
app.get('/api/event-status', async (req, res) => {
    try {
        const count = await User.countDocuments({ status: { $ne: 'Rejected' } });
        const referrals = await Referral.find({ isActive: true }).select('name code type');
        res.json({ count, limit: 100, price: 1000, referrals });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const currentCount = await User.countDocuments({ status: { $ne: 'Rejected' } });
        if (currentCount >= 100) return res.status(400).json({ success: false, message: "Workshop is completely sold out." });

        let basePrice = 1000;
        let finalPrice = basePrice;
        let appliedCode = req.body.referralCode;

        if (appliedCode && appliedCode !== 'NONE') {
            const isValidCode = await Referral.findOne({ code: appliedCode, isActive: true });
            if (isValidCode) {
                finalPrice = Math.round(basePrice * 0.90); // 10% Discount applied
            } else {
                appliedCode = 'NONE';
            }
        }

        const newUser = new User({
            ...req.body,
            referralCode: appliedCode,
            registrationNumber: currentCount + 1,
            amountPaid: finalPrice
        });

        await newUser.save();
        res.json({ success: true, registrationNumber: newUser.registrationNumber });
    } catch (error) {
        res.status(500).json({ success: false, message: "Registration failed." });
    }
});

// ==========================================
// 🔒 ADMIN SECURITY LOCK
// ==========================================
const adminAuth = (req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [username, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    const ADMIN_USER = process.env.ADMIN_USER || 'vidhiora';
    const ADMIN_PASS = process.env.ADMIN_PASS || 'admin2026';

    if (username === ADMIN_USER && password === ADMIN_PASS) return next(); 

    res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
    res.status(401).send('Access Denied: Authentication required.');
};

app.use('/admin.html', adminAuth);
app.use('/api/admin', adminAuth);

// ==========================================
// SECURED ADMIN API ROUTES
// ==========================================
app.get('/api/admin/users', async (req, res) => {
    const users = await User.find().sort({ registrationDate: -1 });
    res.json(users);
});

app.post('/api/admin/users/:id/approve', async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { status: "Confirmed" });
    res.json({ success: true });
});

app.post('/api/admin/users/:id/reject', async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { status: "Rejected" });
    res.json({ success: true });
});

app.delete('/api/admin/users/:id', async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/admin/referrals', async (req, res) => {
    const referrals = await Referral.find().sort({ createdAt: -1 }).lean();
    for (let ref of referrals) {
        const successfulUses = await User.countDocuments({ referralCode: ref.code, status: "Confirmed" });
        ref.totalUses = successfulUses; 
    }
    res.json(referrals);
});

app.post('/api/admin/referrals', async (req, res) => {
    try {
        const newRef = new Referral(req.body);
        await newRef.save();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, message: "Code already exists." });
    }
});

app.put('/api/admin/referrals/:id', async (req, res) => {
    await Referral.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive });
    res.json({ success: true });
});

// Serve frontend files (Must be at the bottom)
app.use(express.static('public'));

app.listen(PORT, () => console.log(`🚀 Workshop Server running on port ${PORT}`));