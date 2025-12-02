// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { createExcelFromTemplate } = require('./services/excelService');
const { fillCerfa2031 } = require('./services/pdfService');

const app = express();

// ================== CONFIG GÉNÉRALE ==================
app.use(cors());
app.use(express.json());

// URL de base : Render en prod, localhost en dev
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
console.log('✅ BASE_URL utilisée pour les fichiers :', BASE_URL);

// Clé API pour sécuriser les appels "backend" (POST /api/lmnp)
const API_KEY = process.env.API_KEY;

// ================== STOCKAGE DES LIENS TÉLÉCHARGEMENT ==================
// On garde en mémoire la liste des fichiers téléchargeables pendant 5 minutes
// Map<token, { filePath, type: 'pdf' | 'excel', expiresAt: number }>
const activeDownloads = new Map();

/**
 * Enregistre un fichier comme téléchargeable pendant quelques minutes,
 * retourne un token à mettre dans l’URL.
 */
function registerDownload(filePath, type) {
  const token = crypto.randomBytes(24).toString('hex'); // token aléatoire
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  activeDownloads.set(token, { filePath, type, expiresAt });

  // Nettoyage automatique après expiration
  setTimeout(() => {
    activeDownloads.delete(token);
  }, 5 * 60 * 1000);

  return token;
}

// Fonction utilitaire : suppression différée d’un fichier sur le disque
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

// ================== MIDDLEWARE SÉCURITÉ ==================

/**
 * Middleware d’authentification par clé API pour les routes SENSIBLES
 * (ex: POST /api/lmnp).
 *
 * ❗ On NE l’applique PAS aux routes de téléchargement, sinon le navigateur
 *    ne pourrait pas récupérer le PDF directement via un lien.
 */
function apiKeyMiddleware(req, res, next) {
  const keyFromHeader = req.headers['x-api-key'];

  console.log('[API KEY DEBUG] path =', req.path);
  console.log('[API KEY DEBUG] header =', keyFromHeader);

  if (!API_KEY) {
    console.warn('⚠️ Avertissement : aucune API_KEY définie en variable d’environnement.');
    return res.status(500).json({
      ok: false,
      error: 'Configuration serveur incomplète',
    });
  }

  if (!keyFromHeader || keyFromHeader !== API_KEY) {
    return res.status(401).json({
      ok: false,
      error: 'Accès non autorisé',
    });
  }

  next();
}

// ================== ROUTES ==================

// Simple health-check
app.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Backend LMNP fonctionne ✅' });
});

// ⚠️ IMPORTANT : on NE fait PLUS ça :
// app.use('/public', express.static(path.join(__dirname, 'public')));
// -> le dossier public N’EST PLUS directement accessible par URL
// -> les téléchargements se font uniquement via /api/download/... (Option B)

/**
 * Route principale appelée par Wix pour générer Excel + PDF
 * Protégée par la clé API
 */
app.post('/api/lmnp', apiKeyMiddleware, async (req, res) => {
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

    // 3) Enregistrer les fichiers comme "téléchargeables" (tokens)
    const pdfToken = registerDownload(pdfPath, 'pdf');
    const excelToken = registerDownload(excelPath, 'excel');

    // 4) Construire les URLs "protégées" à renvoyer à Wix
    const pdfUrl = `${BASE_URL}/api/download/pdf/${pdfToken}`;
    const excelUrl = `${BASE_URL}/api/download/excel/${excelToken}`;

    console.log('✅ Liens de téléchargement générés :', { pdfUrl, excelUrl });

    // 5) Réponse à Wix
    res.json({
      ok: true,
      pdfUrl,
      excelUrl,
    });

    // 6) Suppression automatique des fichiers après 5 minutes
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

/**
 * Route de téléchargement authentifié (Option B)
 * Exemple d’URL : /api/download/pdf/<token>
 *
 * On vérifie :
 *  - que le token existe
 *  - qu’il n’est pas expiré
 *  - que le type (pdf/excel) correspond
 */
app.get('/api/download/:type/:token', async (req, res) => {
  try {
    const { type, token } = req.params;

    if (type !== 'pdf' && type !== 'excel') {
      return res.status(400).json({ ok: false, error: 'Type de fichier invalide' });
    }

    const info = activeDownloads.get(token);

    if (!info) {
      return res.status(404).json({ ok: false, error: 'Lien de téléchargement invalide ou expiré' });
    }

    if (info.type !== type) {
      return res.status(400).json({ ok: false, error: 'Type de fichier non correspondant' });
    }

    if (Date.now() > info.expiresAt) {
      activeDownloads.delete(token);
      return res.status(410).json({ ok: false, error: 'Lien de téléchargement expiré' });
    }

    const absolutePath = info.filePath;
    const filename = path.basename(absolutePath);

    console.log(`📤 Téléchargement ${type} demandé :`, filename);

    res.download(absolutePath, filename, (err) => {
      if (err) {
        console.error('❌ Erreur lors de l’envoi du fichier :', err.message);
        if (!res.headersSent) {
          return res.status(500).json({ ok: false, error: 'Erreur lors du téléchargement' });
        }
      }
    });
  } catch (err) {
    console.error('❌ Erreur /api/download :', err.message);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'Erreur interne lors du téléchargement' });
    }
  }
});

// ================== LANCEMENT DU SERVEUR ==================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Backend LMNP démarré sur le port ${PORT}`);
  console.log(`🌍 BASE_URL courante : ${BASE_URL}`);
});
