const path = require('path');
require('dotenv').config({ path: path.join(__dirname, './env', '.env-local') });
const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('@elastic/elasticsearch');
const { OpenAI } = require('openai');
const fs = require('fs');
const cors = require("cors");
const mammoth = require('mammoth');
const chokidar = require('chokidar');

// Elasticsearch configuration
const esClient = new Client({ 
    node: 'http://localhost:9200',
    auth: {
        username: process.env.ES_USERNAME,
        password: process.env.ES_PASSWORD
    }
});

// OpenAI client setup
const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Express app setup
const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;
app.use(bodyParser.json());

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
      const allowedOrigins = [process.env.FE_DOMAIN, process.env.FE_DOMAIN_WWW];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    optionsSuccessStatus: 200,
};
  
app.use(cors(corsOptions));

// Elasticsearch index configuration
const baseIndexName = 'myapp_index';
let indexName = '';

// Create Elasticsearch index if it doesn't exist
const createIndex = async () => {
    try {
        const exists = await esClient.indices.exists({ index: indexName });
        if (!exists) {
            await esClient.indices.create({
                index: indexName,
                body: {
                    settings: {
                        number_of_shards: 1,
                        number_of_replicas: 0,
                        analysis: {
                            analyzer: {
                                custom_analyzer: {
                                    type: "custom",
                                    tokenizer: "standard",
                                    filter: ["lowercase", "asciifolding"]
                                }
                            }
                        }
                    },
                    mappings: {
                        properties: {
                            title: { 
                                type: 'text',
                                analyzer: "custom_analyzer" 
                            },
                            content: { 
                                type: 'text',
                                analyzer: "custom_analyzer" 
                            },
                            file_path: { type: 'keyword' }
                        }
                    }
                }
            });
            console.log(`Index "${indexName}" created successfully.`);
        } else {
            console.log(`Index "${indexName}" already exists.`);
        }
    } catch (error) {
        console.error('Error creating index:', error);
    }
};

// Read documents from folder and index them
const readDocumentsFromFolder = async (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        const indexPromises = files.map(async (file) => {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isDirectory()) {
                // Process subdirectories recursively, up to maxDepth
                const currentDepth = folderPath.split(path.sep).length - baseFolderDepth + 1;
                if (currentDepth < maxDepth) {
                    await readDocumentsFromFolder(filePath);
                }
            } else if (path.extname(file).toLowerCase() === '.docx') {
                try {
                    const { value: content } = await mammoth.extractRawText({ path: filePath });
                    await indexDocument(file, content, filePath);
                } catch (error) {
                    console.error(`Error reading document "${file}":`, error);
                }
            } else {
                console.log(`File "${file}" is not a DOCX document, skipping.`);
            }
        });

        await Promise.all(indexPromises);
    } catch (error) {
        console.error(`Error reading folder ${folderPath}:`, error);
    }
};

// Index a document with unique id
const indexDocument = async (title, content, filePath) => {
    try {
        // Use file path as unique id to prevent duplicates
        const id = Buffer.from(filePath).toString('base64');

        // Index document with specified id
        await esClient.index({
            index: indexName,
            id,  // Will overwrite document if it already exists
            body: {
                title,
                content,
                file_path: filePath
            },
            op_type: 'index',  // 'index' overwrites or creates if it doesn't exist
            refresh: true  // Make document immediately searchable
        });

        console.log(`Document "${title}" indexed successfully.`);
    } catch (error) {
        console.error(`Error indexing document "${title}":`, error);
    }
};

// Variables for caching recent search results
let lastSearchPhrase = null;
let lastExplanation = null;
let lastNDocuments = [];

