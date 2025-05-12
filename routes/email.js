const express = require('express');
const router = express.Router();
const User = require('../models/user');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Endpoint to render the email page
router.get('/', async (req, res) => {
    const email = req.query.email ? decodeURIComponent(req.query.email) : undefined;
    const password = req.query.password ? decodeURIComponent(req.query.password) : undefined;
    const username = req.query.username ? decodeURIComponent(req.query.username) : undefined;
    const temptoken = req.query.temptoken ? decodeURIComponent(req.query.temptoken) : undefined;

    if (!email || !password || !username) {
        return res.status(404).render('error', {
            error_title: "Account Not Found",
            status_code: 404,
            error: "We couldn't find your account in our system. This might happen if your account was recently deleted or if there's a temporary issue. Please try signing out and signing in again through the SafeScroll extension popup. If the problem persists, you may need to create a new account."
        });
    }

    // Check if user exists and is already verified
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isVerified) {
        return res.status(403).render('error', {
            error_title: "Email Already Verified",
            status_code: 403,
            error: "This email has already been verified. Please sign in to your account through the SafeScroll extension popup."
        });
    }

    res.render('emailpage', { email: email, username: username, password: password, temptoken: temptoken });
});

router.post("/verify-otp", async (req, res) => {
    const { otp, temptoken, username, email, password } = req.body;
    if (!temptoken || !username || !email || !password) {
        return res.status(400).json({
            error_message: "Missing required parameters.",
        });
    }
    try {
        const decodedToken = jwt.decode(temptoken);
        if (!decodedToken || !decodedToken.exp) {
            return res.status(400).json({
                error_message: "Invalid token.",
            });
        }
        // Check if the token is expired
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (decodedToken.exp < currentTimestamp) {
            return res.status(400).json({
                error_message: "OTP expired.",
            });
        }
        const tempUserData = jwt.verify(temptoken, 'Nevergiveup');

        // Check if OTP matches and is not expired
        const trimmedOtp = otp.trim();
        if (
            Number(tempUserData.otp) !== Number(trimmedOtp) ||
            Date.now() > tempUserData.otpExpiry
        ) {
            return res.status(400).json({
                error_message: "Invalid or expired OTP.",
            });
        }

        // Check if user exists and is already verified
        const existingVerifiedUser = await User.findOne({ email, isVerified: true });
        if (existingVerifiedUser) {
            return res.status(403).json({
                error_message: "This email has already been verified. Please sign in to your account.",
            });
        }

        const user = await User.findOne({ username: username });
        const hashedPassword = await bcrypt.hash(password, 10);
        if (user) {
            user.username = username;
            user.email = email;
            user.password = hashedPassword;
            user.isVerified = true;
            user.verificationCompleted = true; // Add flag to indicate verification process is complete
            await user.save();
        }
        else {
            // Save the user to the database
            const newUser = new User({
                username,
                email,
                password: hashedPassword,
                isVerified: true,
                verificationCompleted: true // Add flag to indicate verification process is complete
            });

            await newUser.save();
        }
        // Send success response
        return res.status(200).json({
            message: "OTP Verified. Account successfully created.",
        });
    } catch (error) {
        console.error("Error during OTP verification:", error);
        // Send error response
        return res.status(500).json({
            error_message: "An error occurred while verifying the OTP. Please try again later.",
        });
    }
});


router.post("/resend-otp", async (req, res) => {
    try {
        const { email, username, password } = req.body;
        // Generate a new OTP
        const otp = Math.floor(1000 + Math.random() * 9000);
        const otpExpiry = Date.now() + 90000; // 90 seconds
        // Sign a new token
        let newTempToken;
        try {
            const tempUserData = { otp, otpExpiry };
            newTempToken = jwt.sign(tempUserData, 'Nevergiveup', { expiresIn: '90s' });
        } catch (error) {
            console.error("Error generating new token:", error);
            return res.status(500).json({
                error_message: "Failed to generate a new token.",
            });
        }

        // Send the new OTP via email
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: {
                user: 'f219298@cfd.nu.edu.pk', // Use an app password
                pass: 'toja swko fidh mtyy'     // Replace with a Gmail app password
            },
            tls: { rejectUnauthorized: false }
        });

        const mailOptions = {
            from: 'f219298@cfd.nu.edu.pk',
            to: email,
            subject: 'Your New OTP for Email Verification',
            html: `
                <p>Your new OTP for email verification is: <strong>${otp}</strong>.</p>
                <p>The OTP is valid for 1 minute.</p>
            `,
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (error) {
            console.error("Error while sending email:", error);
            return res.status(500).json({
                error_message: "Failed to send the email. Please try again later.",
            });
        }
        // Send a successful response
        return res.status(200).json({
            message: "OTP Resent",
            email: email,
            temptoken: newTempToken,
            username: username,
            password: password
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            error_message: "An error occurred while resending the OTP. Please try again later.",
        });
    }
});

module.exports = router;
