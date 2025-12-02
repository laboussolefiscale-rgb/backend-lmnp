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
  const outPath      = path.join(OUTPUT_DIR, `cerfa-2031-${declarationId}.pdf`);

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
    // --------------------------------------------------
    //  BLOC IDENTIFICATION
    // --------------------------------------------------

    // Dénomination de l’entreprise
    // 👉 À adapter : mets ici le nom/prénom du loueur si tu as un champ dédié.
    safeSetTextField(
      form,
      'Dénominationdelentreprise',
      data.titre || `Location meublée ${data.annee || ''}`
    );

    // Adresse de l'entreprise / du bien
    safeSetTextField(
      form,
      'Adressedelentreprise',
      `${data.adresseBien || ''} ${data.codePostal || ''} ${data.ville || ''}`.trim()
    );

    // Email
    safeSetTextField(
      form,
      'Mél',
      data.dernierUtilisateurEmail || ''
    );

    // SIRET (si tu as bien un champ de ce nom dans Acrobat :
    // vérifie le nom exact dans les logs ou la colonne de droite)
    safeSetTextField(
      form,
      'SIRET',
      data.numroDeSiret || ''
    );

    // Année d'exercice (champ à ajuster selon son nom exact dans le PDF)
    safeSetTextField(
      form,
      'Annéeexercice',
      String(data.annee || '')
    );

    // --------------------------------------------------
    //  BLOC RÉSULTAT / RÉCAPITULATIF
    // --------------------------------------------------

    // Résultat fiscal ligne 1 (colonne 3) – nom de champ vu dans ta liste
    safeSetTextField(
      form,
      'Tab1col3 Total',
      String(data.resultatFiscal || 0)
    );

    // Tu peux aussi renseigner d’autres colonnes, par ex. bénéfice imposable :
    safeSetTextField(
      form,
      'Tab1col4 Bénéfice imposable col1col2ouDéficit déductible col1col2',
      String(data.resultatFiscal || 0)
    );

    // Exemple : total loyers (si tu veux les afficher quelque part dans le formulaire)
    // (à condition d’avoir créé un champ dédié dans le PDF, par ex. "TotalLoyers")
    // safeSetTextField(form, 'TotalLoyers', String(data.loyersEncaisses || 0));

    // Exemple : total charges
    // safeSetTextField(form, 'TotalCharges', String(data.totalCharges || 0));

    // Exemple : intérêts
    // safeSetTextField(form, 'TotalInterets', String(data.totalInterets || 0));

  } catch (e) {
    console.warn('⚠️ Problème global avec les champs PDF (noms à vérifier) :', e.message);
  }

  // 4) Sauvegarder le PDF rempli
  const filledBytes = await pdfDoc.save();
  await fs.writeFile(outPath, filledBytes);

  return outPath;
}

module.exports = { fillCerfa2031 };
