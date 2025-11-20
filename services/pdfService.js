// services/pdfService.js
const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'pdf');

async function fillCerfa2031(declarationId, data) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const templatePath = path.join(__dirname, '..', 'templates', '2031-sd_5015.pdf');
  const outPath = path.join(OUTPUT_DIR, `cerfa-2031-${declarationId}.pdf`);

  const pdfBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();

  // ⚠️ Les noms ici doivent correspondre aux noms des champs du formulaire PDF
  // (à définir dans Acrobat ou un autre éditeur de formulaire)
  try {
    form.getTextField('denomination_entreprise').setText(data.nom || '');
    form.getTextField('prenom_exploitant').setText(data.prenom || '');
    form.getTextField('adresse_entreprise').setText(data.adresseBien || '');
    form.getTextField('code_postal').setText(String(data.codePostal || ''));
    form.getTextField('ville').setText(data.ville || '');
    form.getTextField('siret').setText(data.numroDeSiret || '');
    form.getTextField('exercice_annee').setText(String(data.annee || ''));
    form.getTextField('resultat_fiscal').setText(String(data.resultatFiscal || 0));
  } catch (e) {
    console.warn('⚠️ Problème avec les champs PDF (noms à vérifier) :', e.message);
  }

  const filledBytes = await pdfDoc.save();
  await fs.writeFile(outPath, filledBytes);

  return outPath;
}

module.exports = { fillCerfa2031 };
