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

// Configurazione di Elasticsearch
const esClient = new Client({ 
    node: 'http://localhost:9200',
    auth: {
        username: process.env.ES_USERNAME,
        password: process.env.ES_PASSWORD
    }
});

const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(express.json());
const port = process.env.PORT;
app.use(bodyParser.json());

//CORS//
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

const baseIndexName = 'myapp_index';

let indexName = '';//`${baseIndexName}_${Date.now()}`;

// Creazione dell'indice (se non esiste)
const createIndex = async () => {
    try {
        const exists = await esClient.indices.exists({ index: indexName });
        if (!exists.body) {
            await esClient.indices.create({
                index: indexName,
                body: {
                    settings: {
                        number_of_shards: 1,
                        number_of_replicas: 0
                    },
                    mappings: {
                        properties: {
                            title: { type: 'text' },
                            content: { type: 'text' },
                        }
                    }
                }
            });
            console.log(`Indice "${indexName}" creato.`);
        } else {
            console.log(`Indice "${indexName}" già esistente.`);
        }
    } catch (error) {
        console.error('Errore durante la creazione dell\'indice:', error);
    }
};

// Funzione per leggere i documenti da una cartella
const readDocumentsFromFolder = async (folderPath) => {
    const files = fs.readdirSync(folderPath);
    const indexPromises = files.map(async (file) => {
        const filePath = path.join(folderPath, file);
        if (path.extname(file) === '.docx') {
            try {
                const { value: content } = await mammoth.extractRawText({ path: filePath });
                await indexDocument(file, content);
            } catch (error) {
                console.error(`Errore nella lettura del documento "${file}":`, error);
            }
        } else {
            console.log(`File "${file}" non è un documento DOCX, verrà ignorato.`);
        }
    });

    await Promise.all(indexPromises);
};

// Funzione per indicizzare un documento con un id unico
const indexDocument = async (title, content) => {
    try {
        // Usa il nome del file come id unico per prevenire duplicati
        const id = title;

        // Indica un documento specificando un id
        await esClient.index({
            index: indexName,
            id,  // Questo sovrascriverà il documento se esiste già
            body: {
                title,
                content,
            },
            op_type: 'index'  // 'index' sovrascrive o crea se non esiste
        });

        console.log(`Documento "${title}" indicizzato con successo.`);
    } catch (error) {
        console.error(`Errore durante l'indicizzazione del documento "${title}":`, error);
    }
};

let lastNDocuments = [];
let results = [];
const searchDocuments = async (query, limit) => {
    try{
        console.log("searchDocuments query", query);
    let response = await esClient.search({
        index: indexName,
        body: {
            query: {
                bool: {
                    must: [
                        {
                            multi_match: {
                                query: query,
                            fields: ['title', 'content'],
                            type: 'most_fields',
                            operator: 'and',  // Richiede che tutte le parole siano presenti
                            fuzziness: '0'  // Disabilita il fuzziness per risultati più precisi
                        }
                        }
                    ],
                    should: [
                        {
                            match_phrase: {
                                content: {
                                    query: query,
                                    slop: 0
                                }
                            }
                        },
                    ],
                    minimum_should_match: 1
                }
            },
            highlight: {
                fields: {
                    content: {
                        fragment_size: 150,
                        number_of_fragments: 3
                    }
                }
            },
            suggest: {
                text: query,
                simple_phrase: {
                    phrase: {
                        field: "content",
                        size: 2,
                        gram_size: 3,
                        direct_generator: [{
                            field: "content",
                            suggest_mode: "always"
                        }],
                        highlight: {
                            pre_tag: "<em>",
                            post_tag: "</em>"
                        }
                    }
                }
            }
        }
    });

     // Aggiorna i risultati con quelli basati sul suggerimento
     let results = response.hits.hits.map(hit => ({
        id: hit._id,
        title: hit._source.title,
        highlight: hit.highlight.content
    }));

    lastNDocuments = response.hits.hits.slice(-limit).map(hit => hit._source.content); // Ultimi 'limit' documenti

    // Se non ci sono risultati, utilizza il suggerimento per rifare la ricerca
    if (results.length === 0 && response.suggest && response.suggest.simple_phrase[0].options.length > 0) {
        const suggestedText = response.suggest.simple_phrase[0].options[0].text;
        console.log("Nessun risultato trovato. Riprovo con suggerimento:", suggestedText);

        // Esegui una nuova ricerca con il suggerimento
        response = await esClient.search({
            index: indexName,
            body: {
                query: {
                    bool: {
                        must: [
                            {
                                multi_match: {
                                    query: suggestedText,
                                    fields: ['title', 'content'],
                                    type: 'most_fields',
                                    operator: 'and',
                                    fuzziness: 'AUTO'
                                }
                            }
                        ],
                        should: [
                            {
                                match_phrase: {
                                    content: {
                                        query: suggestedText,
                                        slop: 2
                                    }
                                }
                            },
                        ],
                        minimum_should_match: 1
                    }
                },
                highlight: {
                    fields: {
                        content: {
                            fragment_size: 150,
                            number_of_fragments: 3
                        }
                    }
                },
            }
        });
        
        // Aggiorna i risultati con quelli basati sul suggerimento
        results = response.hits.hits.map(hit => ({
            id: hit._id,
            title: hit._source.title,
            highlight: hit.highlight.content
        }));
        
        lastNDocuments = response.hits.hits.slice(-limit).map(hit => hit._source.content); // Ultimi 'limit' documenti
    }

    return results;
}
catch(error){
    console.log("searchDocuments error", error);
    return [];
}
};


