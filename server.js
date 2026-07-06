const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const multer = require('multer');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 8082;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads')); 

// Configuration base de données
// ... au début de votre fichier, juste avant de créer dbConfig
console.log("DEBUG: DB_HOST est", process.env.DB_HOST);
console.log("DEBUG: DB_USER est", process.env.DB_USER);

// Configuration base de données
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }, 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Création du pool de connexion
const db = mysql.createPool(dbConfig);

// Test de connexion immédiat au démarrage
db.getConnection()
    .then(connection => {
        console.log("Connexion à la base de données Aiven réussie !");
        connection.release();
    })
    .catch(err => {
        console.error("Erreur de connexion à la base de données :", err.message);
    });


// ... votre code existant
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('Service Worker enregistré avec succès !'))
    .catch((err) => console.log('Erreur enregistrement:', err));
}




// Configuration Multer pour les images
const storage = multer.diskStorage({
    destination: './uploads/cni/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });



// Initialisation des tables
async function initialiserBaseDeDonnees() {
    const tableHierarchie = `CREATE TABLE IF NOT EXISTS marches_hierarchie (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nom VARCHAR(100),
        type ENUM('ZONE', 'RELAIS', 'SOUS_MARCHE'),
        parent_id INT,
        code VARCHAR(50),
        ville VARCHAR(100),
        quartier VARCHAR(100),
        capacite_totale VARCHAR(50),
        gestionnaire VARCHAR(100),
        marchandise_entree VARCHAR(100),
        quantite_entree VARCHAR(50),
        date_entree DATETIME,
        marchandise_sortie VARCHAR(100),
        quantite_sortie VARCHAR(50),
        date_sortie DATETIME
    )`;

    const tableHistorique = `CREATE TABLE IF NOT EXISTS historique_modifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        marche_id INT,
        marchandise_entree VARCHAR(100),
        quantite_entree VARCHAR(50),
        marchandise_sortie VARCHAR(100),
        quantite_sortie VARCHAR(50),
        date_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    const tableClients = `CREATE TABLE IF NOT EXISTS clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        marche_id INT,
        nom_prenoms VARCHAR(255),
        cni VARCHAR(50),
        tel VARCHAR(20),
        localite VARCHAR(100),
        cni_file VARCHAR(255),
        variete VARCHAR(100),
        dimension VARCHAR(50),
        debut_prod DATE,
        fin_prod DATE,
        estimation DECIMAL(10, 2),
        num_recruteur VARCHAR(50)
    )`;

    // Table ajoutée pour corriger l'erreur ER_NO_TABLE_FOUND
    const tableCodes = `CREATE TABLE IF NOT EXISTS codes_recruteurs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tel VARCHAR(20) NOT NULL,
        code VARCHAR(50) NOT NULL,
        UNIQUE(tel)
    )`;

    try {
        await db.execute(tableHierarchie);
        await db.execute(tableHistorique);
        await db.execute(tableClients);
        await db.execute(tableCodes);
        console.log("Tables vérifiées/créées avec succès.");
    } catch (err) { 
        console.error("Erreur d'initialisation :", err); 
    }
}


app.listen(PORT, async () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    await initialiserBaseDeDonnees();
});



app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'accueil.html'));
});



// Routes API Marchés
app.get('/api/elements', async (req, res) => {
    try {
        const parentId = req.query.parent_id;
        let sql = "SELECT * FROM marches_hierarchie";
        let params = [];
        if (parentId && parentId !== '') { sql += " WHERE parent_id = ?"; params.push(parentId); } else { sql += " WHERE parent_id IS NULL"; }
        const [results] = await db.execute(sql, params);
        res.json(results);
    } catch (err) { res.status(500).send(err); }
});

app.get('/api/historique/:id', async (req, res) => {
    try {
        const [results] = await db.execute("SELECT * FROM historique_modifications WHERE marche_id = ? ORDER BY date_modification DESC", [req.params.id]);
        res.json(results);
    } catch (err) { res.status(500).send(err); }
});

app.post('/ajouter-element', async (req, res) => {
    try {
        const { nom, type, parent_id, code, ville, quartier, capacite_totale, gestionnaire, marchandise_entree, quantite_entree, date_entree, marchandise_sortie, quantite_sortie, date_sortie } = req.body;
        await db.execute(`INSERT INTO marches_hierarchie (nom, type, parent_id, code, ville, quartier, capacite_totale, gestionnaire, marchandise_entree, quantite_entree, date_entree, marchandise_sortie, quantite_sortie, date_sortie) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        [nom, type, parent_id, code, ville, quartier, capacite_totale, gestionnaire, marchandise_entree, quantite_entree, date_entree, marchandise_sortie, quantite_sortie, date_sortie]);
        res.status(201).send({ success: true });
    } catch (err) { res.status(500).send("Erreur : " + err.message); }
});

