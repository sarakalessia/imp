const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const bodyParser = require('body-parser');
const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAI } = require('openai');
const fs = require('fs');
const cors = require('cors');
const mammoth = require('mammoth');
const chokidar = require('chokidar');

// Pinecone client setup
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = 'text-embedding-ada';
const index = pinecone.Index(indexName);

// OpenAI client setup
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Express app setup
const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;
app.use(bodyParser.json());

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [process.env.FE_DOMAIN, process.env.FE_DOMAIN_WWW, 'http://localhost:8080'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Function to split text into larger chunks
const splitIntoChunks = (text) => {
  const paragraphs = text.split(/\n\n+/).filter(chunk => chunk.trim().length > 0);
  const chunkSize = 500;
  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length < chunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = paragraph;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
};

// Function to generate embeddings using OpenAI
const generateEmbedding = async (text) => {
  try {
    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
};

// Index a document by splitting into chunks and upserting to Pinecone
const indexDocument = async (filePath) => {
  try {
    const { value: text } = await mammoth.extractRawText({ path: filePath });
    const chunks = splitIntoChunks(text);
    console.log(`Extracted ${chunks.length} chunks from "${filePath}"`);
    if (chunks.length === 0) {
      console.warn(`No chunks found in "${filePath}"`);
      return;
    }
    const vectors = await Promise.all(
      chunks.map(async (chunk, i) => {
        const embedding = await generateEmbedding(chunk);
        const id = `${Buffer.from(filePath).toString('base64')}_${i}`;
        return {
          id,
          values: embedding,
          metadata: {
            file_path: filePath,
            chunk_text: chunk,
          },
        };
      })
    );
    await index.upsert(vectors);
    console.log(`Document "${filePath}" indexed with ${chunks.length} chunks.`);
  } catch (error) {
    console.error(`Error indexing document "${filePath}":`, error);
  }
};

// Delete vectors associated with a document
const deleteDocumentVectors = async (filePath) => {
  try {
    await index.delete({ filter: { file_path: { $eq: filePath } } });
    console.log(`Vectors for document "${filePath}" deleted.`);
  } catch (error) {
    console.error(`Error deleting vectors for document "${filePath}":`, error);
  }
};

// Read documents from folder and index them
const readDocumentsFromFolder = async (folderPath) => {
  try {
    const files = fs.readdirSync(folderPath);
    const indexPromises = files.map(async (file) => {
      const filePath = path.join(folderPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        const currentDepth = folderPath.split(path.sep).length - baseFolderDepth + 1;
        if (currentDepth < maxDepth) {
          await readDocumentsFromFolder(filePath);
        }
      } else if (path.extname(file).toLowerCase() === '.docx') {
        await indexDocument(filePath);
      } else {
        console.log(`File "${file}" is not a DOCX document, skipping.`);
      }
    });
    await Promise.all(indexPromises);
  } catch (error) {
    console.error(`Error reading folder ${folderPath}:`, error);
  }
};

// Cache for recent search results
let lastSearchPhrase = null;
let lastExplanation = null;
let lastNDocuments = [];

// Search documents using Pinecone
const searchDocuments = async (query, limit = 5) => {
  try {
    console.log('Searching for query:', query);
    const queryEmbedding = await generateEmbedding(query);
    console.log('Query embedding generated, length:', queryEmbedding.length);
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true,
    });
    console.log('Pinecone query response:', JSON.stringify(queryResponse, null, 2));
    const results = queryResponse.matches.map((match) => ({
      id: match.id,
      score: match.score,
      chunk_text: match.metadata.chunk_text,
      file_path: match.metadata.file_path,
    }));
    console.log('Search results:', results);
    lastNDocuments = results.map((result) => ({
      title: path.basename(result.file_path),
      content: result.chunk_text,
    }));
    console.log('Updated lastNDocuments:', lastNDocuments);
    return {
      results,
      totalHits: queryResponse.matches.length,
    };
  } catch (error) {
    console.error('Search error:', error);
    return { results: [], totalHits: 0 };
  }
};

