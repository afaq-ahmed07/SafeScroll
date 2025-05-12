const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const User = require('../models/user');
const authenticateToken = require('../middlewares/auth');


router.get('/', authenticateToken, (req, res) => {
    const user = req.user;

    if (user !== null) {
        return res.status(404).render('error', {
            error_title: "Already Registered",
            status_code: 404,
            error: "You already have an active session. Please sign out first if you want to create a new account."
        });
    }
    res.render('signup');
});

router.post("/", authenticateToken, async (req, res) => {
    const { username, email, password } = req.body;
    const user = req.user;

    if (user !== null) {
        return res.status(404).render('error', {
            error_title: "Already Registered",
            status_code: 404,
            error: "You already have an active session. Please sign out first if you want to create a new account."
        });
    }
    try {
        // Check if the username already exists
        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({
                error_message: "This username is already taken. Please choose a different username."
            });
        }

        // Check if the email already exists
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({
                error_message: "An account with this email already exists. Please sign in or use a different email."
            });
        }
        const jwt = require('jsonwebtoken');
        // Generate a 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const otpExpiry = Date.now() + 70000; // 70 seconds
        // Create a temporary token containing user data and OTP
        const tempUserData = { otp, otpExpiry };
        const tempToken = jwt.sign(tempUserData, 'Nevergiveup', { expiresIn: '70s' });

        // Send verification email
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: 'f219298@cfd.nu.edu.pk',
                pass: 'toja swko fidh mtyy'
            },
            tls: { rejectUnauthorized: false }
        });

        const mailOptions = {
            from: 'f219298@cfd.nu.edu.pk',
            to: email,
            subject: 'Your OTP for Email Verification',
            html: `
            <p>Your OTP for email verification is: <strong>${otp}</strong>.</p>
            <p>The OTP is valid for 1 minute.</p>
        `,
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (error) {
            console.error("Error while sending email:", error);
            return res.status(500).render('error', {
                error_title: "Email Verification Error",
                status_code: 500,
                error: "We couldn't send the verification email. Please check your email address and try again."
            });
        }

        res.status(200).json({
            message: 'Please check your email for verification.',
            email: email,
            temptoken: tempToken,
            username: username,
            password: password,
        });
    } catch (error) {
        return res.status(500).render('error', {
            error_title: "Registration Error",
            status_code: 500,
            error: "We're having trouble processing your registration. Please try again in a few moments."
        });
    }
});

module.exports = router;
