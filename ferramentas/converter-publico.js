#!/usr/bin/env node
/**
 * Converte um export de clientes (Cardápio Web ou qualquer CSV) para o formato
 * de lista de clientes do Meta — Públicos Personalizados.
 *
 *   node converter-publico.js entrada.csv saida.csv
 *
 * O Meta faz o hash (SHA-256) no navegador antes do envio. Este arquivo sai em
 * texto puro e NÃO deve ser enviado por e-mail nem versionado.
 */

const fs = require("fs");

const entrada = process.argv[2];
const saida = process.argv[3] || "publico-meta.csv";
if (!entrada) {
  console.error("uso: node converter-publico.js <entrada.csv> [saida.csv]");
  process.exit(1);
}

/* ---------- utilidades ---------- */
const semAcento = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const texto = (s) =>
  semAcento(String(s || "").trim().toLowerCase())
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Brasil: DDD (2) + número (8 ou 9). Sai como 55DDDNNNNNNNNN.
function telefone(v) {
  let d = String(v || "").replace(/\D/g, "");
  d = d.replace(/^0+/, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return "";
}

function email(v) {
  const e = String(v || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : "";
}

const cep = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 8 ? d : "";
};

const numero = (v) => {
  const n = parseFloat(String(v || "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? n.toFixed(2) : "";
};

/* ---------- leitura ---------- */
let bruto = fs.readFileSync(entrada, "utf8").replace(/^﻿/, "");
const primeira = bruto.split(/\r?\n/)[0];
const delim = [";", "\t", ","].sort(
  (a, b) => primeira.split(b).length - primeira.split(a).length
)[0];

function linhas(txt, d) {
  const out = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === d) { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); out.push(linha); linha = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || linha.length) { linha.push(campo); out.push(linha); }
  return out.filter((l) => l.some((c) => c.trim() !== ""));
}

const tabela = linhas(bruto, delim);
const cab = tabela[0].map((h) => texto(h).replace(/\s/g, ""));

// acha a coluna cujo cabeçalho bate com algum dos apelidos
function col(...apelidos) {
  for (const a of apelidos) {
    const i = cab.findIndex((h) => h === a);
    if (i >= 0) return i;
  }
  for (const a of apelidos) {
    const i = cab.findIndex((h) => h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}

const C = {
  nome:  col("nome", "cliente", "nomecompleto", "name"),
  fone:  col("telefone", "celular", "fone", "whatsapp", "phone", "contato"),
  mail:  col("email", "e-mail", "mail"),
  cidade:col("cidade", "city", "municipio"),
  uf:    col("uf", "estado", "state"),
  cep:   col("cep", "zip", "codigopostal"),
  valor: col("valorgasto", "totalgasto", "total", "faturamento", "valor", "ltv"),
};

console.log("delimitador: " + JSON.stringify(delim));
console.log("colunas encontradas:");
Object.entries(C).forEach(([k, v]) =>
  console.log("  " + k.padEnd(7) + (v >= 0 ? "coluna " + v + "  (" + tabela[0][v].trim() + ")" : "— não encontrada"))
);

if (C.fone < 0 && C.mail < 0) {
  console.error("\nERRO: nenhuma coluna de telefone ou e-mail. O Meta precisa de pelo menos um dos dois.");
  process.exit(1);
}

/* ---------- conversão ---------- */
const CAB = ["phone", "email", "fn", "ln", "ct", "st", "zip", "country", "value"];
const vistos = new Set();
const linhasOut = [];
let semContato = 0, dup = 0, comValor = 0;

for (let i = 1; i < tabela.length; i++) {
  const l = tabela[i];
  const get = (idx) => (idx >= 0 ? l[idx] : "");

  const ph = telefone(get(C.fone));
  const em = email(get(C.mail));
  if (!ph && !em) { semContato++; continue; }

  const chave = ph + "|" + em;
  if (vistos.has(chave)) { dup++; continue; }
  vistos.add(chave);

  const partes = texto(get(C.nome)).split(" ").filter(Boolean);
  const fn = partes[0] || "";
  const ln = partes.length > 1 ? partes[partes.length - 1] : "";
  const vl = numero(get(C.valor));
  if (vl) comValor++;

  linhasOut.push([
    ph, em, fn, ln,
    texto(get(C.cidade)).replace(/\s/g, ""),
    texto(get(C.uf)).slice(0, 2),
    cep(get(C.cep)),
    "br",
    vl,
  ]);
}

const csv = [CAB.join(","), ...linhasOut.map((l) =>
  l.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(",")
)].join("\n");

fs.writeFileSync(saida, "﻿" + csv, "utf8");

/* ---------- relatório ---------- */
const comFone = linhasOut.filter((l) => l[0]).length;
const comMail = linhasOut.filter((l) => l[1]).length;
console.log("\n--- resultado ---");
console.log("linhas lidas          ", tabela.length - 1);
console.log("descartadas sem contato", semContato);
console.log("duplicadas removidas  ", dup);
console.log("CONTATOS NA LISTA     ", linhasOut.length);
console.log("  com telefone        ", comFone, "(" + (comFone / linhasOut.length * 100).toFixed(1) + "%)");
console.log("  com e-mail          ", comMail, "(" + (comMail / linhasOut.length * 100).toFixed(1) + "%)");
console.log("  com valor gasto     ", comValor, comValor ? "→ dá para fazer Semelhante por valor" : "→ sem coluna de valor");
console.log("\narquivo:", saida);
if (linhasOut.length < 1000) {
  console.log("\nATENÇÃO: menos de 1.000 contatos. O Meta precisa de ~1.000 correspondências");
  console.log("para gerar um Semelhante. O público personalizado funciona mesmo assim.");
}