app.post('/search_in_doc', async (req, res) => {  
    const { query, limit, followUp, followUpText } = req.body;
    
    try {
        if (!followUp) {
            lastNDocuments = [];
            results = [];
            
            results = await searchDocuments(query, limit);
            
            if (results.length > 0) {
                const explanation = await generateGroupedExplanation(query, lastNDocuments);
                res.json({ results, explanation });
            }
            else{
                res.json({ results: [], explanation:  "Nessuna corrispondenza trovata" });
            }

        } else {
            // Richiesta di follow-up
            const explanation = await generateGroupedExplanation(followUpText, lastNDocuments, true, followUpText); // Passa il follow-up text
            res.json({ results: [], explanation });
        }
    } catch (error) {
        console.error('Errore nella ricerca:', error);
        res.status(500).send('Errore nella ricerca');
    }
});

// Variabili per cache temporanea
let lastSearchPhrase = null;
let lastExplanation = null;

const generateGroupedExplanation = async (searchPhrase, documentContents, followUp,followUpText = '') => {
    try {
        let prompt;
        const summarizedContents = documentContents.map(doc => doc.slice(0, 200));  // Usa solo i primi 200 caratteri di ogni documento
        if (followUp && lastExplanation) {
            // Prompt di follow-up con `followUpText`
            prompt = `Hai chiesto chiarimenti riguardo a "${searchPhrase}".\n` +
                     `Richiesta originale: "${lastSearchPhrase}"\n` +
                     `Spiegazione precedente: "${lastExplanation.slice(0, 100)}""\n` +
                     `Contenuti rilevanti dei documenti:\n` +
                     `${summarizedContents.join('\n')}\n` +
                     `Per favore, rispondi alla tua richiesta di chiarimento: "${followUpText}".`;
        } else {
            // Nuova richiesta di spiegazione
            prompt = `Spiega "${searchPhrase}" in 30 parole:\n${summarizedContents.join('\n')}`;
        }
        
        //console.log("generateGroupedExplanation prompt", prompt);

        const response = await openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
        });
console.log("generateGroupedExplanation response", response);
        const explanation = response.choices[0].message.content.trim();

        // Aggiorna cache solo se è una nuova ricerca
        if (!followUp) {
            lastSearchPhrase = searchPhrase;
            lastExplanation = explanation.length;
        }

        return explanation;

    } catch (error) {
        console.error('Errore:', error);
        return 'Spiegazione non disponibile'; 
    }
};

const maxDepth = 1; // Imposta la profondità massima desiderata
function isWithinDepth(filePath, basePath, maxDepth) {
    const relativePath = path.relative(basePath, filePath);
    const depth = relativePath.split(path.sep).length - 1; // Calcola la profondità
    return depth <= maxDepth; // Verifica se la profondità è accettabile
}
// Funzione per osservare la cartella e avvisare quando viene aggiunto un documento
const watchDocumentsFolder = (folderPath) => {
    const watcher = chokidar.watch(folderPath, {
        persistent: true,
        ignored: /(^|[\/\\])\../,  // ignora file nascosti
        ignoreInitial: true // Ignora gli eventi all'inizio per evitare letture duplicate
    });

    // Evento quando un file viene aggiunto
    watcher.on('add', (filePath) => {
        if (path.extname(filePath) === '.docx') {
            //console.log(`Nuovo documento aggiunto: ${filePath}`);
            initIndex();

        } else {
            console.log(`File "${filePath}" non è un documento DOCX, ignorato.`);
        }
    });

    // Eventi di rimozione di un file
    watcher.on('unlink', (filePath) => {
        if (isWithinDepth(filePath, folderPath, maxDepth)) {
            console.log(`File rimosso: ${filePath}`);
            initIndex();
        }
    });

    // Eventi di modifica di un file
    watcher.on('change', (filePath) => {
        if (isWithinDepth(filePath, folderPath, maxDepth)) {
            console.log(`File modificato: ${filePath}`);
            initIndex();
        }
    });

    watcher.on('error', (error) => console.error(`Errore nel watcher: ${error}`));
};

const initIndex = async () => {
    indexName = `${baseIndexName}_${Date.now()}`;
    await createIndex();

    for (const folderPath of folderPaths) {
        await readDocumentsFromFolder(folderPath);
        watchDocumentsFolder(folderPath);
    }
}

const folderPaths = ['./private/Editoriale', './private/Alert Normativo'];

// Initialize Index and Start Server
const startServer = async () => {
  try {
    await initIndex(); 
    app.listen(port, () => console.log(`Server is listening on port ${port}`));
  } catch (error) {
    console.error("Failed to initialize index or start server:", error);
  }
};

// Entry point
startServer();