app.delete('/api/elements/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM marches_hierarchie WHERE id = ?', [req.params.id]);
        res.status(200).send({ success: true });
    } catch (err) { res.status(500).send({ error: "Erreur" }); }
});

app.put('/api/elements/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { nom, code, ville, quartier, capacite_totale, gestionnaire, marchandise_entree, quantite_entree, marchandise_sortie, quantite_sortie } = req.body;
        await db.execute(`UPDATE marches_hierarchie SET nom=?, code=?, ville=?, quartier=?, capacite_totale=?, gestionnaire=?, marchandise_entree=?, quantite_entree=?, marchandise_sortie=?, quantite_sortie=? WHERE id=?`, 
        [nom, code, ville, quartier, capacite_totale, gestionnaire, marchandise_entree, quantite_entree, marchandise_sortie, quantite_sortie, id]);
        await db.execute(`INSERT INTO historique_modifications (marche_id, marchandise_entree, quantite_entree, marchandise_sortie, quantite_sortie) VALUES (?, ?, ?, ?, ?)`, 
        [id, marchandise_entree, quantite_entree, marchandise_sortie, quantite_sortie]);
        res.status(200).send({ message: "Mise à jour et historique réussis." });
    } catch (err) { res.status(500).send({ error: err.message }); }
});

// Routes API Clients
app.get('/api/clients', async (req, res) => {
    try {
        const marcheId = req.query.marche_id;
        const [rows] = await db.execute("SELECT * FROM clients WHERE marche_id = ?", [marcheId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/recruter-client', upload.single('cni_file'), async (req, res) => {
    try {
        const { marche_id, nom_prenoms, cni, tel, localite, variete, dimension, debut_prod, fin_prod, estimation, num_recruteur } = req.body;
        const filePath = req.file ? `/uploads/cni/${req.file.filename}` : null;
        const sql = `INSERT INTO clients (marche_id, nom_prenoms, cni, tel, localite, cni_file, variete, dimension, debut_prod, fin_prod, estimation, num_recruteur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await db.execute(sql, [marche_id, nom_prenoms, cni, tel, localite, filePath, variete, dimension, debut_prod, fin_prod, estimation, num_recruteur]);
        res.status(201).json({ message: "Client enregistré avec succès !" });
    } catch (err) { res.status(500).json({ error: "Erreur serveur : " + err.message }); }
});


app.delete('/api/clients/supprimer/:id', async (req, res) => {
    try {
        await db.execute("DELETE FROM clients WHERE id = ?", [req.params.id]);
        res.json({ message: "Client supprimé avec succès !" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/marches', async (req, res) => {
    const [rows] = await db.execute("SELECT id, nom FROM marches_hierarchie");
    res.json(rows);
});




app.get('/api/tous-les-clients', async (req, res) => {
    const [rows] = await db.execute("SELECT id, nom_prenoms, marche_id, tel FROM clients");
    res.json(rows);
});




// Génération du code (Admin)
app.post('/api/generer-code', async (req, res) => {
    const { tel, code } = req.body;
    await db.execute("INSERT INTO codes_recruteurs (tel, code) VALUES (?, ?) ON DUPLICATE KEY UPDATE code = ?", [tel, code, code]);
    res.json({ message: "Code généré avec succès !" });
});

// Connexion du recruteur
app.post('/api/connexion-recruteur', async (req, res) => {
    const { tel, code } = req.body;
    const [rows] = await db.execute("SELECT * FROM codes_recruteurs WHERE tel = ? AND code = ?", [tel, code]);
    
    if (rows.length > 0) {
        res.json({ success: true, message: "Connexion réussie !" });
    } else {
        res.status(401).json({ success: false, message: "Numéro ou code incorrect." });
    }
});




// Route de vérification pour l'administrateur
app.post('/api/login-admin', (req, res) => {
    const { password } = req.body;

    // Vérification stricte du mot de passe
    if (password === "Lenoble123") {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Mot de passe incorrect" });
    }
});
