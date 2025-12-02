// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { createExcelFromTemplate } = require('./services/excelService');
const { fillCerfa2031 } = require('./services/pdfService');

const app = express();

// ================== CONFIG GÉNÉRALE ==================
app.use(cors());
app.use(express.json());

// URL de base : Render en prod, localhost en dev
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
console.log('✅ BASE_URL utilisée pour les fichiers :', BASE_URL);

// Clé API pour sécuriser les appels (envoyée par Wix)
const API_KEY = process.env.API_KEY;

// ================== MIDDLEWARE SÉCURITÉ ==================

// Middleware d'authentification par clé API
function apiKeyMiddleware(req, res, next) {
  // On laisse /ping accessible sans clé pour le health-check
  if (req.path === '/ping') {
    return next();
  }

  const keyFromHeader = req.headers['x-api-key'];

  // 🔍 LOG DEBUG pour comprendre ce qui se passe
  console.log('[API KEY DEBUG] path  =', req.path);
  console.log('[API KEY DEBUG] header=', keyFromHeader);
  console.log('[API KEY DEBUG] env   =', API_KEY);

  if (!API_KEY) {
    console.warn('⚠️ Avertissement : aucune API_KEY définie en variable d’environnement.');
    return res.status(500).json({
      ok: false,
      error: 'Configuration serveur incomplète',
    });
  }

  if (!keyFromHeader || keyFromHeader !== API_KEY) {
    console.warn('[API KEY DEBUG] Mismatch / clé absente → 401');
    return res.status(401).json({
      ok: false,
      error: 'Accès non autorisé',
    });
  }

  console.log('[API KEY DEBUG] Accès autorisé ✅');
  next();
}

// On applique le middleware à toutes les routes (sauf /ping, géré plus haut)
app.use(apiKeyMiddleware);

// ================== ROUTES ==================

// Simple health-check
app.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Backend LMNP fonctionne ✅' });
});

// Servir les fichiers générés (PDF / Excel)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Fonction utilitaire : suppression différée d’un fichier
function scheduleFileDeletion(filePath, delayMs = 5 * 60 * 1000) {
  if (!filePath) return;
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.warn('⚠️ Impossible de supprimer le fichier :', filePath, err.message);
      } else {
        console.log('🗑️ Fichier supprimé :', filePath);
      }
    });
  }, delayMs);
}

// Endpoint appelé par Wix
app.post('/api/lmnp', async (req, res) => {
  try {
    const { declarationId, data } = req.body;

    if (!declarationId || !data) {
      return res
        .status(400)
        .json({ ok: false, error: 'declarationId ou data manquants' });
    }

    // ⚠️ RGPD : on ne log PAS les données personnelles
    console.log('📩 Requête /api/lmnp pour déclaration :', declarationId);

    // 1) Générer l’Excel
    const excelPath = await createExcelFromTemplate(declarationId, data);

    // 2) Générer le PDF CERFA
    const pdfPath = await fillCerfa2031(declarationId, data);

    // 3) Construire les URLs publiques à renvoyer à Wix
    const pdfFilename = path.basename(pdfPath);
    const excelFilename = path.basename(excelPath);

    const pdfUrl = `${BASE_URL}/public/pdf/${pdfFilename}`;
    const excelUrl = `${BASE_URL}/public/excel/${excelFilename}`;

    console.log('✅ Fichiers générés (URLs) :', { pdfUrl, excelUrl });

    // 4) Réponse à Wix
    res.json({
      ok: true,
      pdfUrl,
      excelUrl,
    });

    // 5) Suppression automatique des fichiers après 5 minutes
    scheduleFileDeletion(pdfPath);
    scheduleFileDeletion(excelPath);
  } catch (err) {
    console.error('❌ Erreur /api/lmnp :', err.message);
    res.status(500).json({
      ok: false,
      error: 'Erreur interne LMNP',
    });
  }
});

// ================== LANCEMENT DU SERVEUR ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Backend LMNP démarré sur le port ${PORT}`);
  console.log(`🌍 BASE_URL courante : ${BASE_URL}`);
});
