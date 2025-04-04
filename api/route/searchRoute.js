const express = require('express');
const router = express.Router();

//import controllers
const search_controller = require("../controller/searchController");

const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
    return next();
    } else {
    res.status(401).json({ message: "Unauthorized Access" });
    }
};

//default
router.get("/", (req, res) => {
    res.send("default route");
});

//login
router.get("/search/:word", search_controller.getResponse);

module.exports = router;