// Generate AI response based on retrieved chunks
const generateDocumentBasedResponse = async (searchPhrase, documentContents, followUp = false, followUpText = '') => {
  try {
    const formattedDocs = documentContents
      .map((doc, index) => `DOCUMENT ${index + 1}: ${doc.title}\n${doc.content}`)
      .join('\n\n---\n\n');

    let prompt;
    if (followUp && lastExplanation) {
      prompt = `Sei un assistente specializzato nella ricerca di documenti. Usa ESCLUSIVAMENTE le informazioni nei documenti forniti per rispondere.

Domanda originale: "${lastSearchPhrase}"
Risposta precedente: "${lastExplanation}"
Domanda di follow-up: "${followUpText}"

Documenti rilevanti:
${formattedDocs}

Rispondi alla domanda di follow-up basandoti solo sui documenti forniti. Se l'informazione specifica non è presente, usa i contenuti disponibili per dedurre una risposta ragionevole, citando i documenti rilevanti. Se i documenti non contengono nulla di pertinente, rispondi: "Mi dispiace, questa informazione non è disponibile nei documenti che ho analizzato."`;
    } else {
      prompt = `Sei un assistente specializzato nella ricerca di documenti. Usa ESCLUSIVAMENTE le informazioni nei documenti forniti per rispondere.

Domanda: "${searchPhrase}"

Documenti rilevanti:
${formattedDocs}

Rispondi alla domanda basandoti solo sui documenti forniti. Se l'informazione specifica non è presente, usa i contenuti disponibili per dedurre una risposta ragionevole, citando i documenti rilevanti (includendo titolo e contenuto). Se i documenti non contengono nulla di pertinente, rispondi: "Mi dispiace, questa informazione non è disponibile nei documenti che ho analizzato."`;
    }

    console.log('Prompt:', prompt);
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 800,
      top_p: 0.95,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
    });
    const explanation = response.choices[0].message.content.trim();

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
      const searchResults = await searchDocuments(query, limit);
      if (searchResults.results.length > 0) {
        const explanation = await generateDocumentBasedResponse(query, lastNDocuments);
        res.json({ ...searchResults, explanation });
      } else {
        res.json({
          results: [],
          totalHits: 0,
          explanation: 'Nessuna corrispondenza trovata nei documenti disponibili.',
        });
      }
    } else {
      if (lastNDocuments.length === 0) {
        res.json({
          results: [],
          explanation: 'Non ci sono documenti contestuali disponibili. Per favore esegui una nuova ricerca.',
        });
        return;
      }
      const explanation = await generateDocumentBasedResponse(
        query || lastSearchPhrase,
        lastNDocuments,
        true,
        followUpText
      );
      res.json({ results: [], explanation });
    }
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Errore durante la ricerca', message: error.message });
  }
});

// Document folder configuration
const folderPaths = ['./private/Editoriale', './private/Alert Normativo'];
const maxDepth = 2;
let baseFolderDepth = 0;

// Check depth for directory traversal
function isWithinDepth(filePath, basePath) {
  const relativePath = path.relative(basePath, filePath);
  const depth = relativePath.split(path.sep).length;
  return depth <= maxDepth;
}

// Watch folder for changes
const watchDocumentsFolder = (folderPath) => {
  const watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignored: /(^|[\/\\])\../,
    ignoreInitial: true,
    depth: maxDepth,
  });

  watcher
    .on('add', async (filePath) => {
      if (path.extname(filePath).toLowerCase() === '.docx' && isWithinDepth(filePath, folderPath)) {
        console.log(`New document added: ${filePath}`);
        await indexDocument(filePath);
      }
    })
    .on('change', async (filePath) => {
      if (path.extname(filePath).toLowerCase() === '.docx' && isWithinDepth(filePath, folderPath)) {
        console.log(`Document changed: ${filePath}`);
        await deleteDocumentVectors(filePath);
        await indexDocument(filePath);
      }
    })
    .on('unlink', async (filePath) => {
      if (path.extname(filePath).toLowerCase() === '.docx' && isWithinDepth(filePath, folderPath)) {
        console.log(`Document removed: ${filePath}`);
        await deleteDocumentVectors(filePath);
      }
    })
    .on('error', (error) => console.error(`Watcher error: ${error}`));
};

// Initialize indexing and watchers
const initIndex = async () => {
  for (const folderPath of folderPaths) {
    baseFolderDepth = folderPath.split(path.sep).length;
    await readDocumentsFromFolder(folderPath);
    watchDocumentsFolder(folderPath);
  }
  console.log(`Pinecone index "${indexName}" initialized and ready for searching.`);
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', indexName });
});

// Start server
const startServer = async () => {
  try {
    await initIndex();
    app.listen(port, () => console.log(`Server is listening on port ${port}`));
  } catch (error) {
    console.error('Failed to initialize index or start server:', error);
    process.exit(1);
  }
};

startServer();