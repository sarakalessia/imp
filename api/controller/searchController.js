const asyncHandler = require("express-async-handler");
const SearchRepository = require('../repository/searchRepository');


const searchRepository = new SearchRepository();

exports.getResponse = asyncHandler(async (req, res) => {
    try {
        const { query, limit } = req.body;
        let a = await searchRepository.getResponse(query, limit);
        res.status(200).json({ message: "OK" })
    } catch (error) {
        console.log("Errore: ", error);
        res.status(400).json({ message: "ERROR" })
    }
});