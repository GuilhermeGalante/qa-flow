import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve("schemas");
const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
if (files.length < 4) throw new Error("Esperados ao menos quatro schemas JSON.");
for (const file of files) {
  const schema = JSON.parse(await readFile(resolve(directory, file), "utf8"));
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") throw new Error(`${file}: draft inválido.`);
  if (!schema.$id || !schema.title || schema.type !== "object") throw new Error(`${file}: metadados obrigatórios ausentes.`);
}
console.log(`${files.length} schemas JSON verificados.`);
