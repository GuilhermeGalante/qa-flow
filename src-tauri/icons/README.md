# Proveniência dos ícones

`../../public/qa-flow-logo.png` é a fonte canônica dos ícones e da identidade
visual do QA Flow.

Os artefatos multiplataforma desta pasta, incluindo os arquivos Windows
referenciados por `tauri.conf.json`, foram derivados dessa fonte com a Tauri
CLI fixada no `package-lock.json`:

```powershell
npm exec tauri icon -- public/qa-flow-logo.png
```

Não edite os rasters manualmente. Para alterar a identidade visual, substitua
`public/qa-flow-logo.png` e execute novamente o comando acima.
