// services/excelService.js
const fs = require('fs/promises');
const path = require('path');
const XLSX = require('xlsx');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'excel');

async function createExcelFromTemplate(declarationId, data) {
  // S'assurer que le dossier de sortie existe
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const templatePath = path.join(__dirname, '..', 'templates', 'modele-lmnp.xlsx');
  const outPath = path.join(OUTPUT_DIR, `lmnp-${declarationId}.xlsx`);

  // 1. Copier le modèle vers un nouveau fichier
  await fs.copyFile(templatePath, outPath);

  // 2. Ouvrir le fichier Excel copié
  const wb = XLSX.readFile(outPath);

  // ⚠️ Adapter ces noms d’onglets / cellules à ton Excel réel
  const idSheet    = wb.Sheets['Identification'];
  const recapSheet = wb.Sheets['Recap'] || wb.Sheets['Recapitulatif'];

  const set = (sheet, addr, value) => {
    if (!sheet || !addr) return;
    sheet[addr] = sheet[addr] || {};
    sheet[addr].v = value;
    sheet[addr].t = typeof value === 'number' ? 'n' : 's';
  };

  // --- Exemple de remplissage : onglet "Identification" ---
  if (idSheet) {
    set(idSheet, 'B1', data.prenom || '');
    set(idSheet, 'B2', data.nom || '');
    set(idSheet, 'B4', data.adresseBien || '');
    set(idSheet, 'B5', data.codePostal || '');
    set(idSheet, 'B6', data.ville || '');
    set(idSheet, 'B8', data.annee || '');
  }

  // --- Exemple de remplissage : onglet "Recap" ---
  if (recapSheet) {
    set(recapSheet, 'B1', data.loyersEncaisses || 0);      // Recettes
    set(recapSheet, 'C1', data.totalCharges   || 0);       // Charges
    set(recapSheet, 'E1', data.amortissementAnnuels || 0); // Amortissements
    set(recapSheet, 'F1', data.resultatFiscal || 0);       // Résultat final
  }

  // 3. Sauvegarder
  XLSX.writeFile(wb, outPath);

  // On renvoie le chemin du fichier
  return outPath;
}

module.exports = { createExcelFromTemplate };
