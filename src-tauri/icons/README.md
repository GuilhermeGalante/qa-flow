# Proveniência dos ícones

`app-icon.svg` é a fonte vetorial canônica dos ícones do QA Flow Desktop.

Os artefatos Windows referenciados por `tauri.conf.json` — `32x32.png`,
`128x128.png`, `128x128@2x.png` e `icon.ico` — foram derivados dessa fonte em
2026-08-29 com a Tauri CLI 2.11.4:

```powershell
npm exec tauri icon -- src-tauri/icons/app-icon.svg
```

Não edite os rasters manualmente. Para alterar a identidade visual, atualize
`app-icon.svg` e execute novamente o comando com a versão de CLI fixada no
`package-lock.json`.
