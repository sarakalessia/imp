const { Client } = require('@elastic/elasticsearch');
const { HfInference } = require('@huggingface/inference');
const mammoth = require('mammoth'); // Per leggere file DOCX
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './env', '.env-local') });

class SearchRepository {

    async getResponse(query, limit) {
        console.log("getResponse: ** query",query, "limit",limit)
        return res.status(200).json({ message: "OK" });
    }


}

module.exports = SearchRepository

