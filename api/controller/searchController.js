// const asyncHandler = require("express-async-handler");
// const SearchRepository = require('../repository/searchRepository');


// const searchRepository = new SearchRepository();

// exports.getResponse = asyncHandler(async (req, res) => {
//     try {
//         const { query, limit } = req.body;
//         let a = await searchRepository.getResponse(query, limit);
//         res.status(200).json({ message: "OK" })
//     } catch (error) {
//         console.log("Errore: ", error);
//         res.status(400).json({ message: "ERROR" })
//     }
// });
const asyncHandler = require("express-async-handler");
const SearchRepository = require('../repository/searchRepository');

const searchRepository = new SearchRepository();

exports.getResponse = asyncHandler(async (req, res) => {
    try {
        const { query, limit } = req.body;
        const results = await searchRepository.getResponse(query, limit);
        
        // Ensure we're sending a properly formatted response
        res.status(200).json({
            results: results.matches?.map(match => ({
                title: match.metadata?.file_path?.split('\\').pop() || 'Untitled',
                highlight: [match.metadata?.chunk_text || ''],
                score: match.score
            })) || [],
            explanation: results.matches?.length > 0 
                ? "Ecco i risultati della ricerca:" 
                : "Nessuna corrispondenza trovata"
        });
    } catch (error) {
        console.error("Error in search:", error);
        res.status(500).json({ 
            error: 'Error during search', 
            results: [],
            explanation: "Si è verificato un errore durante la ricerca"
        });
    }
});