// Search documents in Elasticsearch
const searchDocuments = async (query, limit = 5) => {
    try {
        console.log("Searching for:", query);
        let response = await esClient.search({
            index: indexName,
            body: {
                size: limit,
                query: {
                    bool: {
                        must: [
                            {
                                multi_match: {
                                    query: query,
                                    fields: ['title^2', 'content'],  // Title has higher weight
                                    type: 'most_fields',
                                    operator: 'and',  // Requires all words to be present
                                    fuzziness: 'AUTO'  // Enable controlled fuzzy matching
                                }
                            }
                        ],
                        should: [
                            {
                                match_phrase: {
                                    content: {
                                        query: query,
                                        slop: 3,  // Allow some words between phrase terms
                                        boost: 2  // Give phrase matches higher importance
                                    }
                                }
                            },
                        ],
                        minimum_should_match: 0  // The must clause is required, should clauses are optional
                    }
                },
                highlight: {
                    order: "score",
                    fields: {
                        content: {
                            fragment_size: 300,  // Larger fragments for better context
                            number_of_fragments: 3,
                            pre_tags: ["<strong>"],
                            post_tags: ["</strong>"]
                        }
                    }
                },
                suggest: {
                    text: query,
                    content_suggestion: {
                        term: {
                            field: "content",
                            suggest_mode: "popular",
                            sort: "frequency"
                        }
                    }
                }
            }
        });

        // Format search results
        let results = response.hits.hits.map(hit => ({
            id: hit._id,
            title: hit._source.title,
            highlight: hit.highlight ? hit.highlight.content : [],
            score: hit._score,
            path: hit._source.file_path
        }));

        // Store full document content for AI processing
        lastNDocuments = response.hits.hits.map(hit => ({
            title: hit._source.title,
            content: hit._source.content
        }));

        // Handle case when no results found but suggestions available
        if (results.length === 0 && response.suggest && response.suggest.content_suggestion) {
            const suggestions = response.suggest.content_suggestion
                .flatMap(group => group.options)
                .map(option => option.text);
            
            if (suggestions.length > 0) {
                // Use the best suggestion to retry search
                const suggestedQuery = suggestions[0];
                console.log(`No results for "${query}". Trying suggestion: "${suggestedQuery}"`);
                
                const newResponse = await searchDocuments(suggestedQuery, limit);
                if (newResponse && newResponse.length > 0) {
                    return {
                        results: newResponse,
                        originalQuery: query,
                        suggestedQuery: suggestedQuery
                    };
                }
            }
        }

        return {
            results,
            totalHits: response.hits.total.value
        };
    }
    catch (error) {
        console.error("Search error:", error);
        return { results: [], totalHits: 0 };
    }
};

// Generate AI explanation based on document content
const generateDocumentBasedResponse = async (searchPhrase, documentContents, followUp = false, followUpText = '') => {
    try {
        let prompt;
        
        // Format document content for the prompt
        const formattedDocs = documentContents.map((doc, index) => {
            // Use more document content for context
            const excerpt = doc.content.slice(0, 2000);
            return `DOCUMENT ${index + 1}: ${doc.title}\n${excerpt}`;
        }).join('\n\n---\n\n');

        if (followUp && lastExplanation) {
            // Follow-up prompt with context from previous interaction
            prompt = `Sei un assistente specializzato nella ricerca di documenti. La tua funzione è rispondere utilizzando ESCLUSIVAMENTE le informazioni contenute nei documenti forniti.

Domanda originale: "${lastSearchPhrase}"
Tua risposta precedente: "${lastExplanation}"
Domanda di follow-up: "${followUpText}"

Contenuti dei documenti rilevanti:
${formattedDocs}

Rispondi alla domanda di follow-up ESCLUSIVAMENTE con le informazioni presenti nei documenti forniti.
Se l'informazione richiesta non è presente nei documenti, rispondi: "Mi dispiace, questa informazione non è disponibile nei documenti che ho analizzato."
Non inventare informazioni e non utilizzare conoscenze esterne ai documenti forniti.
Cita specifici passaggi dei documenti quando possibile.`;
        } else {
            // Initial prompt
            prompt = `Sei un assistente specializzato nella ricerca di documenti. La tua funzione è rispondere utilizzando ESCLUSIVAMENTE le informazioni contenute nei documenti forniti.

Domanda dell'utente: "${searchPhrase}"

Contenuti dei documenti rilevanti:
${formattedDocs}

Rispondi alla domanda ESCLUSIVAMENTE con le informazioni presenti nei documenti forniti.
Se l'informazione richiesta non è presente nei documenti, rispondi: "Mi dispiace, questa informazione non è disponibile nei documenti che ho analizzato."
Non inventare informazioni e non utilizzare conoscenze esterne ai documenti forniti.
Cita specifici passaggi dei documenti quando possibile.`;
        }
        
        console.log("Generating AI response with prompt length:", prompt.length);

        const response = await openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,  // Lower temperature for factual responses
            max_tokens: 800,   // Allow for detailed responses
            top_p: 0.95,       // Focus on most likely tokens
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        });
        
        console.log("AI response received, tokens used:", response.usage.total_tokens);
        const explanation = response.choices[0].message.content.trim();

        // Update cache only for new searches
        if (!followUp) {
            lastSearchPhrase = searchPhrase;
            lastExplanation = explanation;
        }

        return explanation;
    } catch (error) {
        console.error('Error generating response:', error);
        return 'Mi dispiace, non è stato possibile generare una risposta basata sui documenti.'; 
    }
};

