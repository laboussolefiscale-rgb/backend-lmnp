// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');

const { createExcelFromTemplate } = require('./services/excelService');
const { fillCerfa2031 } = require('./services/pdfService');

const app = express();
app.use(cors());
app.use(express.json());

// Test simple
app.get('/ping', (req, res) => {
  res.json({ ok: true, message: 'Backend LMNP fonctionne ✅' });
});

// Servir les fichiers générés (PDF / Excel)
app.use('/public', express.static(path.join(__dirname, 'public')));

// Endpoint qui sera appelé par Wix
app.post('/api/lmnp', async (req, res) => {
  try {
    const { declarationId, data } = req.body;

    if (!declarationId || !data) {
      return res.status(400).json({ error: 'declarationId ou data manquants' });
    }

    // 1) Générer l’Excel
    const excelPath = await createExcelFromTemplate(declarationId, data);

    // 2) Générer le PDF CERFA
    const pdfPath = await fillCerfa2031(declarationId, data);

    // 3) Construire les URLs à renvoyer
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const pdfUrl   = `${baseUrl}/public/pdf/${path.basename(pdfPath)}`;
    const excelUrl = `${baseUrl}/public/excel/${path.basename(excelPath)}`;

    res.json({ ok: true, pdfUrl, excelUrl });
  } catch (err) {
    console.error('Erreur /api/lmnp :', err);
    res.status(500).json({ ok: false, error: 'Erreur interne LMNP' });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Backend LMNP démarré sur le port ${PORT}`);
});

