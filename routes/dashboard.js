const express = require("express");
const authenticateToken = require('../middlewares/auth');
const cookieParser = require('cookie-parser');
const User = require('../models/user');

const router = express.Router();

// Store images temporarily
let storedImages = [];

// Function to paginate images
function paginateImages(images, page = 1, perPage = 10) {
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;

    const paginatedImages = images.slice(startIndex, endIndex);
    const totalPages = Math.ceil(images.length / perPage);

    return {
        images: paginatedImages,
        currentPage: page,
        totalPages,
        totalImages: images.length
    };
}

function calculateImageStatistics(images) {
    let totalImages = images.length;
    let hatefulCount = 0;
    let nonHatefulCount = 0;

    images.forEach(img => {
        if (img.isHateful) {
            hatefulCount++;
        } else {
            nonHatefulCount++;
        }
    });

    return {
        totalImages,
        hatefulCount,
        nonHatefulCount
    };
}

// POST route to receive images from popup
router.post('/', authenticateToken, (req, res) => {
    const { images } = req.body;
    if (images && Array.isArray(images)) {
        // Sort images by timestamp in descending order
        storedImages = images.sort((a, b) => b.timestamp - a.timestamp);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, message: 'Invalid image data' });
    }
});

// GET route to display dashboard
router.get("/", authenticateToken, async (req, res) => {
    try {
        const tempuser = req.user;
        if (!tempuser) {
            return res.status(404).render('error', {
                error_title: "Authentication Required",
                status_code: 404,
                error: "We couldn't find your user session. Please sign in again to access your dashboard. If you don't have an account yet, you can create one through the SafeScroll extension popup."
            });
        }

        const username = tempuser.username;
        const user = await User.findOne({ username: username });
        if (!user) {
            return res.status(404).render('error', {
                error_title: "Account Not Found",
                status_code: 404,
                error: "We couldn't find your account in our system. This might happen if your account was recently deleted or if there's a temporary issue. Please try signing out and signing in again through the SafeScroll extension popup. If the problem persists, you may need to create a new account."
            });
        }

        let isSubscribed = false;
        const { subscription } = user;

        if (subscription?.startDate && subscription?.endDate) {
            const currentDate = Date.now();
            const startDate = new Date(subscription.startDate).getTime();
            const endDate = new Date(subscription.endDate).getTime();

            isSubscribed = currentDate >= startDate && currentDate <= endDate;
        }

        if (!isSubscribed) {
            return res.status(403).render('error', {
                error_title: "Subscription Required",
                status_code: 403,
                error: "Access to the dashboard requires an active subscription. You can subscribe through the extension popup."
            });
        }

        // Get page number from query parameter, default to 1
        const page = parseInt(req.query.page) || 1;
        const perPage = 10; // Number of images per page

        const stats = calculateImageStatistics(storedImages);

        // Paginate the stored images
        const { images, currentPage, totalPages, totalImages } = paginateImages(storedImages, page, perPage);

        res.render("dashboard", {
            images,
            isSubscribed,
            currentPage,
            totalPages,
            totalImages,
            stats
        });
    } catch (error) {
        console.error("Error in GET /:", error);
        res.status(500).render('error', {
            error_title: "Temporary Service Disruption",
            status_code: 500,
            error: "We're experiencing some technical difficulties at the moment. Our team has been notified and is working to resolve this issue. We apologize for any inconvenience."
        });
    }
});

module.exports = router;