// Search API endpoint
app.post('/search_in_doc', async (req, res) => {  
    const { query, limit = 5, followUp = false, followUpText = '' } = req.body;
    
    try {
        if (!followUp) {
            // New search
            const searchResults = await searchDocuments(query, limit);
            
            if (searchResults.results.length > 0) {
                const explanation = await generateDocumentBasedResponse(query, lastNDocuments);
                res.json({ 
                    ...searchResults,
                    explanation 
                });
            } else {
                res.json({ 
                    results: [], 
                    totalHits: 0,
                    explanation: "Nessuna corrispondenza trovata nei documenti disponibili." 
                });
            }
        } else {
            // Follow-up question
            if (lastNDocuments.length === 0) {
                res.json({
                    results: [],
                    explanation: "Non ci sono documenti contestuali disponibili. Per favore esegui una nuova ricerca."
                });
                return;
            }
            
            const explanation = await generateDocumentBasedResponse(
                query || lastSearchPhrase, 
                lastNDocuments, 
                true, 
                followUpText
            );
            
            res.json({ 
                results: [], // No new search results for follow-up
                explanation 
            });
        }
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ 
            error: 'Errore durante la ricerca', 
            message: error.message 
        });
    }
});

// Document folder configuration
const folderPaths = ['./private/Editoriale', './private/Alert Normativo'];
const maxDepth = 2; // How deep to traverse directories
let baseFolderDepth = 0;

// Check if path is within allowed depth
function isWithinDepth(filePath, basePath) {
    const relativePath = path.relative(basePath, filePath);
    const depth = relativePath.split(path.sep).length;
    return depth <= maxDepth;
}

// Watch folder for changes
const watchDocumentsFolder = (folderPath) => {
    const watcher = chokidar.watch(folderPath, {
        persistent: true,
        ignored: /(^|[\/\\])\../,  // Ignore hidden files
        ignoreInitial: true,       // Ignore initial scan events
        depth: maxDepth            // Limit directory traversal depth
    });

    // File added event
    watcher.on('add', async (filePath) => {
        if (path.extname(filePath).toLowerCase() === '.docx' && isWithinDepth(filePath, folderPath)) {
            console.log(`New document added: ${filePath}`);
            try {
                const { value: content } = await mammoth.extractRawText({ path: filePath });
                const fileName = path.basename(filePath);
                await indexDocument(fileName, content, filePath);
            } catch (error) {
                console.error(`Error processing new document ${filePath}:`, error);
            }
        }
    });

    // File removed event
    watcher.on('unlink', async (filePath) => {
        if (path.extname(filePath).toLowerCase() === '.docx' && isWithinDepth(filePath, folderPath)) {
            console.log(`Document removed: ${filePath}`);
            try {
                const id = Buffer.from(filePath).toString('base64');
                await esClient.delete({
                    index: indexName,
                    id: id,
                    refresh: true
                });
                console.log(`Document ${filePath} removed from index`);
            } catch (error) {
                console.error(`Error removing document ${filePath} from index:`, error);
            }
        }
    });

    // File changed event
    watcher.on('change', async (filePath) => {
        if (path.extname(filePath).toLowerCase() === '.docx' && isWithinDepth(filePath, folderPath)) {
            console.log(`Document changed: ${filePath}`);
            try {
                const { value: content } = await mammoth.extractRawText({ path: filePath });
                const fileName = path.basename(filePath);
                await indexDocument(fileName, content, filePath);
            } catch (error) {
                console.error(`Error reindexing changed document ${filePath}:`, error);
            }
        }
    });

    watcher.on('error', (error) => console.error(`Watcher error: ${error}`));
};

// Initialize index and set up watchers
const initIndex = async () => {
    indexName = `${baseIndexName}_${Date.now()}`;
    await createIndex();

    for (const folderPath of folderPaths) {
        baseFolderDepth = folderPath.split(path.sep).length;
        await readDocumentsFromFolder(folderPath);
        watchDocumentsFolder(folderPath);
    }
    
    console.log(`Index "${indexName}" initialized and ready for searching.`);
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', indexName });
});

// Initialize and start server
const startServer = async () => {
    try {
        await initIndex(); 
        app.listen(port, () => console.log(`Server is listening on port ${port}`));
    } catch (error) {
        console.error("Failed to initialize index or start server:", error);
        process.exit(1);
    }
};

// Main entry point
startServer();