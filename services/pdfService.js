// services/pdfService.js
const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'pdf');

/**
 * Petit helper pour éviter les crash si le champ n'existe pas
 */
function safeSetTextField(form, pdfFieldName, value) {
  try {
    const field = form.getTextField(pdfFieldName);
    field.setText(value ?? '');
  } catch (err) {
    console.warn(`⚠️ Champ PDF introuvable : "${pdfFieldName}" →`, err.message);
  }
}

/**
 * Optionnel : pour déboguer les noms de champs, mettre
 * process.env.DUMP_PDF_FIELDS = 'true'
 */
function dumpPdfFields(form) {
  try {
    const fields = form.getFields();
    console.log('===== LISTE DES CHAMPS PDF 2031-SD =====');
    fields.forEach(f => {
      console.log('PDF field:', f.getName());
    });
    console.log('=========================================');
  } catch (e) {
    console.warn('Impossible de lister les champs PDF :', e.message);
  }
}

async function fillCerfa2031(declarationId, data) {
  // 1) s'assurer que le dossier existe
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const templatePath = path.join(__dirname, '..', 'templates', '2031-sd_5015.pdf');
  const outPath     = path.join(OUTPUT_DIR, `cerfa-2031-${declarationId}.pdf`);

  // 2) charger le PDF modèle
  const pdfBytes = await fs.readFile(templatePath);
  const pdfDoc   = await PDFDocument.load(pdfBytes);
  const form     = pdfDoc.getForm();

  // Pour inspecter une fois la liste des champs :
  if (process.env.DUMP_PDF_FIELDS === 'true') {
    dumpPdfFields(form);
  }

  // 3) Remplissage des champs
  try {
    // Dénomination / nom de l’entreprise
    safeSetTextField(
      form,
      'Désignation de l entreprise', // à adapter selon les noms réels
      data.nom || data.denomination_entreprise || ''
    );

    // Adresse
    safeSetTextField(
      form,
      'Adresse_1',
      data.adresseBien || data.adresse_entreprise || ''
    );

    safeSetTextField(
      form,
      'Codepostal_1',
      String(data.codePostal || '')
    );

    safeSetTextField(
      form,
      'Ville',
      data.ville || ''
    );

    safeSetTextField(
      form,
      'SIRET',
      data.numroDeSiret || ''
    );

    safeSetTextField(
      form,
      'Annéeexercice',
      String(data.annee || '')
    );

    safeSetTextField(
      form,
      'Résultatfiscal',
      String(data.resultatFiscal || 0)
    );

  } catch (e) {
    console.warn('⚠️ Problème global avec les champs PDF (noms à vérifier) :', e.message);
  }

  // 4) Sauvegarder le PDF rempli
  const filledBytes = await pdfDoc.save();
  await fs.writeFile(outPath, filledBytes);

  return outPath;
}

module.exports = { fillCerfa2031 };
