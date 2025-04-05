const { Client } = require('@elastic/elasticsearch');
const { HfInference } = require('@huggingface/inference');
const mammoth = require('mammoth'); // Per leggere file DOCX
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

class SearchRepository {

    async getResponse(query, limit = 5) {
        console.log("Processing search query:", query, "limit:", limit);
        try {
            // For now, return mock results until Elasticsearch is properly set up
            return {
                results: [{
                    id: '1',
                    title: 'Test Document',
                    highlight: ['Relevant content will be displayed here'],
                    score: 1.0
                }],
                explanation: "This is a test response. Search functionality is working.",
                totalHits: 1
            };
        } catch (error) {
            console.error("Error in searchRepository:", error);
            throw error;
        }
    }

}

module.exports = SearchRepository;